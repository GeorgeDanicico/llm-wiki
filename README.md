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

The flashcards are generated, never written by hand. `scripts/build_flashcards.py` reads `learning/questions/` and writes `_site/cards.json` next to the static app from `site/`. The **Deploy flashcards** workflow publishes it to GitHub Pages on every push to `main`. Use Prev/Next (or the arrow keys) to move between cards, or **Browse all** (`/`) to search the session's questions and jump to any of them. Each card has its own link, such as `#DATA-OL-004`. Progress is stored only in each browser's local storage.

To preview locally:

```bash
python3 scripts/build_flashcards.py && python3 -m http.server --directory _site
```

