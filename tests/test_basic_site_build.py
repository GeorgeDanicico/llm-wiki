"""Tests for the --site option of scripts/build_flashcards.py.

Run with: python3 -m unittest discover -s tests
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import build_flashcards  # noqa: E402


def built_files(variant: str) -> tuple[set[str], Path, tempfile.TemporaryDirectory]:
    tmp = tempfile.TemporaryDirectory()
    out = Path(tmp.name) / "_site"
    build_flashcards.copy_site(variant, out)
    files = {path.relative_to(out).as_posix() for path in out.rglob("*") if path.is_file()}
    return files, out, tmp


class BasicSiteBuildTest(unittest.TestCase):
    def test_basic_site_has_its_own_app_and_the_shared_icons(self):
        files, out, tmp = built_files("basic")
        with tmp:
            self.assertIn("index.html", files)
            self.assertIn("js/main.js", files)
            self.assertIn("js/daily.js", files)
            self.assertIn("icons/favicon.svg", files)
            # Nothing from the full app beyond the icons.
            self.assertNotIn("js/lib/store.js", files)
            self.assertNotIn("manifest.webmanifest", files)
            # Tests and the Node package marker are not published.
            self.assertFalse(any(name.endswith(".test.mjs") for name in files))
            self.assertNotIn("package.json", files)

    def test_basic_site_registers_no_worker_and_retires_the_old_one(self):
        files, out, tmp = built_files("basic")
        with tmp:
            self.assertNotIn("serviceWorker", (out / "index.html").read_text())
            self.assertNotIn("serviceWorker", (out / "js" / "main.js").read_text())
            worker = (out / "sw.js").read_text()
            self.assertIn("unregister()", worker)
            self.assertIn("llm-wiki-study-", worker)
            # The cache prefix must match the one the full app's worker uses.
            self.assertIn('const PREFIX = "llm-wiki-study-";', (REPO_ROOT / "site" / "sw.js").read_text())

    def test_full_site_is_unchanged(self):
        files, out, tmp = built_files("full")
        with tmp:
            self.assertIn("manifest.webmanifest", files)
            self.assertIn("js/lib/store.js", files)
            self.assertIn("const BUILD = ", (out / "sw.js").read_text())

    def test_unknown_site_is_rejected(self):
        with self.assertRaises(SystemExit):
            build_flashcards.main(["--site", "other"])


if __name__ == "__main__":
    unittest.main()
