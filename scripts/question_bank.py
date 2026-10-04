"""Parse the active-recall question bank.

This module is the single reader of the question format. The repository
validator uses it to reject malformed questions, and site builders can use it
to turn the same Markdown into flashcards.

Questions live in one file per topic under ``learning/questions/``. Each file
starts with a ``# Topic name`` heading (the flashcard deck name), followed by
any number of questions shaped exactly like this:

    ## JAVA-CONC-001 — Why is `counter++` unsafe when `counter` is volatile?

    Source: [Concurrency and the Java Memory Model](../../wiki/java/concurrency-and-the-java-memory-model.md)

    Expected points:

    - Volatile provides visibility and ordering but not mutual exclusion.
    - ...
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
QUESTION_DIR = REPO_ROOT / "learning" / "questions"
QUESTION_INDEX = REPO_ROOT / "learning" / "questions.md"

QUESTION_LEVEL = 2
ID_PATTERN = r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}"

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
_QUESTION_TITLE_RE = re.compile(rf"^(?P<id>{ID_PATTERN}) — (?P<text>\S.*)$")
_SOURCE_RE = re.compile(r"^Source: \[(?P<label>[^\]]+)\]\((?P<href>[^)\s]+)\)$")
_POINT_RE = re.compile(r"^- (?P<text>\S.*)$")


@dataclass
class Question:
    id: str | None
    text: str
    file: Path
    line: int
    topic: str | None = None
    source_label: str | None = None
    source_href: str | None = None
    points: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def source_path(self) -> Path | None:
        """Absolute path of the supporting page, without its anchor."""
        if not self.source_href:
            return None
        return (self.file.parent / self.source_href.split("#", 1)[0]).resolve()

    @property
    def source_anchor(self) -> str | None:
        if not self.source_href or "#" not in self.source_href:
            return None
        return self.source_href.split("#", 1)[1]


def parse_file(path: Path) -> list[Question]:
    """Parse every question in ``path``; format problems land in ``errors``."""
    questions: list[Question] = []
    current: Question | None = None
    topic: str | None = None
    state = "start"

    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.rstrip()
        heading = _HEADING_RE.match(line)

        if heading and len(heading.group(1)) <= QUESTION_LEVEL:
            level, title = len(heading.group(1)), heading.group(2)
            if level == QUESTION_LEVEL:
                current = _start_question(title, path, number, topic)
                questions.append(current)
                state = "after-title"
            else:
                current = None
                if level == 1 and topic is None:
                    topic = title
            continue

        if current is None or not line:
            continue

        if state == "after-title":
            source = _SOURCE_RE.match(line)
            if source:
                current.source_label = source.group("label")
                current.source_href = source.group("href")
                state = "after-source"
            else:
                current.errors.append(f"line {number}: expected 'Source: [Page title](../../wiki/...)', found {line!r}")
                state = "invalid"
        elif state == "after-source":
            if line == "Expected points:":
                state = "points"
            else:
                current.errors.append(f"line {number}: expected 'Expected points:', found {line!r}")
                state = "invalid"
        elif state == "points":
            point = _POINT_RE.match(line)
            if point:
                current.points.append(point.group("text"))
            elif raw.startswith("  ") and current.points:
                current.points[-1] += " " + line.strip()
            else:
                current.errors.append(f"line {number}: expected a '- ' bullet point, found {line!r}")
                state = "invalid"

    for question in questions:
        if question.errors:
            continue
        if question.source_href is None:
            question.errors.append("missing 'Source:' line")
        elif not question.points:
            question.errors.append("missing 'Expected points:' bullets")

    return questions


def question_files() -> list[Path]:
    return sorted(QUESTION_DIR.glob("*.md"))


def load_questions() -> list[Question]:
    return [question for path in question_files() for question in parse_file(path)]


def _start_question(title: str, path: Path, number: int, topic: str | None) -> Question:
    match = _QUESTION_TITLE_RE.match(title)
    if match:
        question = Question(id=match.group("id"), text=match.group("text"), file=path, line=number, topic=topic)
    else:
        question = Question(id=None, text=title, file=path, line=number, topic=topic)
        question.errors.append(
            "heading must be '## TOPIC-AREA-NNN — Question text' (stable ID, space, em dash, space, question)"
        )
    if topic is None:
        question.errors.append("file must start with a '# Topic name' heading before its first question")
    return question
