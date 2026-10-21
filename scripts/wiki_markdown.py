"""A strict renderer for the Markdown subset the wiki uses (standard library only).

The study site's Learn pages are rendered with this module, and the validator
uses it to check that every wiki page stays within the supported subset. The
rendered HTML is inserted into the page with ``innerHTML``, so this module is
the security boundary: every piece of text is escaped before any markup is
added, and only links with a safe scheme are emitted.

Supported blocks:
  - ATX headings, levels 1-3 (``# Title``, ``## Section``, ``### Detail``);
  - paragraphs (consecutive lines are joined);
  - unordered (``-``, ``*``, ``+``) and ordered (``1.``) lists, one level deep;
  - pipe tables with an alignment row (``| --- | :---: | ---: |``);
  - fenced code blocks (````` ``` ````` or ``~~~``) with an optional language;
  - blockquotes containing paragraphs and lists;
  - horizontal rules (``---``, ``***``, ``___``).

Supported inline syntax: code spans, ``**bold**``, ``*italic*``, links
``[text](target)``, and backslash escapes of punctuation.

Anything else that Markdown would treat specially raises
``UnsupportedMarkdown(path, line, construct)``: raw HTML, images, nested lists,
footnotes, reference-style links, setext headings, headings deeper than level
3, indented code blocks, unclosed fences, unmatched backticks, and links with
unsafe schemes such as ``javascript:``. Extend this module when the wiki needs
new syntax rather than letting a page render incorrectly.

Wiki conventions rendered specially:
  - a paragraph starting with ``**Synthesis:**``, ``**Inference:**``,
    ``**Uncertainty:**``, ``**Personal observation:**``, or ``**Conflict:**``
    becomes ``<aside class="callout callout-<label>">``;
  - a paragraph made only of ``[Source](...)`` links, or starting with
    ``Source:`` or ``Sources:``, becomes ``<p class="citation">``;
  - links whose text is exactly ``Source`` get ``class="cite"``.

Heading IDs come from ``github_slug`` with GitHub's numbering of duplicates, the
same function the validator uses for anchors, so question anchors, validator
checks, and rendered IDs cannot diverge.
"""

from __future__ import annotations

import html
import re
from collections import defaultdict
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Callable

FENCE_RE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$")

CALLOUT_LABELS = ("Synthesis", "Inference", "Uncertainty", "Personal observation", "Conflict")
SAFE_SCHEMES = ("http", "https", "mailto")
MAX_HEADING_LEVEL = 3

_SCHEME_RE = re.compile(r"^([a-z][a-z0-9+.-]*):", re.IGNORECASE)
_OPEN_FENCE_RE = re.compile(r"^(`{3,}|~{3,})[ \t]*([\w+#.-]*)[ \t]*$")
_ATX_RE = re.compile(r"^(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$")
_HR_RE = re.compile(r"^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$")
_SETEXT_RE = re.compile(r"^(?:=+|-+)[ \t]*$")
_BULLET_RE = re.compile(r"^([-*+])[ \t]+(.*)$")
_ORDERED_RE = re.compile(r"^(\d{1,9})\.[ \t]+(.*)$")
_EMPTY_ITEM_RE = re.compile(r"^(?:[-*+]|\d{1,9}\.)[ \t]*$")
_ALIGN_CELL_RE = re.compile(r"^:?-+:?$")
_DEFINITION_RE = re.compile(r"^\[[^\]]+\]:")
_CODE_SPAN_RE = re.compile(r"(`+)(.+?)(?<!`)\1(?!`)")
_ESCAPE_RE = re.compile(r"\\([!-/:-@\[-`{-~])")
# One level of balanced parentheses is allowed inside a link target.
_LINK_RE = re.compile(r"\[([^\[\]]*)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)")
_RAW_HTML_RE = re.compile(r"<(?:[A-Za-z][A-Za-z0-9-]*(?:\s|/?>)|/[A-Za-z]|!--|\?|https?:|mailto:)")
_STRONG_RE = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*")
_EM_RE = re.compile(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])")
_TOKEN_RE = re.compile("\x00(\\d+)\x00")
_SOURCE_ONLY_RE = re.compile(r"^(?:\[Source\]\([^)]*\)(?:\s*(?:,|;|and)\s*|\s*)?)+\.?$")
_CITATION_PREFIX_RE = re.compile(r"^Sources?:\s")
_TAG_RE = re.compile(r"<[^>]+>")


class UnsupportedMarkdown(ValueError):
    """Raised for syntax outside the supported subset, with the file and line."""

    def __init__(self, path: str | Path | None, line: int, construct: str):
        self.path = str(path) if path is not None else "<text>"
        self.line = line
        self.construct = construct
        super().__init__(f"{self.path}:{line}: unsupported Markdown: {construct}")


@dataclass
class Heading:
    level: int  # as written in Markdown (1-3)
    text: str  # plain text
    anchor: str  # GitHub-style anchor, without the "#"
    line: int


@dataclass
class Rendered:
    title: str | None  # plain text of the first level-1 heading
    html: str
    headings: list[Heading] = field(default_factory=list)
    words: int = 0


# A link resolver maps a link target, as written, to (href, opens_in_new_tab).
LinkResolver = Callable[[str], "tuple[str, bool]"]


# --- Heading anchors (shared with scripts/validate.py) --------------------------


def github_slug(heading: str) -> str:
    """The anchor GitHub generates for a heading's text, before duplicate numbering."""
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", heading)  # links -> link text
    text = re.sub(r"<[^>]+>", "", text)  # inline HTML
    text = text.lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


class AnchorCounter:
    """Numbers duplicate slugs the way GitHub does: slug, slug-1, slug-2, …"""

    def __init__(self) -> None:
        self.seen: dict[str, int] = defaultdict(int)

    def __call__(self, heading_text: str) -> str:
        slug = github_slug(heading_text)
        anchor = slug if self.seen[slug] == 0 else f"{slug}-{self.seen[slug]}"
        self.seen[slug] += 1
        return anchor


@cache
def heading_anchors(path: Path) -> frozenset[str]:
    """Anchors GitHub generates for the headings in ``path``."""
    anchors: set[str] = set()
    counter = AnchorCounter()
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
        if heading:
            anchors.add(counter(heading.group(2)))
    return frozenset(anchors)


# --- Links ----------------------------------------------------------------------------


def default_link_resolver(target: str) -> tuple[str, bool]:
    """Keep the target; external links open in a new tab."""
    return target, bool(_SCHEME_RE.match(target))


def is_external(target: str) -> bool:
    return bool(_SCHEME_RE.match(target))


# --- Rendering --------------------------------------------------------------------------


def render(
    text: str,
    path: str | Path | None = None,
    *,
    resolve_link: LinkResolver = default_link_resolver,
    heading_offset: int = 0,
    id_prefix: str = "",
    strip_title: bool = False,
) -> Rendered:
    """Render ``text``; ``path`` is only used in error messages.

    ``heading_offset`` shifts rendered heading levels (``## A`` becomes ``h3``
    with an offset of 1) without changing anchors. ``id_prefix`` is prepended to
    every heading ``id`` so headings cannot collide with IDs on the host page.
    With ``strip_title``, a level-1 heading on the first line is returned as
    ``title`` and left out of the HTML.
    """
    renderer = _Renderer(path, resolve_link, heading_offset, id_prefix)
    lines = text.splitlines()
    if "\x00" in text:
        raise UnsupportedMarkdown(path, 1 + text[: text.index("\x00")].count("\n"), "NUL character")
    out = renderer.blocks(lines, 1, quoted=False)
    title = None
    if renderer.headings and renderer.headings[0].level == 1:
        title = renderer.headings[0].text
        if strip_title and renderer.headings[0].line == _first_content_line(lines):
            out = out[1:]
    body = "\n".join(out) + ("\n" if out else "")
    words = len(html.unescape(_TAG_RE.sub(" ", body)).split())
    return Rendered(title=title, html=body, headings=renderer.headings, words=words)


def render_file(path: Path, **options) -> Rendered:
    return render(path.read_text(encoding="utf-8"), path, **options)


def render_inline(text: str, path: str | Path | None = None, line: int = 1, *, resolve_link=default_link_resolver) -> str:
    """Render one line of inline Markdown (used for index summaries)."""
    return _Renderer(path, resolve_link, 0, "").inline(text, line)


def plain_text(text: str) -> str:
    """Inline Markdown reduced to its visible text (for titles and summaries)."""
    return html.unescape(_TAG_RE.sub("", render_inline(text)))


def _first_content_line(lines: list[str]) -> int:
    for number, line in enumerate(lines, 1):
        if line.strip():
            return number
    return 0


class _Renderer:
    def __init__(self, path, resolve_link: LinkResolver, heading_offset: int, id_prefix: str):
        self.path = path
        self.resolve_link = resolve_link
        self.heading_offset = heading_offset
        self.id_prefix = id_prefix
        self.anchor = AnchorCounter()
        self.headings: list[Heading] = []

    def fail(self, line: int, construct: str):
        raise UnsupportedMarkdown(self.path, line, construct)

    # --- Blocks -------------------------------------------------------------------

    def blocks(self, lines: list[str], first: int, *, quoted: bool) -> list[str]:
        """Render ``lines``; ``first`` is the file line number of ``lines[0]``."""
        out: list[str] = []
        index = 0
        while index < len(lines):
            raw = lines[index]
            number = first + index
            if "\t" in raw[: len(raw) - len(raw.lstrip())]:
                self.fail(number, "tab indentation")
            line = raw.rstrip()
            if not line:
                index += 1
                continue
            indent = len(line) - len(line.lstrip(" "))
            stripped = line.lstrip(" ")
            if indent >= 4:
                self.fail(number, "indented code block (use a fenced code block)")

            if FENCE_RE.match(line):
                if quoted:
                    self.fail(number, "code block inside a blockquote")
                index = self.code_block(lines, index, first, out)
            elif stripped.startswith("#"):
                if quoted:
                    self.fail(number, "heading inside a blockquote")
                self.heading(stripped, number, out)
                index += 1
            elif _HR_RE.match(stripped):
                out.append("<hr>")
                index += 1
            elif stripped.startswith(">"):
                if quoted:
                    self.fail(number, "nested blockquote")
                index = self.blockquote(lines, index, first, out)
            elif stripped.startswith("|"):
                if quoted:
                    self.fail(number, "table inside a blockquote")
                index = self.table(lines, index, first, out)
            elif _BULLET_RE.match(stripped) or _ORDERED_RE.match(stripped) or _EMPTY_ITEM_RE.match(stripped):
                if indent:
                    self.fail(number, "indented list (nested lists are not supported)")
                index = self.list_block(lines, index, first, out)
            else:
                index = self.paragraph(lines, index, first, out)
        return out

    def starts_block(self, line: str) -> bool:
        stripped = line.strip()
        return bool(
            not stripped
            or FENCE_RE.match(line)
            or stripped.startswith(("#", ">", "|"))
            or _HR_RE.match(stripped)
            or _BULLET_RE.match(stripped)
            or _ORDERED_RE.match(stripped)
        )

    def code_block(self, lines, index, first, out) -> int:
        opening = lines[index].strip()
        match = _OPEN_FENCE_RE.match(opening)
        if not match or lines[index].startswith(" "):
            self.fail(first + index, f"code fence {opening!r} (use ``` or ~~~ at the start of the line, then an optional language)")
        fence, language = match.groups()
        body: list[str] = []
        for end in range(index + 1, len(lines)):
            candidate = lines[end].strip()
            if candidate.startswith(fence[0] * len(fence)) and set(candidate) == {fence[0]}:
                attr = f' class="language-{html.escape(language, quote=True)}"' if language else ""
                code = html.escape("\n".join(body) + ("\n" if body else ""), quote=False)
                out.append(f"<pre><code{attr}>{code}</code></pre>")
                return end + 1
            body.append(lines[end])
        self.fail(first + index, "unclosed code fence")

    def heading(self, stripped: str, number: int, out) -> None:
        match = _ATX_RE.match(stripped)
        if not match or match.group(2) is None:
            self.fail(number, "'#' at the start of a line without a heading (write '# Heading' with a space)")
        level = len(match.group(1))
        if level > MAX_HEADING_LEVEL:
            self.fail(number, f"level-{level} heading (only levels 1-{MAX_HEADING_LEVEL} are supported)")
        source = match.group(2)
        # Anchors come from the raw heading text, exactly as the validator reads it.
        validator_text = HEADING_RE.match(stripped).group(2)
        anchor = self.anchor(validator_text)
        content = self.inline(source, number)
        text = html.unescape(_TAG_RE.sub("", content))
        self.headings.append(Heading(level=level, text=text, anchor=anchor, line=number))
        tag = f"h{min(6, level + self.heading_offset)}"
        out.append(f'<{tag} id="{html.escape(self.id_prefix + anchor, quote=True)}">{content}</{tag}>')

    def blockquote(self, lines, index, first, out) -> int:
        inner: list[str] = []
        start = index
        while index < len(lines) and lines[index].lstrip(" ").startswith(">"):
            content = lines[index].lstrip(" ")[1:]
            inner.append(content[1:] if content.startswith(" ") else content)
            index += 1
        rendered = self.blocks(inner, first + start, quoted=True)
        out.append("<blockquote>\n" + "\n".join(rendered) + "\n</blockquote>")
        return index

    def table(self, lines, index, first, out) -> int:
        number = first + index
        header = self.cells(lines[index], number)
        if index + 1 >= len(lines) or not lines[index + 1].strip().startswith("|"):
            self.fail(number, "table without an alignment row ('| --- | --- |')")
        aligns_raw = self.cells(lines[index + 1], number + 1)
        if not all(_ALIGN_CELL_RE.match(cell) for cell in aligns_raw):
            self.fail(number + 1, "table without an alignment row ('| --- | --- |')")
        if len(aligns_raw) != len(header):
            self.fail(number + 1, f"alignment row has {len(aligns_raw)} cells, header has {len(header)}")
        aligns = []
        for cell in aligns_raw:
            if cell.startswith(":") and cell.endswith(":"):
                aligns.append(' class="align-center"')
            elif cell.endswith(":"):
                aligns.append(' class="align-right"')
            else:
                aligns.append("")

        def row(cells, tag, line):
            return "<tr>" + "".join(
                f"<{tag}{align}>{self.inline(cell, line)}</{tag}>" for cell, align in zip(cells, aligns)
            ) + "</tr>"

        body = []
        index += 2
        while index < len(lines) and lines[index].strip().startswith("|"):
            line_number = first + index
            cells = self.cells(lines[index], line_number)
            if len(cells) != len(header):
                self.fail(line_number, f"table row has {len(cells)} cells, header has {len(header)}")
            body.append(row(cells, "td", line_number))
            index += 1
        if index < len(lines) and lines[index].strip():
            self.fail(first + index, "text directly after a table (leave a blank line)")
        tbody = "<tbody>\n" + "\n".join(body) + "\n</tbody>\n" if body else ""
        out.append(
            '<div class="table-wrap"><table>\n<thead>\n'
            + row(header, "th", number)
            + "\n</thead>\n"
            + tbody
            + "</table></div>"
        )
        return index

    def cells(self, line: str, number: int) -> list[str]:
        """Split a table row on pipes outside code spans; ``\\|`` is a literal pipe."""
        text = line.strip()
        if not text.endswith("|") or len(text) < 2:
            self.fail(number, "table row must start and end with '|'")
        text = text[1:-1]
        cells, current, ticks, position = [], [], 0, 0
        while position < len(text):
            char = text[position]
            if char == "\\" and position + 1 < len(text) and text[position + 1] == "|" and not ticks:
                current.append("\\|")
                position += 2
                continue
            if char == "`":
                run = len(text[position:]) - len(text[position:].lstrip("`"))
                ticks = 0 if ticks == run else (ticks or run)
                current.append("`" * run)
                position += run
                continue
            if char == "|" and not ticks:
                cells.append("".join(current).strip())
                current = []
            else:
                current.append(char)
            position += 1
        cells.append("".join(current).strip())
        return cells

    def list_block(self, lines, index, first, out) -> int:
        first_line = lines[index].strip()
        ordered = bool(_ORDERED_RE.match(first_line))
        marker = None if ordered else first_line[0]
        start = int(_ORDERED_RE.match(first_line).group(1)) if ordered else None
        items: list[tuple[int, str]] = []

        def item_match(line: str):
            stripped = line.strip()
            if _EMPTY_ITEM_RE.match(stripped):
                self.fail(first + index, "empty list item")
            if ordered:
                return _ORDERED_RE.match(stripped) if not line.startswith(" ") else None
            match = _BULLET_RE.match(stripped)
            return match if match and match.group(1) == marker and not line.startswith(" ") else None

        while index < len(lines):
            line = lines[index].rstrip()
            number = first + index
            match = item_match(line) if line.strip() else None
            if match:
                items.append((number, match.group(2)))
                index += 1
                continue
            if not line.strip():
                # A blank line ends the list unless another item of the same kind follows.
                following = index + 1
                while following < len(lines) and not lines[following].strip():
                    following += 1
                if following < len(lines) and item_match(lines[following].rstrip()):
                    index = following
                    continue
                break
            stripped = line.strip()
            if line.startswith(" ") and (_BULLET_RE.match(stripped) or _ORDERED_RE.match(stripped)):
                self.fail(number, "nested list")
            if self.starts_block(line) and not line.startswith(" "):
                break
            if stripped.startswith(("```", "~~~", ">", "|", "#")):
                self.fail(number, "block inside a list item")
            # Continuation of the previous item (indented or lazy).
            item_line, text = items[-1]
            items[-1] = (item_line, f"{text} {stripped}")
            index += 1

        tag = "ol" if ordered else "ul"
        attr = f' start="{start}"' if ordered and start != 1 else ""
        body = "\n".join(f"<li>{self.inline(text, line)}</li>" for line, text in items)
        out.append(f"<{tag}{attr}>\n{body}\n</{tag}>")
        return index

    def paragraph(self, lines, index, first, out) -> int:
        start = index
        collected: list[str] = []
        while index < len(lines):
            line = lines[index]
            if index > start:
                if not line.strip():
                    break
                if _SETEXT_RE.match(line.strip()):
                    self.fail(first + index, "setext heading (use '# Heading' or '## Heading')")
                if self.starts_block(line):
                    break
            stripped = line.strip()
            if _DEFINITION_RE.match(stripped):
                construct = "footnote definition" if stripped.startswith("[^") else "reference-style link definition"
                self.fail(first + index, construct)
            collected.append(stripped)
            index += 1
        text = "\n".join(collected)
        number = first + start
        label = next((label for label in CALLOUT_LABELS if text.startswith(f"**{label}:**")), None)
        content = self.inline(text, number)
        if label:
            css = label.lower().replace(" ", "-")
            out.append(f'<aside class="callout callout-{css}">\n<p>{content}</p>\n</aside>')
        elif _SOURCE_ONLY_RE.match(text) or _CITATION_PREFIX_RE.match(text):
            out.append(f'<p class="citation">{content}</p>')
        else:
            out.append(f"<p>{content}</p>")
        return index

    # --- Inline ---------------------------------------------------------------------

    def inline(self, text: str, line: int) -> str:
        tokens: list[str] = []

        def stash(fragment: str) -> str:
            tokens.append(fragment)
            return f"\x00{len(tokens) - 1}\x00"

        def line_of(position: int) -> int:
            return line + text.count("\n", 0, position)

        # 1. Code spans first, so their contents are never transformed.
        def code(match: re.Match) -> str:
            content = match.group(2).replace("\n", " ")
            if len(content) > 2 and content.startswith(" ") and content.endswith(" ") and content.strip():
                content = content[1:-1]
            return stash(f"<code>{html.escape(content, quote=False)}</code>")

        work = _CODE_SPAN_RE.sub(code, text)
        if "`" in work:
            self.fail(line_of(text.find("`")), "unmatched backtick")
        # 2. Backslash escapes of punctuation.
        work = _ESCAPE_RE.sub(lambda match: stash(html.escape(match.group(1), quote=False)), work)

        # 3. Constructs that are not supported.
        for pattern, construct in (
            (_RAW_HTML_RE, "raw HTML or autolink"),
            (re.compile(r"!\["), "image"),
            (re.compile(r"\[\^"), "footnote"),
            (re.compile(r"\]\s?\["), "reference-style link"),
        ):
            found = pattern.search(work)
            if found:
                self.fail(line_of(found.start()), construct)

        # 4. Links; their text may contain code spans and emphasis.
        def link(match: re.Match) -> str:
            label, target = match.group(1), match.group(2)
            if not label.strip():
                self.fail(line, "link without text")
            if not target:
                self.fail(line, "link without a target")
            scheme = _SCHEME_RE.match(target)
            if scheme and scheme.group(1).lower() not in SAFE_SCHEMES:
                self.fail(line, f"link with an unsafe scheme ({scheme.group(1)}:)")
            href, new_tab = self.resolve_link(target)
            scheme = _SCHEME_RE.match(href)
            if scheme and scheme.group(1).lower() not in SAFE_SCHEMES:
                self.fail(line, f"link resolved to an unsafe scheme ({scheme.group(1)}:)")
            attrs = f' href="{html.escape(href, quote=True)}"'
            if label == "Source":
                attrs += ' class="cite"'
            if new_tab:
                attrs += ' target="_blank" rel="noopener"'
            return stash(f"<a{attrs}>{self.emphasis(html.escape(label, quote=False))}</a>")

        work = _LINK_RE.sub(link, work)
        leftover = re.search(r"\]\(", work)
        if leftover:
            self.fail(line_of(leftover.start()), "malformed link (spaces, quotes, or unbalanced parentheses in the target?)")

        # 5. Escape the remaining prose, then add emphasis.
        work = self.emphasis(html.escape(work, quote=False))
        while _TOKEN_RE.search(work):
            work = _TOKEN_RE.sub(lambda match: tokens[int(match.group(1))], work)
        return work

    @staticmethod
    def emphasis(escaped: str) -> str:
        escaped = _STRONG_RE.sub(r"<strong>\1</strong>", escaped)
        return _EM_RE.sub(r"<em>\1</em>", escaped)
