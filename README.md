# LLM Wiki

A small, Git-backed personal knowledge base built from immutable Markdown sources and synthesized topic pages.

## Start here

- Browse the knowledge map at [`wiki/index.md`](wiki/index.md).
- Inspect original material in [`sources/`](sources/README.md).
- Study with the per-topic review questions listed in [`learning/questions.md`](learning/questions.md).
- Practise with the [flashcards](https://georgedanicico.github.io/llm-wiki/), generated from those questions on every push to `main`.
- Review repository activity in [`log.md`](log.md).

## How the repository is organized

```text
sources/   Immutable notes, articles, books, papers, and attachments
wiki/      Editable synthesis organized by topic and source type
learning/  Active-recall questions and review history
scripts/   Validation and the flashcard build (Python standard library only)
site/      Static flashcard app; GitHub Pages serves it with generated cards.json
log.md     Significant ingestion and maintenance operations
```

Source type and knowledge topic are intentionally separate. For example, notes from a book live under `sources/books/` and have a library page under `wiki/library/books/`, while the book's ideas are compiled into pages under `wiki/distributed-systems/`.

## Adding knowledge

1. Preserve the original material under the appropriate `sources/` directory.
2. Read [`AGENTS.md`](AGENTS.md) and [`wiki/index.md`](wiki/index.md).
3. Search for related pages before creating a new one.
4. Update the relevant topic pages and indexes with source citations.
5. Add durable review questions and append a short entry to `log.md`.
6. Run `python3 scripts/validate.py --base origin/main` before opening a pull request.

The repository deliberately uses Markdown and Git only. It has no database, vector store, or generated search index.

## Flashcards

The flashcards are generated, never written by hand. `scripts/build_flashcards.py` reads `learning/questions/` and writes `_site/cards.json` next to the static app from `site/`, recording the date each question was first committed so recent cards get a **New** badge. The **Deploy flashcards** workflow publishes it to GitHub Pages on every push to `main`.

The site has three views:

- **Today** — a short daily review (due cards first, then a few new ones; 12 cards by default), with a streak, mastered and due-tomorrow counts, a 12-week activity grid, and the topic list. A day counts toward the streak when its deck is finished or it has at least 10 reviews of any kind.
- **Practice** — free review of one topic, all topics, or a chosen set, shuffled or weakest first. Practice counts toward the daily goal but never changes when a card is next due.
- **Settings** — cards per day, new cards per day, the daily goal, and **Export progress**, **Import progress** (merges a file; newer rows win), and **Reset progress on this device**.

During a review, `Space` shows the answer, `1`/`2` (or `j`/`k`) grade it, the arrow keys move between cards, `/` browses the session's cards, and `Esc` leaves. On a phone, swipe a revealed card right for "knew it" or left for "missed it". Outside a review, `/` searches every card. Old card links such as `#DATA-OL-004` still open that card.

Scheduling uses Leitner boxes with intervals of 1, 2, 4, 8, 16, and 32 days, derived from a log of reviews kept only in each browser's local storage. Progress from the earlier flashcards app is carried over automatically. The scheduling and storage code has unit tests: `node --test site/js/lib/*.test.mjs`.

To preview locally:

```bash
python3 scripts/build_flashcards.py && python3 -m http.server --directory _site
```

