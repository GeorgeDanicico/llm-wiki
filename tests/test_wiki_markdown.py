"""Tests for the study site's strict Markdown renderer (scripts/wiki_markdown.py).

Run with: python3 -m unittest discover -s tests
"""

from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import build_flashcards  # noqa: E402
from question_bank import load_questions  # noqa: E402
from wiki_markdown import (  # noqa: E402
    UnsupportedMarkdown,
    github_slug,
    heading_anchors,
    render,
    render_file,
    render_inline,
)


def md(text: str) -> str:
    return render(textwrap.dedent(text).strip("\n") + "\n").html


class Blocks(unittest.TestCase):
    def test_headings_levels_one_to_three_with_ids(self):
        out = md(
            """
            # Title
            ## A section
            ### A `detail`
            """
        )
        self.assertIn('<h1 id="title">Title</h1>', out)
        self.assertIn('<h2 id="a-section">A section</h2>', out)
        self.assertIn('<h3 id="a-detail">A <code>detail</code></h3>', out)

    def test_heading_offset_prefix_and_title(self):
        result = render("# Page\n\n## Part\n\nText\n", heading_offset=1, id_prefix="wiki-", strip_title=True)
        self.assertEqual(result.title, "Page")
        self.assertNotIn("Page", result.html)
        self.assertIn('<h3 id="wiki-part">Part</h3>', result.html)

    def test_duplicate_headings_are_numbered_like_github(self):
        result = render("## Notes\n\n## Notes\n\n## Notes\n")
        self.assertEqual([h.anchor for h in result.headings], ["notes", "notes-1", "notes-2"])

    def test_paragraph_lines_are_joined(self):
        self.assertEqual(md("one\ntwo\n\nthree"), "<p>one\ntwo</p>\n<p>three</p>\n")

    def test_unordered_and_ordered_lists(self):
        self.assertEqual(md("- a\n- b"), "<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n")
        self.assertEqual(md("1. a\n2. b"), "<ol>\n<li>a</li>\n<li>b</li>\n</ol>\n")
        self.assertIn('<ol start="3">', md("3. c\n4. d"))

    def test_list_continuation_lines_join_the_item(self):
        self.assertEqual(md("- first\n  continued\n- second"), "<ul>\n<li>first continued</li>\n<li>second</li>\n</ul>\n")

    def test_loose_list_stays_one_list(self):
        self.assertEqual(md("- a\n\n- b").count("<ul>"), 1)

    def test_table_with_alignment(self):
        out = md(
            """
            | Left | Centre | Right |
            | --- | :---: | ---: |
            | `a|b` | **x** | 1 |
            """
        )
        self.assertIn('<div class="table-wrap"><table>', out)
        self.assertIn("<th>Left</th>", out)
        self.assertIn('<th class="align-center">Centre</th>', out)
        self.assertIn('<td class="align-right">1</td>', out)
        # A pipe inside a code span does not split the cell.
        self.assertIn("<td><code>a|b</code></td>", out)
        self.assertNotIn("style=", out)

    def test_fenced_code_with_language_is_escaped_verbatim(self):
        out = md(
            """
            ```java
            List<String> a = x && y; // **not bold** [not](link)
            ```
            """
        )
        self.assertEqual(
            out,
            '<pre><code class="language-java">List&lt;String&gt; a = x &amp;&amp; y; '
            "// **not bold** [not](link)\n</code></pre>\n",
        )

    def test_tilde_fence_without_language(self):
        self.assertEqual(md("~~~\nplain\n~~~"), "<pre><code>plain\n</code></pre>\n")

    def test_blockquote(self):
        self.assertEqual(md("> quoted **text**\n> more"), "<blockquote>\n<p>quoted <strong>text</strong>\nmore</p>\n</blockquote>\n")

    def test_horizontal_rule(self):
        self.assertEqual(md("a\n\n---\n\nb"), "<p>a</p>\n<hr>\n<p>b</p>\n")


class Inline(unittest.TestCase):
    def test_bold_italic_and_code(self):
        self.assertEqual(render_inline("**b** and *i* and `c`"), "<strong>b</strong> and <em>i</em> and <code>c</code>")

    def test_code_spans_are_not_transformed(self):
        self.assertEqual(render_inline("`**x** [a](b) <i>`"), "<code>**x** [a](b) &lt;i&gt;</code>")

    def test_double_backtick_code_span(self):
        self.assertEqual(render_inline("`` a`b ``"), "<code>a`b</code>")

    def test_less_than_in_prose_is_escaped(self):
        self.assertEqual(render_inline("a < b & c > d"), "a &lt; b &amp; c &gt; d")

    def test_backslash_escapes(self):
        self.assertEqual(render_inline(r"\*not italic\*"), "*not italic*")

    def test_snake_case_and_lone_stars_stay_literal(self):
        self.assertEqual(render_inline("a_b_c and 2 * 3"), "a_b_c and 2 * 3")


class Escaping(unittest.TestCase):
    def test_script_tag_is_rejected(self):
        with self.assertRaises(UnsupportedMarkdown):
            render("Hello <script>alert(1)</script>\n")

    def test_img_onerror_is_rejected(self):
        with self.assertRaises(UnsupportedMarkdown):
            render('<img src=x onerror="alert(1)">\n')

    def test_html_inside_code_is_escaped(self):
        out = md("`<script>alert(1)</script>` and `<img src=x onerror=alert(1)>`")
        self.assertNotIn("<script", out)
        self.assertNotIn("<img", out)
        self.assertIn("&lt;script&gt;", out)

    def test_javascript_links_are_rejected(self):
        for target in ("javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x"):
            with self.subTest(target=target), self.assertRaises(UnsupportedMarkdown):
                render(f"[click]({target})\n")

    def test_resolver_cannot_produce_an_unsafe_scheme(self):
        with self.assertRaises(UnsupportedMarkdown):
            render("[x](page.md)\n", resolve_link=lambda target: ("javascript:alert(1)", False))

    def test_quotes_in_link_targets_are_escaped(self):
        out = render_inline('[x](a"onmouseover="alert(1))')
        self.assertNotIn('"onmouseover', out)
        self.assertIn("&quot;onmouseover=&quot;", out)
        out = render_inline("[x](a'b)")
        self.assertIn("a&#x27;b", out)

    def test_link_text_is_escaped(self):
        self.assertEqual(render_inline("[a & b](https://example.com)"),
                         '<a href="https://example.com" target="_blank" rel="noopener">a &amp; b</a>')

    def test_entities_are_not_decoded_into_markup(self):
        self.assertEqual(render_inline("&lt;script&gt;"), "&amp;lt;script&amp;gt;")


class Links(unittest.TestCase):
    def test_default_resolver_keeps_relative_and_opens_external_in_new_tab(self):
        self.assertEqual(render_inline("[p](page.md#x)"), '<a href="page.md#x">p</a>')
        self.assertIn('target="_blank" rel="noopener"', render_inline("[e](https://example.com)"))

    def test_source_links_get_the_cite_class(self):
        self.assertIn('class="cite"', render_inline("[Source](../../sources/a.md)"))

    def test_parentheses_in_targets(self):
        self.assertIn('href="https://en.wikipedia.org/wiki/A_(b)"', render_inline("[w](https://en.wikipedia.org/wiki/A_(b))"))

    def test_learn_resolver(self):
        cache_aside = build_flashcards.WIKI_DIR / "reliability" / "cache-aside.md"
        stampedes = build_flashcards.WIKI_DIR / "reliability" / "cache-stampedes.md"
        routes = {cache_aside: ("reliability", "cache-aside"), stampedes: ("reliability", "cache-stampedes")}
        blob = "https://github.com/o/r/blob/main/"
        resolve = build_flashcards.learn_link_resolver(cache_aside, routes, blob)
        self.assertEqual(resolve("cache-stampedes.md"), ("#/learn/reliability/cache-stampedes", False))
        self.assertEqual(resolve("cache-stampedes.md#x-y"), ("#/learn/reliability/cache-stampedes/x-y", False))
        self.assertEqual(resolve("#ttl-semantics"), ("#/learn/reliability/cache-aside/ttl-semantics", False))
        self.assertEqual(resolve("index.md"), ("#/learn/reliability", False))
        self.assertEqual(resolve("../index.md"), ("#/learn", False))
        self.assertEqual(
            resolve("../../sources/notes/a.md#key"), (blob + "sources/notes/a.md#key", True)
        )
        self.assertEqual(resolve("../library/notes/cache-aside.md"), (blob + "wiki/library/notes/cache-aside.md", True))
        self.assertEqual(resolve("https://example.com/"), ("https://example.com/", True))


class WikiConventions(unittest.TestCase):
    def test_labelled_paragraphs_become_callouts(self):
        for label, css in (
            ("Synthesis", "synthesis"),
            ("Inference", "inference"),
            ("Uncertainty", "uncertainty"),
            ("Personal observation", "personal-observation"),
            ("Conflict", "conflict"),
        ):
            with self.subTest(label=label):
                out = md(f"**{label}:** Some text.")
                self.assertTrue(out.startswith(f'<aside class="callout callout-{css}">'))
                self.assertIn(f"<strong>{label}:</strong> Some text.", out)

    def test_other_bold_leads_are_plain_paragraphs(self):
        self.assertTrue(md("**Availability** means…").startswith("<p>"))

    def test_source_only_paragraphs_are_citations(self):
        self.assertTrue(md("[Source](a.md)").startswith('<p class="citation">'))
        self.assertTrue(md("[Source](a.md), [Source](b.md)").startswith('<p class="citation">'))
        self.assertTrue(md("Sources: [A](a.md) and [B](b.md)").startswith('<p class="citation">'))
        self.assertTrue(md("Text. [Source](a.md)").startswith("<p>"))


class Unsupported(unittest.TestCase):
    def assertUnsupported(self, text: str, line: int, construct: str):
        with self.assertRaises(UnsupportedMarkdown) as caught:
            render(textwrap.dedent(text).strip("\n") + "\n", "page.md")
        self.assertEqual(caught.exception.line, line, caught.exception)
        self.assertIn(construct, caught.exception.construct)
        self.assertIn(f"page.md:{line}:", str(caught.exception))

    def test_raw_html(self):
        self.assertUnsupported("# T\n\ntext <b>bold</b>", 3, "raw HTML")

    def test_html_comment(self):
        self.assertUnsupported("ok\n\n<!-- hidden -->", 3, "raw HTML")

    def test_autolink(self):
        self.assertUnsupported("see <https://example.com>", 1, "autolink")

    def test_image(self):
        self.assertUnsupported("text\n\n![alt](a.png)", 3, "image")

    def test_nested_list(self):
        self.assertUnsupported("- a\n  - b", 2, "nested list")

    def test_footnotes(self):
        self.assertUnsupported("Claim.[^1]", 1, "footnote")
        self.assertUnsupported("a\n\n[^1]: note", 3, "footnote")

    def test_reference_links(self):
        self.assertUnsupported("[a][b]", 1, "reference-style link")
        self.assertUnsupported("a\n\n[b]: https://example.com", 3, "reference-style link")

    def test_setext_headings(self):
        self.assertUnsupported("Title\n=====", 2, "setext heading")
        self.assertUnsupported("Title\n-----", 2, "setext heading")

    def test_deep_headings(self):
        self.assertUnsupported("#### Deep", 1, "level-4 heading")

    def test_indented_code(self):
        self.assertUnsupported("a\n\n    code", 3, "indented code block")

    def test_unclosed_fence(self):
        self.assertUnsupported("a\n\n```\ncode", 3, "unclosed code fence")

    def test_unmatched_backtick(self):
        # The shape of a fence mangled by shell quoting: "`" + tab + "ext".
        self.assertUnsupported("a\n\n`\text\ncode\n`", 3, "unmatched backtick")

    def test_table_without_alignment_row(self):
        self.assertUnsupported("| a | b |\n| c | d |", 2, "alignment row")

    def test_table_cell_count(self):
        self.assertUnsupported("| a | b |\n| --- | --- |\n| c |", 3, "1 cells")

    def test_link_with_title(self):
        self.assertUnsupported('[a](b.md "title")', 1, "malformed link")


class WholeWiki(unittest.TestCase):
    def test_every_wiki_page_renders_with_validator_anchors(self):
        pages = sorted((REPO_ROOT / "wiki").rglob("*.md"))
        self.assertTrue(pages)
        for path in pages:
            with self.subTest(page=str(path.relative_to(REPO_ROOT))):
                result = render_file(path)
                self.assertEqual({h.anchor for h in result.headings}, set(heading_anchors(path)))

    def test_question_anchors_match_rendered_heading_ids(self):
        for question in load_questions():
            if not question.source_anchor:
                continue
            with self.subTest(question=question.id):
                result = render_file(question.source_path, id_prefix="wiki-")
                self.assertIn(f'id="wiki-{question.source_anchor}"', result.html)

    def test_github_slug(self):
        self.assertEqual(github_slug("Trade-off & common mistake"), "trade-off--common-mistake")
        self.assertEqual(github_slug("`HashMap` and `ConcurrentHashMap`"), "hashmap-and-concurrenthashmap")
        self.assertEqual(github_slug("4.1 What [it](x.md) guarantees"), "41-what-it-guarantees")

    def test_learn_build_covers_every_question(self):
        questions = load_questions()
        index, fragments = build_flashcards.build_learn(questions, "https://github.com/o/r/blob/main/")
        listed = [q for topic in index["topics"] for page in topic["pages"] for q in page["questions"]]
        self.assertEqual(sorted(listed), sorted(q.id for q in questions))
        names = [topic["slug"] for topic in index["topics"]]
        self.assertEqual(names[0], "language-models")
        for topic in index["topics"]:
            for page in topic["pages"]:
                self.assertIn(f"{topic['slug']}/{page['slug']}.html", fragments)
                self.assertGreaterEqual(page["minutes"], 1)
                self.assertNotIn("[Source]", page["summary"])
        for html_fragment in fragments.values():
            self.assertNotIn("<script", html_fragment)
            self.assertNotIn("style=", html_fragment)

    def test_heading_anchors_reads_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "p.md"
            path.write_text("# A\n\n```\n# not a heading\n```\n\n## B\n## B\n", encoding="utf-8")
            self.assertEqual(heading_anchors(path), {"a", "b", "b-1"})


if __name__ == "__main__":
    unittest.main()
