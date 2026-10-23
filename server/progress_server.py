#!/usr/bin/env python3
"""Progress server for the LLM Wiki study site (Python standard library only).

Serves the built site from SITE_DIR and keeps review progress in SQLite, so
every device shares one review log, schedule, and streak:

  GET  /api/health   no auth; {"ok": true, "schema": 1}
  POST /api/sync     bearer token; push local rows, pull rows changed since a cursor
  GET  /api/export   bearer token; every row, in the app's export format
  GET  /...          static files from SITE_DIR

Rows are the browser's records (reviews, pages, settings). Every accepted row
gets the next value of a global change counter, `seq`, so a client asks for
"everything changed since N". Merge rule: the row with the newer `at` instant
wins; ties keep the existing row, so sending a batch twice changes nothing.

Configuration (environment variables):

  PROGRESS_DB            /data/progress.db   database file
  PROGRESS_BACKUP_DIR    /data/backups       daily VACUUM INTO snapshots
  PROGRESS_BACKUP_KEEP   30                  snapshots to keep
  PROGRESS_TOKEN_HASHES  (unset)             "name:sha256hex,name:sha256hex"; unset disables sync
  PROGRESS_TRUST_PROXY   0                   1: rate-limit by X-Forwarded-For (only behind the local proxy)
  SITE_DIR               /app/_site          static files
  PORT                   8000                listen port

Create a device token and the line to store with
  python3 scripts/new_device_token.py NAME
It prints the token (paste it into the device) and NAME:sha256hex (add it to
PROGRESS_TOKEN_HASHES). Never store the token itself; the server refuses to
start when an entry is not a hash.

Tokens are never logged and never stored. The access log records the method,
path, status, and device name.
"""

from __future__ import annotations

import hashlib
import hmac
import http.server
import json
import os
import re
import signal
import sqlite3
import sys
import threading
import time
import urllib.parse
from collections import deque
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
MAX_BODY = 1_000_000
MAX_ROWS = 5_000
# Rows returned by one sync; the client asks again while "more" is true.
PAGE_ROWS = 5_000
FAILURE_WINDOW = 60.0
MAX_FAILURES = 10
BLOCK_SECONDS = 300.0
BACKUP_CHECK_SECONDS = 3600.0

# Keep in step with ID_PATTERN in scripts/question_bank.py (a test checks it).
ID_PATTERN = r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}"
CARD_RE = re.compile(rf"^{ID_PATTERN}$")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,40}$")
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
# What secrets.token_urlsafe produces (32 bytes → 43 characters); lowercased, as the digest is.
RAW_TOKEN_RE = re.compile(r"^[a-z0-9_-]{20,}$")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")
SNAPSHOT_RE = re.compile(r"^progress-\d{4}-\d{2}-\d{2}\.db$")
MODES = ("daily", "learn", "practice", "baseline")

# Mirrors DEFAULT_SETTINGS and SETTING_LIMITS in site/js/lib/store.js.
INT_SETTINGS = {"dailySize": (1, 100), "newPerDay": (0, 50), "dailyGoal": (1, 200)}
SETTING_KEYS = (*INT_SETTINGS, "practiceTopics", "practiceOrder", "onlyLearnedPages")

SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
        "connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    ),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}

SCHEMA = """
CREATE TABLE reviews (
  id     TEXT PRIMARY KEY,
  card   TEXT NOT NULL,
  at     TEXT NOT NULL,
  day    TEXT NOT NULL,
  mode   TEXT NOT NULL CHECK (mode IN ('daily', 'learn', 'practice', 'baseline')),
  knew   INTEGER CHECK (knew IN (0, 1)),
  box    INTEGER CHECK (box BETWEEN 0 AND 5),
  device TEXT NOT NULL,
  seq    INTEGER NOT NULL
);
CREATE INDEX reviews_seq ON reviews(seq);
CREATE INDEX reviews_card ON reviews(card, at);

CREATE TABLE pages (
  path    TEXT PRIMARY KEY,
  learned INTEGER NOT NULL CHECK (learned IN (0, 1)),
  at      TEXT NOT NULL,
  seq     INTEGER NOT NULL
);
CREATE INDEX pages_seq ON pages(seq);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  at    TEXT NOT NULL,
  seq   INTEGER NOT NULL
);
CREATE INDEX settings_seq ON settings(seq);

CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO meta (key, value) VALUES ('seq', 0);
"""

# Table -> (primary key, columns sent to and from clients).
TABLES = {
    "reviews": ("id", ("id", "card", "at", "day", "mode", "knew", "box", "device")),
    "pages": ("path", ("path", "learned", "at")),
    "settings": ("key", ("key", "value", "at")),
}


class BadRequest(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


# --- Configuration -------------------------------------------------------------------


@dataclass
class Config:
    db: Path = Path("/data/progress.db")
    backup_dir: Path = Path("/data/backups")
    backup_keep: int = 30
    # Device name -> SHA-256 hex of its token.
    tokens: dict[str, str] = field(default_factory=dict)
    trust_proxy: bool = False
    site_dir: Path = Path("/app/_site")
    host: str = "0.0.0.0"
    port: int = 8000
    backups: bool = True

    @classmethod
    def from_env(cls, env=os.environ) -> "Config":
        return cls(
            db=Path(env.get("PROGRESS_DB", "/data/progress.db")),
            backup_dir=Path(env.get("PROGRESS_BACKUP_DIR", "/data/backups")),
            backup_keep=int(env.get("PROGRESS_BACKUP_KEEP", "30")),
            tokens=parse_token_hashes(env.get("PROGRESS_TOKEN_HASHES", "")),
            trust_proxy=env.get("PROGRESS_TRUST_PROXY", "0") == "1",
            site_dir=Path(env.get("SITE_DIR", "/app/_site")),
            port=int(env.get("PORT", "8000")),
        )


def parse_token_hashes(text: str) -> dict[str, str]:
    """Parse "name:sha256hex,name:sha256hex"; raise ValueError on a malformed entry."""
    tokens: dict[str, str] = {}
    for number, entry in enumerate(filter(None, (part.strip() for part in text.split(","))), 1):
        name, _, digest = entry.partition(":")
        digest = digest.strip().lower()
        if NAME_RE.match(name.strip()) and RAW_TOKEN_RE.match(digest) and not HASH_RE.match(digest):
            # Name the device but never echo the value: it is a secret.
            raise ValueError(
                f"PROGRESS_TOKEN_HASHES entry {number} ({name.strip()!r}) holds a raw token, not its hash; "
                "store name:sha256(token) instead (python3 scripts/new_device_token.py --hash-only NAME)"
            )
        if not NAME_RE.match(name.strip()) or not HASH_RE.match(digest):
            # Never echo the entry: it might be a pasted token rather than a hash.
            raise ValueError(f"PROGRESS_TOKEN_HASHES entry {number} is not name:<64 hex digits>")
        if name.strip() in tokens:
            raise ValueError(f"PROGRESS_TOKEN_HASHES names device {name.strip()!r} twice")
        tokens[name.strip()] = digest
    return tokens


# --- Validation ----------------------------------------------------------------------


def parse_instant(value) -> datetime:
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError("must be an ISO 8601 timestamp")
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("must include a UTC offset")
    return parsed


def is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def check_review(row: dict) -> dict:
    row_id, card, day, mode = row.get("id"), row.get("card"), row.get("day"), row.get("mode")
    if not isinstance(row_id, str) or not 1 <= len(row_id) <= 120:
        raise ValueError("id must be 1 to 120 characters")
    if not isinstance(card, str) or not CARD_RE.match(card):
        raise ValueError("card is not a question ID")
    if not isinstance(day, str) or not DAY_RE.match(day):
        raise ValueError("day must be YYYY-MM-DD")
    date.fromisoformat(day)
    if mode not in MODES:
        raise ValueError(f"mode must be one of {', '.join(MODES)}")
    knew, box = row.get("knew"), row.get("box")
    if mode == "baseline":
        if knew is not None or not is_int(box) or not 0 <= box <= 5:
            raise ValueError("a baseline row needs box 0 to 5 and knew null")
    elif knew not in (0, 1) or not is_int(knew) or box is not None:
        raise ValueError("a graded row needs knew 0 or 1 and box null")
    return {"id": row_id, "card": card, "at": row["at"], "day": day, "mode": mode, "knew": knew, "box": box}


def check_page(row: dict) -> dict:
    path, learned = row.get("path"), row.get("learned")
    if (
        not isinstance(path, str)
        or len(path) > 200
        or not path.startswith("wiki/")
        or not path.endswith(".md")
        or "\\" in path
        or any(part in ("", ".", "..") for part in path.split("/"))
    ):
        raise ValueError("path must be wiki/<…>.md")
    if learned not in (0, 1) or not is_int(learned):
        raise ValueError("learned must be 0 or 1")
    return {"path": path, "learned": learned, "at": row["at"]}


def check_setting(row: dict) -> dict:
    key, text = row.get("key"), row.get("value")
    if key not in SETTING_KEYS:
        raise ValueError(f"key must be one of {', '.join(SETTING_KEYS)}")
    if not isinstance(text, str) or len(text) > 10_000:
        raise ValueError("value must be JSON text")
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        raise ValueError("value must be JSON text") from None
    if key in INT_SETTINGS:
        low, high = INT_SETTINGS[key]
        if not is_int(value) or not low <= value <= high:
            raise ValueError(f"{key} must be a whole number from {low} to {high}")
    elif key == "practiceTopics":
        if value is not None and (
            not isinstance(value, list)
            or len(value) > 200
            or not all(isinstance(slug, str) and SLUG_RE.match(slug) for slug in value)
        ):
            raise ValueError("practiceTopics must be null or a list of topic slugs")
    elif key == "practiceOrder":
        if value not in ("shuffle", "weakest"):
            raise ValueError('practiceOrder must be "shuffle" or "weakest"')
    elif key == "onlyLearnedPages":
        if not isinstance(value, bool):
            raise ValueError("onlyLearnedPages must be true or false")
    return {"key": key, "value": text, "at": row["at"]}


CHECKS = {"reviews": check_review, "pages": check_page, "settings": check_setting}


def validate_batch(body) -> tuple[int, dict[str, list[dict]]]:
    """Return (since, rows by table); raise BadRequest listing the problems."""
    if not isinstance(body, dict):
        raise BadRequest("the body must be a JSON object")
    since = body.get("since", 0)
    if not is_int(since) or since < 0:
        raise BadRequest("since must be a non-negative integer")
    batches = {}
    for table in TABLES:
        rows = body.get(table, [])
        if not isinstance(rows, list):
            raise BadRequest(f"{table} must be a list")
        batches[table] = rows
    if sum(map(len, batches.values())) > MAX_ROWS:
        raise BadRequest(f"at most {MAX_ROWS} rows per request")
    problems = []
    clean: dict[str, list[dict]] = {}
    for table, rows in batches.items():
        clean[table] = []
        for index, row in enumerate(rows):
            try:
                if not isinstance(row, dict):
                    raise ValueError("must be an object")
                try:
                    parse_instant(row.get("at"))
                except (TypeError, ValueError):
                    raise ValueError("at must be an ISO 8601 timestamp with a UTC offset") from None
                clean[table].append(CHECKS[table](row))
            except ValueError as error:
                problems.append(f"{table}[{index}]: {error}")
    if problems:
        shown = "; ".join(problems[:20])
        more = f" (and {len(problems) - 20} more)" if len(problems) > 20 else ""
        raise BadRequest(f"invalid rows, nothing was saved: {shown}{more}")
    return since, clean


# --- Storage -------------------------------------------------------------------------


class ProgressDB:
    """One SQLite connection shared by every request thread, guarded by a lock."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.lock = threading.Lock()
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        with self.lock:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA synchronous=NORMAL")
            self.conn.execute("PRAGMA foreign_keys=ON")
            self.conn.execute("PRAGMA busy_timeout=5000")
            version = self.conn.execute("PRAGMA user_version").fetchone()[0]
            if version == 0:
                try:
                    self.conn.executescript(f"BEGIN IMMEDIATE;\n{SCHEMA}\nPRAGMA user_version = {SCHEMA_VERSION};\nCOMMIT;")
                except Exception:
                    if self.conn.in_transaction:
                        self.conn.execute("ROLLBACK")
                    raise
            elif version != SCHEMA_VERSION:
                raise RuntimeError(f"{path} has schema {version}; this server supports {SCHEMA_VERSION}")

    def close(self) -> None:
        with self.lock:
            self.conn.close()

    def ping(self) -> None:
        with self.lock:
            self.conn.execute("SELECT 1").fetchone()

    def sync(self, since: int, batches: dict[str, list[dict]], device: str) -> dict:
        """Upsert the rows with the merge rule, then return rows with seq > since."""
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                seq = self.conn.execute("SELECT value FROM meta WHERE key = 'seq'").fetchone()[0]
                for table, rows in batches.items():
                    key, columns = TABLES[table]
                    for row in rows:
                        if table == "reviews":
                            row = {**row, "device": device}
                        existing = self.conn.execute(
                            f"SELECT at FROM {table} WHERE {key} = ?", (row[key],)
                        ).fetchone()
                        # Compare instants, as the browser does, not timestamp strings.
                        if existing and parse_instant(row["at"]) <= parse_instant(existing["at"]):
                            continue
                        seq += 1
                        names = [*columns, "seq"]
                        updates = ", ".join(f"{name} = excluded.{name}" for name in names if name != key)
                        self.conn.execute(
                            f"INSERT INTO {table} ({', '.join(names)}) VALUES ({', '.join('?' * len(names))}) "
                            f"ON CONFLICT({key}) DO UPDATE SET {updates}",
                            [*(row[name] for name in columns), seq],
                        )
                self.conn.execute("UPDATE meta SET value = ? WHERE key = 'seq'", (seq,))
                self.conn.execute("COMMIT")
            except Exception:
                self.conn.execute("ROLLBACK")
                raise
            return self._changes(since, seq)

    def _changes(self, since: int, current: int) -> dict:
        found = []
        for table, (_, columns) in TABLES.items():
            for row in self.conn.execute(
                f"SELECT {', '.join(columns)}, seq FROM {table} WHERE seq > ? ORDER BY seq LIMIT ?",
                (since, PAGE_ROWS + 1),
            ):
                found.append((row["seq"], table, {name: row[name] for name in columns}))
        found.sort(key=lambda item: item[0])
        more = len(found) > PAGE_ROWS
        found = found[:PAGE_ROWS]
        result: dict = {"seq": found[-1][0] if more else current, "more": more}
        for table in TABLES:
            result[table] = [row for _, name, row in found if name == table]
        return result

    def export(self) -> dict:
        with self.lock:
            result: dict = {
                "format": "llm-wiki-study",
                "version": 2,
                "exported": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "seq": self.conn.execute("SELECT value FROM meta WHERE key = 'seq'").fetchone()[0],
            }
            for table, (key, columns) in TABLES.items():
                result[table] = [
                    {name: row[name] for name in columns}
                    for row in self.conn.execute(f"SELECT {', '.join(columns)} FROM {table} ORDER BY {key}")
                ]
            return result

    def snapshot(self, backup_dir: Path, keep: int, today: date | None = None) -> Path | None:
        """Write today's snapshot with VACUUM INTO when it is missing, then prune old ones.

        The live file is never copied directly: a copy taken during a write can
        be corrupt. Returns the new snapshot's path, or None when it existed.
        """
        today = today or date.today()
        backup_dir.mkdir(parents=True, exist_ok=True)
        target = backup_dir / f"progress-{today.isoformat()}.db"
        created = None
        if not target.exists():
            partial = target.with_name(target.name + ".partial")
            partial.unlink(missing_ok=True)
            with self.lock:
                self.conn.execute("VACUUM INTO ?", (str(partial),))
            os.replace(partial, target)
            created = target
        snapshots = sorted(path for path in backup_dir.iterdir() if SNAPSHOT_RE.match(path.name))
        for old in snapshots[: max(0, len(snapshots) - max(1, keep))]:
            old.unlink(missing_ok=True)
        return created


# --- Rate limiting -------------------------------------------------------------------


class FailureLimiter:
    """More than MAX_FAILURES failed logins from one IP in a minute blocks it for 5 minutes."""

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.Lock()
        self.failures: dict[str, deque] = {}
        self.blocked: dict[str, float] = {}

    def is_blocked(self, ip: str) -> bool:
        with self.lock:
            until = self.blocked.get(ip)
            if until is None:
                return False
            if self.clock() >= until:
                del self.blocked[ip]
                return False
            return True

    def fail(self, ip: str) -> bool:
        """Record a failure; return True when the IP is now blocked."""
        now = self.clock()
        with self.lock:
            if len(self.failures) > 10_000:
                self._prune(now)
            recent = self.failures.setdefault(ip, deque())
            recent.append(now)
            while recent and now - recent[0] > FAILURE_WINDOW:
                recent.popleft()
            if len(recent) > MAX_FAILURES:
                self.blocked[ip] = now + BLOCK_SECONDS
                del self.failures[ip]
                return True
            return False

    def _prune(self, now: float) -> None:
        for ip in [ip for ip, recent in self.failures.items() if not recent or now - recent[-1] > FAILURE_WINDOW]:
            del self.failures[ip]
        for ip in [ip for ip, until in self.blocked.items() if now >= until]:
            del self.blocked[ip]


# --- HTTP ----------------------------------------------------------------------------


class Handler(http.server.SimpleHTTPRequestHandler):
    server: "ProgressServer"
    server_version = "llm-wiki-study"
    # Seconds a connection may stay idle, so slow clients cannot hold threads.
    timeout = 30
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
    }

    def __init__(self, *args, directory=None, **kwargs):
        # The device name for the access log; set once a token is accepted.
        self.device = "-"
        super().__init__(*args, directory=directory, **kwargs)

    # Headers and logging

    def end_headers(self) -> None:
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        if not self.path.startswith("/api/"):
            # Revalidate every file, so a deploy is picked up; the service worker serves offline.
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_request(self, code="-", size="-") -> None:
        status = code.value if hasattr(code, "value") else code
        path = urllib.parse.urlsplit(self.path).path
        self.server.log(f"{self.command} {path} {status} {self.device}")

    def log_message(self, format, *args) -> None:  # noqa: A002 - signature from BaseHTTPRequestHandler
        # Errors only; request lines (which never carry tokens) go through log_request.
        self.server.log(format % args)

    # Static files

    def send_head(self):
        # translate_path drops ".." segments, but a symlink could still lead outside.
        root = Path(self.directory).resolve()
        try:
            resolved = Path(self.translate_path(self.path)).resolve()
        except (OSError, ValueError):
            resolved = None
        if resolved is None or (resolved != root and root not in resolved.parents):
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def version_string(self) -> str:
        return self.server_version

    def list_directory(self, path):
        self.send_error(404, "File not found")
        return None

    def do_GET(self) -> None:
        if self.path.startswith("/api/"):
            self.handle_api("GET")
            return
        if urllib.parse.urlsplit(self.path).path == "/favicon.ico":
            # Browsers ask for it even with a <link rel="icon">; answer with the PNG icon.
            self.path = "/icons/icon-192.png"
        super().do_GET()

    def do_HEAD(self) -> None:
        if self.path.startswith("/api/"):
            self.send_json(405, {"error": "method not allowed"})
        else:
            super().do_HEAD()

    def do_POST(self) -> None:
        if self.path.startswith("/api/"):
            self.handle_api("POST")
        else:
            self.send_error(405, "Method not allowed")

    # API

    def handle_api(self, method: str) -> None:
        route = urllib.parse.urlsplit(self.path).path
        try:
            if route == "/api/health":
                if method != "GET":
                    raise BadRequest("method not allowed", 405)
                self.server.db.ping()
                self.send_json(200, {"ok": True, "schema": SCHEMA_VERSION})
                return
            if route not in ("/api/sync", "/api/export"):
                raise BadRequest("not found", 404)
            expected = "POST" if route == "/api/sync" else "GET"
            if method != expected:
                raise BadRequest("method not allowed", 405)
            device = self.authenticate()
            if device is None:
                return
            self.device = device
            if route == "/api/export":
                self.send_json(200, self.server.db.export())
                return
            since, batches = validate_batch(self.read_json())
            result = self.server.db.sync(since, batches, device)
            self.send_json(200, {**result, "device": device})
        except BadRequest as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:  # pragma: no cover - logged, never leaked
            self.server.log(f"error handling {method} {route}: {type(error).__name__}: {error}")
            self.send_json(500, {"error": "internal error"})

    def client_ip(self) -> str:
        if self.server.config.trust_proxy:
            forwarded = self.headers.get("X-Forwarded-For", "")
            # The local proxy appends the address it saw, so the last entry is trustworthy.
            last = forwarded.split(",")[-1].strip()
            if last:
                return last
        return self.client_address[0]

    def authenticate(self) -> str | None:
        """Return the device name, or send 401/429/503 and return None."""
        ip = self.client_ip()
        limiter = self.server.limiter
        if limiter.is_blocked(ip):
            self.send_json(429, {"error": "too many failed attempts; try again later"}, {"Retry-After": str(int(BLOCK_SECONDS))})
            return None
        if not self.server.config.tokens:
            self.send_json(503, {"error": "sync is not configured on this server"})
            return None
        scheme, _, token = self.headers.get("Authorization", "").partition(" ")
        device = None
        if scheme.lower() == "bearer" and token.strip():
            presented = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
            # Compare with every hash, so timing does not reveal which one matched.
            for name, digest in self.server.config.tokens.items():
                if hmac.compare_digest(presented, digest):
                    device = name
        if device is None:
            if limiter.fail(ip):
                self.send_json(429, {"error": "too many failed attempts; try again later"}, {"Retry-After": str(int(BLOCK_SECONDS))})
            else:
                self.send_json(401, {"error": "missing or unknown device token"}, {"WWW-Authenticate": "Bearer"})
            return None
        return device

    def read_json(self):
        if "chunked" in self.headers.get("Transfer-Encoding", "").lower():
            raise BadRequest("send a Content-Length", 411)
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            raise BadRequest("send a Content-Length", 411) from None
        if length < 0:
            raise BadRequest("invalid Content-Length")
        if length > MAX_BODY:
            # The unread body makes the connection unusable; close it after replying.
            self.close_connection = True
            raise BadRequest(f"the body must be at most {MAX_BODY} bytes", 413)
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise BadRequest("the body is not valid JSON") from None

    def send_json(self, status: int, payload: dict, headers: dict | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)


class ProgressServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, config: Config, log=None):
        self.config = config
        self.log = log or (lambda message: print(message, file=sys.stderr, flush=True))
        self.db = ProgressDB(config.db)
        self.limiter = FailureLimiter()
        self.stopping = threading.Event()
        site = str(config.site_dir)
        super().__init__((config.host, config.port), lambda *args: Handler(*args, directory=site))

    def start_backups(self) -> threading.Thread:
        def loop():
            while not self.stopping.is_set():
                try:
                    created = self.db.snapshot(self.config.backup_dir, self.config.backup_keep)
                    if created:
                        self.log(f"snapshot written: {created.name}")
                except Exception as error:
                    self.log(f"snapshot failed: {type(error).__name__}: {error}")
                self.stopping.wait(BACKUP_CHECK_SECONDS)

        thread = threading.Thread(target=loop, name="backups", daemon=True)
        thread.start()
        return thread

    def server_close(self) -> None:
        self.stopping.set()
        super().server_close()
        self.db.close()


def main() -> int:
    try:
        config = Config.from_env()
    except ValueError as error:
        print(f"progress server: {error}", file=sys.stderr)
        return 2
    server = ProgressServer(config)
    if not config.tokens:
        server.log("PROGRESS_TOKEN_HASHES is not set: sync is disabled; serving the site only")
    if not config.site_dir.is_dir():
        server.log(f"SITE_DIR {config.site_dir} does not exist; only the API is served")
    server.start_backups()

    def stop(signum, frame):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    server.log(f"listening on port {config.port} with devices: {', '.join(config.tokens) or 'none'}")
    try:
        server.serve_forever()
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
