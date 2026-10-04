#!/usr/bin/env python3
"""Build the flashcards site into _site/ for GitHub Pages.

Copies the static app from site/ and generates _site/cards.json from the
review questions in learning/questions/. The question files remain the single
source of truth; never edit the generated output.

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

from question_bank import REPO_ROOT, load_questions  # noqa: E402

SITE_SRC = REPO_ROOT / "site"
OUTPUT = REPO_ROOT / "_site"
DEFAULT_REPOSITORY = "GeorgeDanicico/llm-wiki"


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

    topics: dict[str, dict] = {}
    cards = []
    for question in questions:
        slug = question.file.stem
        topics.setdefault(slug, {"slug": slug, "name": question.topic, "count": 0})["count"] += 1
        source = question.source_path.relative_to(REPO_ROOT).as_posix()
        anchor = f"#{question.source_anchor}" if question.source_anchor else ""
        cards.append(
            {
                "id": question.id,
                "topic": slug,
                "question": inline_markdown(question.text),
                "points": [inline_markdown(point) for point in question.points],
                "source": {"title": question.source_label, "url": blob_root + source + anchor},
            }
        )

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(SITE_SRC, OUTPUT)
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


def repository_from_remote() -> str | None:
    try:
        url = subprocess.run(
            ["git", "remote", "get-url", "origin"], cwd=REPO_ROOT, check=True, capture_output=True, text=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    match = re.search(r"github\.com[:/](.+?/.+?)(?:\.git)?$", url)
    return match.group(1) if match else None


if __name__ == "__main__":
    sys.exit(main())
