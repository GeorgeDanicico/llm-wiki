"""Tests for the study site's progress server (server/progress_server.py).

Each test starts the server on an ephemeral port with a temporary database and
site directory. Run with: python3 -m unittest discover -s tests
"""

from __future__ import annotations

import hashlib
import http.client
import json
import os
import secrets
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "server"))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import progress_server as ps  # noqa: E402
from question_bank import ID_PATTERN  # noqa: E402

PHONE = "phone-token-for-tests-only"
LAPTOP = "laptop-token-for-tests-only"


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def review(row_id="s1:REL-CA-002", at="2026-10-21T10:00:00.000+02:00", knew=1, **extra):
    return {"id": row_id, "card": "REL-CA-002", "at": at, "day": at[:10], "mode": "daily", "knew": knew, "box": None, **extra}


class ServerTest(unittest.TestCase):
    trust_proxy = False

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.site = root / "site"
        (self.site / "js").mkdir(parents=True)
        (self.site / "index.html").write_text("<!doctype html><title>Study</title>")
        (self.site / "js" / "main.js").write_text("export {};")
        (self.site / "manifest.webmanifest").write_text("{}")
        (root / "secret.txt").write_text("outside the site")
        self.logs: list[str] = []
        self.config = ps.Config(
            db=root / "data" / "progress.db",
            backup_dir=root / "data" / "backups",
            tokens={"phone": digest(PHONE), "laptop": digest(LAPTOP)},
            trust_proxy=self.trust_proxy,
            site_dir=self.site,
            host="127.0.0.1",
            port=0,
        )
        self.server = ps.ProgressServer(self.config, log=self.logs.append)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, args=(0.05,), daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(5)
        self.tmp.cleanup()

    def request(self, method, path, body=None, token=None, headers=None, raw=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        sent = dict(headers or {})
        if token:
            sent["Authorization"] = f"Bearer {token}"
        payload = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        if payload is not None:
            sent.setdefault("Content-Type", "application/json")
        conn.request(method, path, body=payload, headers=sent)
        response = conn.getresponse()
        data = response.read()
        conn.close()
        parsed = None
        if response.getheader("Content-Type", "").startswith("application/json"):
            parsed = json.loads(data)
        return response, parsed if parsed is not None else data

    def sync(self, body, token=PHONE, **kwargs):
        return self.request("POST", "/api/sync", body, token=token, **kwargs)

    def rows(self, table):
        with sqlite3.connect(self.config.db) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute(f"SELECT * FROM {table} ORDER BY seq")]


class HealthAndAuthTest(ServerTest):
    def test_health_needs_no_token(self):
        response, body = self.request("GET", "/api/health")
        self.assertEqual(response.status, 200)
        self.assertEqual(body, {"ok": True, "schema": 1})
        self.assertEqual(response.getheader("Cache-Control"), "no-store")
        self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))

    def test_sync_without_or_with_a_wrong_token_is_401(self):
        response, _ = self.sync({"since": 0})
        self.assertEqual(response.status, 200)
        for token in (None, "wrong-token"):
            response, body = self.sync({"since": 0}, token=token)
            self.assertEqual(response.status, 401)
            self.assertIn("error", body)
        response, _ = self.request("GET", "/api/export", headers={"Authorization": "Basic abc"})
        self.assertEqual(response.status, 401)

    def test_repeated_failures_are_rate_limited(self):
        for _ in range(ps.MAX_FAILURES):
            self.assertEqual(self.sync({}, token="wrong")[0].status, 401)
        response, _ = self.sync({}, token="wrong")
        self.assertEqual(response.status, 429)
        self.assertTrue(response.getheader("Retry-After"))
        # A valid token is refused too while the address is blocked.
        self.assertEqual(self.sync({}, token=PHONE)[0].status, 429)

    def test_forwarded_for_is_ignored_unless_trusted(self):
        for number in range(ps.MAX_FAILURES + 1):
            response, _ = self.sync({}, token="wrong", headers={"X-Forwarded-For": f"10.0.0.{number}"})
        self.assertEqual(response.status, 429)

    def test_tokens_never_reach_the_log(self):
        self.sync({"since": 0, "reviews": [review()]})
        self.sync({}, token="a-wrong-secret")
        log = "\n".join(self.logs)
        self.assertNotIn(PHONE, log)
        self.assertNotIn("a-wrong-secret", log)
        self.assertIn("POST /api/sync 200 phone", log)

    def test_unconfigured_sync_is_503(self):
        self.server.config.tokens = {}
        self.assertEqual(self.sync({}, token=PHONE)[0].status, 503)

    def test_token_hash_parsing(self):
        self.assertEqual(ps.parse_token_hashes(f"phone:{digest(PHONE)}, laptop:{digest(LAPTOP).upper()}"),
                         {"phone": digest(PHONE), "laptop": digest(LAPTOP)})
        self.assertEqual(ps.parse_token_hashes(""), {})
        for bad in ("phone", f"phone:{PHONE}", f"bad name:{digest(PHONE)}", f"a:{digest(PHONE)},a:{digest(LAPTOP)}"):
            with self.assertRaises(ValueError) as caught:
                ps.parse_token_hashes(bad)
            self.assertNotIn(PHONE, str(caught.exception))

    def test_raw_token_entry_is_named(self):
        token = secrets.token_urlsafe(32)
        with self.assertRaises(ValueError) as caught:
            ps.parse_token_hashes(f"phone:{digest(PHONE)},laptop:{token}")
        message = str(caught.exception)
        self.assertIn("entry 2 ('laptop') holds a raw token", message)
        self.assertNotIn(token, message)
        self.assertNotIn(token.lower(), message)

    def test_new_device_token_script(self):
        script = REPO_ROOT / "scripts" / "new_device_token.py"
        output = subprocess.run([sys.executable, script, "tablet"], capture_output=True, text=True, check=True).stdout
        token = output.splitlines()[1].strip()
        line = output.splitlines()[3].strip()
        self.assertEqual(line, f"tablet:{digest(token)}")
        self.assertEqual(ps.parse_token_hashes(line), {"tablet": digest(token)})
        hashed = subprocess.run([sys.executable, script, "--hash-only", "tablet"], input=f"{token}\n",
                                capture_output=True, text=True, check=True).stdout
        self.assertEqual(hashed.strip(), line)
        rejected = subprocess.run([sys.executable, script, "bad name"], capture_output=True, text=True)
        self.assertNotEqual(rejected.returncode, 0)


class TrustedProxyTest(ServerTest):
    trust_proxy = True

    def test_forwarded_for_separates_clients_when_trusted(self):
        for number in range(ps.MAX_FAILURES + 1):
            response, _ = self.sync({}, token="wrong", headers={"X-Forwarded-For": f"203.0.113.9, 10.0.0.{number}"})
            self.assertEqual(response.status, 401)
        for _ in range(ps.MAX_FAILURES):
            self.sync({}, token="wrong", headers={"X-Forwarded-For": "10.0.0.200"})
        self.assertEqual(self.sync({}, token="wrong", headers={"X-Forwarded-For": "10.0.0.200"})[0].status, 429)
        self.assertEqual(self.sync({}, headers={"X-Forwarded-For": "10.0.0.201"})[0].status, 200)


class SyncTest(ServerTest):
    def test_rows_are_stored_with_the_device_name(self):
        page = {"path": "wiki/reliability/cache-aside.md", "learned": 1, "at": "2026-10-21T10:00:00.000+02:00"}
        setting = {"key": "dailySize", "value": "15", "at": "2026-10-21T10:00:00.000+02:00"}
        response, body = self.sync({"since": 0, "reviews": [review(device="spoofed")], "pages": [page], "settings": [setting]})
        self.assertEqual(response.status, 200)
        self.assertEqual(body["seq"], 3)
        self.assertEqual(body["device"], "phone")
        self.assertFalse(body["more"])
        self.assertEqual(body["reviews"][0]["device"], "phone")
        self.assertEqual(body["pages"], [page])
        self.assertEqual(body["settings"], [setting])
        self.assertEqual(self.rows("reviews")[0]["device"], "phone")

    def test_the_same_batch_twice_is_idempotent(self):
        batch = {"since": 0, "reviews": [review(), review("s1:REL-CA-003", knew=0) | {"card": "REL-CA-003"}]}
        first = self.sync(batch)[1]
        second = self.sync(batch | {"since": first["seq"]})[1]
        self.assertEqual(second["seq"], first["seq"])
        self.assertEqual(second["reviews"], [])
        self.assertEqual(len(self.rows("reviews")), 2)

    def test_an_older_at_never_overwrites_a_newer_row(self):
        self.sync({"reviews": [review(at="2026-10-21T10:00:05.000+02:00", knew=1)]})
        # Older, as an instant, even though the string sorts later.
        self.sync({"reviews": [review(at="2026-10-21T11:00:00.000+05:00", knew=0)]}, token=LAPTOP)
        # Same instant written differently: a tie keeps the existing row.
        self.sync({"reviews": [review(at="2026-10-21T08:00:05.000+00:00", knew=0)]}, token=LAPTOP)
        [row] = self.rows("reviews")
        self.assertEqual((row["knew"], row["device"], row["seq"]), (1, "phone", 1))
        self.sync({"reviews": [review(at="2026-10-21T10:00:06.000+02:00", knew=0)]}, token=LAPTOP)
        [row] = self.rows("reviews")
        self.assertEqual((row["knew"], row["device"], row["seq"]), (0, "laptop", 2))

    def test_ties_keep_the_existing_page(self):
        at = "2026-01-01T09:00:00.000+01:00"
        self.sync({"pages": [{"path": "wiki/a/b.md", "learned": 1, "at": at}]})
        self.sync({"pages": [{"path": "wiki/a/b.md", "learned": 0, "at": at}]}, token=LAPTOP)
        self.assertEqual(self.rows("pages")[0]["learned"], 1)

    def test_since_returns_only_newer_rows(self):
        first = self.sync({"reviews": [review("a:REL-CA-002")]})[1]
        self.sync({"reviews": [review("b:REL-CA-002")]}, token=LAPTOP)
        response, body = self.sync({"since": first["seq"]})
        self.assertEqual([row["id"] for row in body["reviews"]], ["b:REL-CA-002"])
        self.assertEqual(body["seq"], 2)
        self.assertEqual(self.sync({"since": 2})[1]["reviews"], [])

    def test_large_pulls_are_paged(self):
        old = ps.PAGE_ROWS
        ps.PAGE_ROWS = 2
        try:
            self.sync({"reviews": [review(f"s:{n}") for n in range(5)]})
            body = self.sync({"since": 0})[1]
            self.assertEqual((len(body["reviews"]), body["seq"], body["more"]), (2, 2, True))
            body = self.sync({"since": 4})[1]
            self.assertEqual((len(body["reviews"]), body["seq"], body["more"]), (1, 5, False))
        finally:
            ps.PAGE_ROWS = old

    def test_export_returns_every_row(self):
        self.sync({"reviews": [review()], "settings": [{"key": "practiceTopics", "value": '["reliability"]', "at": "2026-10-21T10:00:00Z"}]})
        response, body = self.request("GET", "/api/export", token=LAPTOP)
        self.assertEqual(response.status, 200)
        self.assertEqual(body["format"], "llm-wiki-study")
        self.assertEqual(len(body["reviews"]), 1)
        self.assertEqual(body["settings"][0]["key"], "practiceTopics")
        self.assertEqual(self.request("POST", "/api/export", {}, token=LAPTOP)[0].status, 405)

    def test_validation_errors_write_nothing(self):
        good = review()
        bad_rows = [
            {"reviews": [good, review(card="not-a-card") | {"card": "rel-1"}]},
            {"reviews": [good, review() | {"day": "2026-13-45"}]},
            {"reviews": [good, review(at="2026-10-21T10:00:00")]},
            {"reviews": [good, review() | {"mode": "cram"}]},
            {"reviews": [good, review() | {"knew": True}]},
            {"reviews": [good, review() | {"box": 2}]},
            {"reviews": [good, review() | {"mode": "baseline", "knew": None, "box": 6}]},
            {"reviews": [good, review() | {"id": "x" * 121}]},
            {"reviews": [good], "pages": [{"path": "notes/a.md", "learned": 1, "at": good["at"]}]},
            {"reviews": [good], "pages": [{"path": "wiki/../a.md", "learned": 1, "at": good["at"]}]},
            {"reviews": [good], "settings": [{"key": "theme", "value": '"dark"', "at": good["at"]}]},
            {"reviews": [good], "settings": [{"key": "dailySize", "value": "500", "at": good["at"]}]},
            {"reviews": [good], "settings": [{"key": "practiceOrder", "value": '"random"', "at": good["at"]}]},
            {"reviews": [good], "settings": [{"key": "onlyLearnedPages", "value": "1", "at": good["at"]}]},
            {"reviews": [good], "settings": [{"key": "dailyGoal", "value": "{", "at": good["at"]}]},
            {"reviews": [good] * (ps.MAX_ROWS + 1)},
            {"reviews": "nope"},
            {"since": -1},
            [],
        ]
        for body in bad_rows:
            response, payload = self.sync(body)
            self.assertEqual(response.status, 400, body if len(str(body)) < 300 else "too many rows")
            self.assertIn("error", payload)
        response, _ = self.sync(None, raw=b"{not json")
        self.assertEqual(response.status, 400)
        self.assertEqual(self.rows("reviews"), [])

    def test_valid_settings_and_baselines_are_accepted(self):
        at = "2026-10-21T10:00:00.000-05:00"
        settings = [
            {"key": "dailySize", "value": "12", "at": at},
            {"key": "newPerDay", "value": "0", "at": at},
            {"key": "dailyGoal", "value": "200", "at": at},
            {"key": "practiceTopics", "value": "null", "at": at},
            {"key": "practiceOrder", "value": '"weakest"', "at": at},
            {"key": "onlyLearnedPages", "value": "false", "at": at},
        ]
        baseline = review("baseline:REL-CA-002", mode="baseline") | {"knew": None, "box": 3}
        response, body = self.sync({"reviews": [baseline], "settings": settings})
        self.assertEqual(response.status, 200, body)
        self.assertEqual(len(self.rows("settings")), 6)

    def test_oversized_and_malformed_bodies(self):
        for headers, status in (({"Content-Length": str(ps.MAX_BODY + 1)}, 413), ({}, 411)):
            # Headers only: the server answers before reading any body.
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
            conn.putrequest("POST", "/api/sync")
            conn.putheader("Authorization", f"Bearer {PHONE}")
            for name, value in headers.items():
                conn.putheader(name, value)
            conn.endheaders()
            self.assertEqual(conn.getresponse().status, status)
            conn.close()

    def test_card_pattern_matches_the_question_bank(self):
        self.assertEqual(ps.ID_PATTERN, ID_PATTERN)

    def test_setting_keys_match_the_browser_store(self):
        store = (REPO_ROOT / "site" / "js" / "lib" / "store.js").read_text(encoding="utf-8")
        defaults = store.split("export const DEFAULT_SETTINGS = {", 1)[1].split("};", 1)[0]
        keys = [line.split(":")[0].strip() for line in defaults.splitlines() if ":" in line and not line.strip().startswith("//")]
        self.assertEqual(sorted(keys), sorted(ps.SETTING_KEYS))
        for key, (low, high) in ps.INT_SETTINGS.items():
            self.assertIn(f"{key}: [{low}, {high}]", store)


class StaticAndBackupTest(ServerTest):
    def test_static_files_have_security_headers(self):
        response, body = self.request("GET", "/")
        self.assertEqual(response.status, 200)
        self.assertIn(b"<title>Study</title>", body)
        csp = response.getheader("Content-Security-Policy")
        self.assertIn("default-src 'self'", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(response.getheader("Referrer-Policy"), "no-referrer")
        self.assertEqual(response.getheader("Cache-Control"), "no-cache")
        response, _ = self.request("GET", "/js/main.js")
        self.assertEqual(response.getheader("Content-Type"), "text/javascript")
        self.assertEqual(response.getheader("Server"), "llm-wiki-study")
        response, _ = self.request("GET", "/manifest.webmanifest")
        self.assertEqual(response.getheader("Content-Type"), "application/manifest+json")
        # Error responses carry the headers too.
        response, _ = self.request("GET", "/missing.js")
        self.assertEqual(response.status, 404)
        self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")

    def test_paths_outside_the_site_are_rejected(self):
        os.symlink(Path(self.tmp.name) / "secret.txt", self.site / "link.txt")
        for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/js/..%2f..%2fsecret.txt", "/link.txt", "/js/"):
            response, body = self.request("GET", path)
            self.assertEqual(response.status, 404, path)
            self.assertNotIn(b"outside the site", body)
        self.assertEqual(self.request("GET", "/api/nothing")[0].status, 404)
        self.assertEqual(self.request("POST", "/index.html", {})[0].status, 405)

    def test_snapshot_is_created_and_old_ones_pruned(self):
        self.sync({"reviews": [review()]})
        backups = self.config.backup_dir
        backups.mkdir(parents=True)
        for day in range(1, 6):
            (backups / f"progress-2026-01-0{day}.db").write_bytes(b"old")
        (backups / "unrelated.txt").write_text("kept")
        created = self.server.db.snapshot(backups, keep=3, today=date(2026, 10, 21))
        self.assertEqual(created, backups / "progress-2026-10-21.db")
        names = sorted(path.name for path in backups.iterdir())
        self.assertEqual(names, ["progress-2026-01-04.db", "progress-2026-01-05.db", "progress-2026-10-21.db", "unrelated.txt"])
        with sqlite3.connect(created) as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM reviews").fetchone()[0], 1)
        # Today's snapshot exists: nothing new is written.
        self.assertIsNone(self.server.db.snapshot(backups, keep=3, today=date(2026, 10, 21)))

    def test_reopening_keeps_data_and_schema(self):
        self.sync({"reviews": [review()]})
        db = ps.ProgressDB(self.config.db)
        try:
            self.assertEqual(db.conn.execute("PRAGMA user_version").fetchone()[0], 1)
            self.assertEqual(db.conn.execute("PRAGMA journal_mode").fetchone()[0], "wal")
            self.assertEqual(len(db.export()["reviews"]), 1)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
