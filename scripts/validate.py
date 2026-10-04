#!/usr/bin/env python3
"""Check that the wiki is internally consistent.

Checks:
  1. Local Markdown links point to existing files and headings.
  2. Every wiki page is listed in at least one wiki index.
  3. Every review question is well-formed, has a unique stable ID, and cites
     an existing wiki page.
  4. With --base REF: captured sources were not modified or deleted since REF.

Usage:
  python3 scripts/validate.py
  python3 scripts/validate.py --base origin/main

Exits with status 1 and lists every problem when a check fails.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import defaultdict
from functools import cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from question_bank import REPO_ROOT, load_questions  # noqa: E402

SKIPPED_DIRS = {".git", ".github", "_site", "node_modules"}
EXTERNAL_RE = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)
FENCE_RE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$")
INLINE_CODE_RE = re.compile(r"(`+)(.+?)\1")
LINK_RE = re.compile(r"!?\[(?:[^\[\]]|\[[^\]]*\])*\]\(\s*<?([^)\s>]*)>?(?:\s+\"[^\"]*\")?\s*\)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", help="git ref to compare sources/ against for immutability")
    args = parser.parse_args()

    errors: dict[str, list[str]] = defaultdict(list)
    files = markdown_files()

    link_count = check_links(files, errors["Broken links"])
    check_index_coverage(files, errors["Wiki pages missing from an index"])
    question_count = check_questions(errors["Review questions"])
    if args.base:
        check_source_immutability(args.base, errors["Modified captured sources"])

    problems = {title: items for title, items in errors.items() if items}
    for title, items in problems.items():
        print(f"\n✗ {title} ({len(items)})")
        for item in items:
            print(f"  - {item}")

    summary = f"{len(files)} Markdown files, {link_count} local links, {question_count} review questions"
    if problems:
        print(f"\nValidation failed: {sum(map(len, problems.values()))} problem(s) across {summary}.")
        return 1
    print(f"✓ All checks passed: {summary}" + (f", sources unchanged since {args.base}." if args.base else "."))
    return 0


def markdown_files() -> list[Path]:
    return sorted(
        path
        for path in REPO_ROOT.rglob("*.md")
        if not SKIPPED_DIRS.intersection(path.relative_to(REPO_ROOT).parts)
    )


def is_captured_source(path: Path) -> bool:
    """Captured sources are immutable originals; only their README indexes are maintained."""
    rel = path.relative_to(REPO_ROOT)
    return rel.parts[0] == "sources" and rel.name != "README.md"


# --- 1. Links ---------------------------------------------------------------


def check_links(files: list[Path], errors: list[str]) -> int:
    count = 0
    for path in files:
        # Captured sources may contain links that were broken at capture time;
        # they are immutable, so they cannot be repaired here.
        if is_captured_source(path):
            continue
        for line_number, target in iter_links(path):
            if not target or EXTERNAL_RE.match(target):
                continue
            count += 1
            problem = check_link_target(path, target)
            if problem:
                errors.append(f"{rel(path)}:{line_number}: {target} — {problem}")
    return count


def iter_links(path: Path):
    in_fence = None
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        fence = FENCE_RE.match(line)
        if fence:
            marker = fence.group(1)
            if in_fence is None:
                in_fence = marker[0] * len(marker)
            elif marker.startswith(in_fence):
                in_fence = None
            continue
        if in_fence:
            continue
        for match in LINK_RE.finditer(INLINE_CODE_RE.sub("", line)):
            yield number, match.group(1)


def check_link_target(source: Path, target: str) -> str | None:
    file_part, _, anchor = target.partition("#")
    destination = (source.parent / file_part).resolve() if file_part else source
    if not destination.exists():
        return "file does not exist"
    if anchor and destination.suffix == ".md":
        if anchor not in heading_anchors(destination):
            return f"no heading with anchor #{anchor} in {rel(destination)}"
    return None


@cache
def heading_anchors(path: Path) -> frozenset[str]:
    """Anchors GitHub generates for the headings in ``path``."""
    anchors: set[str] = set()
    seen: dict[str, int] = defaultdict(int)
    in_fence = None
    for line in path.read_text(encoding="utf-8").splitlines():
        fence = FENCE_RE.match(line)
        if fence:
            marker = fence.group(1)
            if in_fence is None:
                in_fence = marker[0] * len(marker)
            elif marker.startswith(in_fence):
                in_fence = None
            continue
        if in_fence:
            continue
        heading = HEADING_RE.match(line)
        if not heading:
            continue
        slug = github_slug(heading.group(2))
        anchors.add(slug if seen[slug] == 0 else f"{slug}-{seen[slug]}")
        seen[slug] += 1
    return frozenset(anchors)


def github_slug(heading: str) -> str:
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", heading)  # links -> link text
    text = re.sub(r"<[^>]+>", "", text)  # inline HTML
    text = text.lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


# --- 2. Index coverage ------------------------------------------------------


def check_index_coverage(files: list[Path], errors: list[str]) -> None:
    wiki = REPO_ROOT / "wiki"
    indexed: set[Path] = set()
    for index in wiki.rglob("index.md"):
        for _, target in iter_links(index):
            if target and not EXTERNAL_RE.match(target):
                indexed.add((index.parent / target.partition("#")[0]).resolve())
    for path in files:
        if path.is_relative_to(wiki) and path.name != "index.md" and path not in indexed:
            errors.append(f"{rel(path)} is not linked from any wiki/**/index.md")


# --- 3. Questions -----------------------------------------------------------


def check_questions(errors: list[str]) -> int:
    questions = load_questions()
    wiki = REPO_ROOT / "wiki"
    by_id: dict[str, list[str]] = defaultdict(list)

    for question in questions:
        where = f"{rel(question.file)}:{question.line}"
        label = question.id or repr(question.text)
        for problem in question.errors:
            errors.append(f"{where} {label}: {problem}")
        if question.id:
            by_id[question.id].append(where)

        source = question.source_path
        if source is None:
            continue
        if not source.is_relative_to(wiki) or source.suffix != ".md":
            errors.append(f"{where} {label}: Source must link to a page under wiki/")
        elif source.name == "index.md":
            errors.append(f"{where} {label}: Source must be a topic page, not an index")
        elif not source.exists():
            errors.append(f"{where} {label}: Source page {question.source_href} does not exist")
        elif question.source_anchor and question.source_anchor not in heading_anchors(source):
            errors.append(f"{where} {label}: Source anchor #{question.source_anchor} not found")

    for question_id, places in by_id.items():
        if len(places) > 1:
            errors.append(f"duplicate ID {question_id} at {', '.join(places)}")
    return len(questions)


# --- 4. Source immutability -------------------------------------------------


def check_source_immutability(base: str, errors: list[str]) -> None:
    try:
        merge_base = git("merge-base", base, "HEAD")
        # Compare against the working tree so uncommitted edits are caught too.
        changes = git("diff", "--name-status", "--find-renames", merge_base, "--", "sources/")
    except subprocess.CalledProcessError as error:
        errors.append(f"could not compare with {base}: {error.stderr.strip() or error}")
        return
    for line in changes.splitlines():
        status, *paths = line.split("\t")
        if status.startswith("A") or Path(paths[0]).name == "README.md":
            continue
        verb = {"M": "modified", "D": "deleted", "R": "renamed"}.get(status[0], f"changed ({status})")
        errors.append(f"{' -> '.join(paths)} was {verb}; captured sources are immutable — add a new capture instead")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=REPO_ROOT, check=True, capture_output=True, text=True
    ).stdout.strip()


def rel(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT))


if __name__ == "__main__":
    sys.exit(main())
