#!/usr/bin/env python3
"""Build the study site into _site/ for GitHub Pages.

Copies the static app from site/ (without its unit tests) and generates:

  _site/cards.json                 the review questions in learning/questions/;
  _site/learn/index.json           the Learn topics and pages, in wiki index order;
  _site/learn/<topic>/<page>.html  each topic page rendered as an HTML fragment;
  _site/sw.js                      the service worker, with this build's version and file list.

The question files and wiki pages remain the single source of truth; never edit
the generated output. Pages are rendered by scripts/wiki_markdown.py, which
fails the build on Markdown it does not support.

Each card records the date its question was first committed (``added``), read
from Git history. Without full history, for example in a shallow clone, the
field is left out and the app shows no "New" badges.

Usage:
  python3 scripts/build_flashcards.py
  python3 -m http.server --directory _site   # preview at http://localhost:8000
"""

from __future__ import annotations

import hashlib
import html
import json
import math
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from question_bank import ID_PATTERN, QUESTION_DIR, REPO_ROOT, load_questions  # noqa: E402
from wiki_markdown import UnsupportedMarkdown, is_external, render, render_inline  # noqa: E402

SITE_SRC = REPO_ROOT / "site"
OUTPUT = REPO_ROOT / "_site"
WIKI_DIR = REPO_ROOT / "wiki"
DEFAULT_REPOSITORY = "GeorgeDanicico/llm-wiki"
# Files in site/ that are not part of the published app.
SKIPPED_SITE_FILES = ("*.test.mjs", "package.json")
ADDED_HEADING_RE = re.compile(rf"^\+## ({ID_PATTERN}) — ", re.MULTILINE)
# A Learn index entry: "- [Title](target.md) — summary".
INDEX_ENTRY_RE = re.compile(r"^- \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)(?: — (?P<text>.*))?$")
TRAILING_SOURCES_RE = re.compile(r"(?:[\s,;]*(?:and\s+)?\[Source\]\([^)]*\))+\s*$")
WORDS_PER_MINUTE = 200
# The line in site/sw.js that the build fills in with the version and the files to precache.
SW_BUILD_RE = re.compile(r"^const BUILD = \{.*\};", re.MULTILINE)
# Heading prefix for rendered pages, so wiki headings never collide with IDs in the app shell.
HEADING_ID_PREFIX = "wiki-"


class BuildError(Exception):
    pass


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

    try:
        learn_index, learn_pages = build_learn(questions, blob_root)
    except (BuildError, UnsupportedMarkdown) as error:
        print(f"✗ {error}")
        print("Fix the wiki page (python3 scripts/validate.py lists every problem) or extend scripts/wiki_markdown.py.")
        return 1

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(SITE_SRC, OUTPUT, ignore=shutil.ignore_patterns(*SKIPPED_SITE_FILES))
    for relative, fragment in learn_pages.items():
        target = OUTPUT / "learn" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(fragment, encoding="utf-8")
    (OUTPUT / "learn" / "index.json").write_text(
        json.dumps(learn_index, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    payload = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repository": f"https://github.com/{repository}",
        "topics": sorted(topics.values(), key=lambda topic: topic["name"].lower()),
        "cards": cards,
    }
    (OUTPUT / "cards.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    try:
        version = write_service_worker(OUTPUT, stable={"cards.json": {**payload, "generated": None}})
    except BuildError as error:
        print(f"✗ {error}")
        return 1
    print(
        f"✓ Built {len(cards)} cards in {len(topics)} topics and {len(learn_pages)} Learn pages "
        f"in {len(learn_index['topics'])} topics into {OUTPUT.relative_to(REPO_ROOT)}/ (build {version})"
    )
    return 0


def write_service_worker(output: Path, stable: dict[str, object]) -> str:
    """Fill in sw.js with this build's version and the files to precache.

    The version hashes every other built file, so a deploy that changes
    anything installs a new service worker, and an identical rebuild does not.
    `stable` replaces the hashed content of files with build-time noise, such
    as the generation time in cards.json.
    """
    worker = output / "sw.js"
    if not worker.exists():
        raise BuildError("site/sw.js is missing")
    files = sorted(
        path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file() and path != worker
    )
    digest = hashlib.sha256()
    for name in files:
        if name in stable:
            content = json.dumps(stable[name], ensure_ascii=False, sort_keys=True).encode("utf-8")
        else:
            content = (output / name).read_bytes()
        digest.update(name.encode("utf-8") + b"\0" + hashlib.sha256(content).digest())
    version = digest.hexdigest()[:16]
    build = json.dumps({"version": version, "files": ["./", *files]}, ensure_ascii=False)
    text, count = SW_BUILD_RE.subn(lambda _: f"const BUILD = {build};", worker.read_text(encoding="utf-8"), count=1)
    if count != 1:
        raise BuildError("site/sw.js has no `const BUILD = {...};` line to fill in")
    worker.write_text(text, encoding="utf-8")
    return version


# --- Learn --------------------------------------------------------------------------


def build_learn(questions, blob_root: str) -> tuple[dict, dict[str, str]]:
    """The Learn index and the rendered fragments, keyed by "<topic>/<page>.html".

    Topics follow the "## Topics" list in wiki/index.md and pages follow each
    topic's index.md list, so ordering and text come from the indexes rather
    than from the file system. The library is not part of Learn.
    """
    root_index = WIKI_DIR / "index.md"
    topics = []
    # Absolute page path -> (topic slug, page slug), for link rewriting.
    routes: dict[Path, tuple[str, str]] = {}
    for line_number, entry in topics_section(root_index):
        index_path = (root_index.parent / entry["href"]).resolve()
        if index_path.name != "index.md" or index_path.parent.parent != WIKI_DIR:
            raise BuildError(f"{rel(root_index)}:{line_number}: topic entries must link to wiki/<topic>/index.md")
        slug = index_path.parent.name
        pages = []
        for page_line, page_entry in index_entries(index_path):
            path = (index_path.parent / page_entry["href"].partition("#")[0]).resolve()
            if path.name == "index.md" or path.suffix != ".md" or path in routes:
                continue
            if path.parent != index_path.parent:
                raise BuildError(f"{rel(index_path)}:{page_line}: {page_entry['href']} is outside the topic's directory")
            if not path.exists():
                raise BuildError(f"{rel(index_path)}:{page_line}: {page_entry['href']} does not exist")
            routes[path] = (slug, path.stem)
            pages.append((path, index_path, page_line, page_entry))
        topics.append((slug, root_index, line_number, entry, index_path, pages))

    by_page: dict[Path, list] = {}
    for question in questions:
        by_page.setdefault(question.source_path, []).append(question)

    payload = {"topics": []}
    fragments: dict[str, str] = {}
    for slug, root, line_number, entry, index_path, pages in topics:
        topic = {
            "slug": slug,
            "name": entry["label"],
            "description": render_inline(
                entry["text"] or "", root, line_number, resolve_link=learn_link_resolver(root, routes, blob_root)
            ),
            "pages": [],
        }
        for path, index, page_line, page_entry in pages:
            page_slug = path.stem
            rendered = render(
                path.read_text(encoding="utf-8"),
                rel(path),
                resolve_link=learn_link_resolver(path, routes, blob_root),
                heading_offset=1,
                id_prefix=HEADING_ID_PREFIX,
                strip_title=True,
            )
            page_questions = by_page.get(path, [])
            sections = [
                {
                    "anchor": heading.anchor,
                    "title": heading.text,
                    "level": heading.level,
                    "questions": [q.id for q in page_questions if q.source_anchor == heading.anchor],
                }
                for heading in rendered.headings
                if heading.level > 1
            ]
            summary = TRAILING_SOURCES_RE.sub("", page_entry["text"] or "").strip()
            topic["pages"].append(
                {
                    "path": rel(path),
                    "slug": page_slug,
                    "title": rendered.title or page_entry["label"],
                    # Inline HTML, escaped by the renderer.
                    "summary": render_inline(
                        summary, index, page_line, resolve_link=learn_link_resolver(index, routes, blob_root)
                    ),
                    "minutes": max(1, math.ceil(rendered.words / WORDS_PER_MINUTE)),
                    "sections": sections,
                    "questions": [q.id for q in page_questions],
                }
            )
            fragments[f"{slug}/{page_slug}.html"] = rendered.html
        payload["topics"].append(topic)
    return payload, fragments


def topics_section(index: Path):
    """Entries of the "## Topics" list in wiki/index.md."""
    in_topics = False
    for number, line in enumerate(index.read_text(encoding="utf-8").splitlines(), 1):
        if line.startswith("## "):
            in_topics = line.strip() == "## Topics"
            continue
        match = INDEX_ENTRY_RE.match(line) if in_topics else None
        if match:
            yield number, match.groupdict()


def index_entries(index: Path):
    for number, line in enumerate(index.read_text(encoding="utf-8").splitlines(), 1):
        match = INDEX_ENTRY_RE.match(line)
        if match and not is_external(match.group("href")):
            yield number, match.groupdict()


def learn_link_resolver(page: Path, routes: dict[Path, tuple[str, str]], blob_root: str):
    """Rewrite links for the Learn reader.

    Another Learn page becomes a hash route (with its anchor), a topic index
    becomes that topic's Learn list, and any other repository file, such as a
    captured source or a library page, becomes its GitHub URL in a new tab.
    External links are kept and open in a new tab.
    """

    def resolve(target: str) -> tuple[str, bool]:
        if is_external(target):
            return target, True
        file_part, _, anchor = target.partition("#")
        destination = (page.parent / file_part).resolve() if file_part else page
        if destination in routes:
            topic, slug = routes[destination]
            suffix = f"/{quote(anchor)}" if anchor else ""
            return f"#/learn/{quote(topic)}/{quote(slug)}{suffix}", False
        if destination == WIKI_DIR / "index.md":
            return "#/learn", False
        if destination.name == "index.md" and destination.parent.parent == WIKI_DIR:
            if any(topic == destination.parent.name for topic, _ in routes.values()):
                return f"#/learn/{quote(destination.parent.name)}", False
        try:
            repository_path = destination.relative_to(REPO_ROOT).as_posix()
        except ValueError:
            raise BuildError(f"{rel(page)}: link {target!r} points outside the repository") from None
        return blob_root + quote(repository_path) + (f"#{quote(anchor)}" if anchor else ""), True

    return resolve


def quote(text: str) -> str:
    return urllib.parse.quote(text, safe="/-_.~")


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


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
