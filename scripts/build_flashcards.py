#!/usr/bin/env python3
"""Build the flashcards site into _site/ for GitHub Pages.

Copies the static app from site/ (without its unit tests) and generates
_site/cards.json from the review questions in learning/questions/. The question
files remain the single source of truth; never edit the generated output.

Each card records the date its question was first committed (``added``), read
from Git history. Without full history, for example in a shallow clone, the
field is left out and the app shows no "New" badges.

Usage:
  python3 scripts/build_flashcards.py
  python3 -m http.server --directory _site   # preview at http://localhost:8000
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from question_bank import ID_PATTERN, QUESTION_DIR, REPO_ROOT, load_questions  # noqa: E402

SITE_SRC = REPO_ROOT / "site"
OUTPUT = REPO_ROOT / "_site"
WIKI_DIR = REPO_ROOT / "wiki"
DEFAULT_REPOSITORY = "GeorgeDanicico/llm-wiki"
# Files in site/ that are not part of the published app.
SKIPPED_SITE_FILES = ("*.test.mjs", "package.json")
ADDED_HEADING_RE = re.compile(rf"^\+## ({ID_PATTERN}) — ", re.MULTILINE)


def main() -> int:
    questions = load_questions()
    broken = [q for q in questions if q.errors or not q.id]
    if broken:
        for question in broken:
            print(f"✗ {question.file.relative_to(REPO_ROOT)}:{question.line}: {'; '.join(question.errors)}")
        print("Fix these questions (python3 scripts/validate.py lists every problem).")
        return 1

    repository = os.environ.get("GITHUB_REPOSITORY") or repository_from_remote() or DEFAULT_REPOSITORY
    branch = os.environ.get("FLASHCARDS_BRANCH", "main")
    blob_root = f"https://github.com/{repository}/blob/{branch}/"

    added = added_dates()
    topics: dict[str, dict] = {}
    cards = []
    for question in questions:
        slug = question.file.stem
        topics.setdefault(slug, {"slug": slug, "name": question.topic, "count": 0})["count"] += 1
        source = question.source_path.relative_to(REPO_ROOT).as_posix()
        anchor = f"#{question.source_anchor}" if question.source_anchor else ""
        card = {
            "id": question.id,
            "topic": slug,
            "question": inline_markdown(question.text),
            "points": [inline_markdown(point) for point in question.points],
            "source": {"title": question.source_label, "url": blob_root + source + anchor},
            # The supporting page, such as "reliability/cache-aside", and its heading anchor.
            "pageSlug": page_slug(question.source_path),
            "anchor": question.source_anchor,
        }
        if question.id in added:
            card["added"] = added[question.id]
        cards.append(card)

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(SITE_SRC, OUTPUT, ignore=shutil.ignore_patterns(*SKIPPED_SITE_FILES))
    payload = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repository": f"https://github.com/{repository}",
        "topics": sorted(topics.values(), key=lambda topic: topic["name"].lower()),
        "cards": cards,
    }
    (OUTPUT / "cards.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ Built {len(cards)} cards in {len(topics)} topics into {OUTPUT.relative_to(REPO_ROOT)}/")
    return 0


def inline_markdown(text: str) -> str:
    """Render the small inline subset used in questions: code, bold, italics."""
    parts = re.split(r"(`+)(.+?)\1", text)
    rendered = []
    # re.split yields [text, fence, code, text, fence, code, ...]
    for index in range(0, len(parts), 3):
        prose = html.escape(parts[index], quote=False)
        prose = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", prose)
        prose = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", prose)
        rendered.append(prose)
        if index + 2 < len(parts):
            rendered.append(f"<code>{html.escape(parts[index + 2].strip(), quote=False)}</code>")
    return "".join(rendered)


def page_slug(path: Path) -> str | None:
    try:
        return path.relative_to(WIKI_DIR).with_suffix("").as_posix()
    except ValueError:
        return None


def added_dates() -> dict[str, str]:
    """Map each question ID to the date (YYYY-MM-DD) of the commit that first added its heading."""
    try:
        if git("rev-parse", "--is-shallow-repository") == "true":
            return {}
        log = git(
            "log", "--reverse", "-p", "--no-color", "--no-ext-diff", "--format=%x00%cI",
            "--", QUESTION_DIR.relative_to(REPO_ROOT).as_posix() + "/",
        )
    except (OSError, subprocess.CalledProcessError):
        return {}
    added: dict[str, str] = {}
    # Each commit starts with NUL, its committer date, then its patch.
    for commit in log.split("\0")[1:]:
        date, _, patch = commit.partition("\n")
        for match in ADDED_HEADING_RE.finditer(patch):
            added.setdefault(match.group(1), date.strip()[:10])
    return added


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO_ROOT, check=True, capture_output=True, text=True).stdout.strip()


def repository_from_remote() -> str | None:
    try:
        url = git("remote", "get-url", "origin")
    except (OSError, subprocess.CalledProcessError):
        return None
    match = re.search(r"github\.com[:/](.+?/.+?)(?:\.git)?$", url)
    return match.group(1) if match else None


if __name__ == "__main__":
    sys.exit(main())
