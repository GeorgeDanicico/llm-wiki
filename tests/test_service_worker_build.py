"""Tests for the service worker step of scripts/build_flashcards.py.

Run with: python3 -m unittest discover -s tests
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import build_flashcards  # noqa: E402


def build(files: dict[str, str], stable=None) -> tuple[str, dict]:
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        (out / "sw.js").write_text((REPO_ROOT / "site" / "sw.js").read_text())
        for name, content in files.items():
            (out / name).parent.mkdir(parents=True, exist_ok=True)
            (out / name).write_text(content)
        version = build_flashcards.write_service_worker(out, stable or {})
        line = re.search(r"^const BUILD = (\{.*\});", (out / "sw.js").read_text(), re.MULTILINE).group(1)
        return version, json.loads(line)


class ServiceWorkerBuildTest(unittest.TestCase):
    def test_lists_every_file_and_versions_by_content(self):
        version, info = build({"index.html": "a", "js/main.js": "b", "learn/t/p.html": "c"})
        self.assertEqual(info["version"], version)
        self.assertEqual(info["files"], ["./", "index.html", "js/main.js", "learn/t/p.html"])
        self.assertEqual(build({"index.html": "a", "js/main.js": "b", "learn/t/p.html": "c"})[0], version)
        self.assertNotEqual(build({"index.html": "a", "js/main.js": "B", "learn/t/p.html": "c"})[0], version)

    def test_stable_content_ignores_build_noise(self):
        first = build({"cards.json": '{"generated": "1"}'}, {"cards.json": {"cards": []}})[0]
        second = build({"cards.json": '{"generated": "2"}'}, {"cards.json": {"cards": []}})[0]
        self.assertEqual(first, second)

    def test_missing_marker_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "sw.js").write_text("// no marker")
            with self.assertRaises(build_flashcards.BuildError):
                build_flashcards.write_service_worker(Path(tmp), {})


if __name__ == "__main__":
    unittest.main()
