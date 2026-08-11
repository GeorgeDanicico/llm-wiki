# LLM Wiki

A small, Git-backed personal knowledge base built from immutable Markdown sources and synthesized topic pages.

## Start here

- Browse the knowledge map at [`wiki/index.md`](wiki/index.md).
- Inspect original material in [`sources/`](sources/README.md).
- Study with [`learning/questions.md`](learning/questions.md).
- Review repository activity in [`log.md`](log.md).

## How the repository is organized

```text
sources/   Immutable notes, articles, books, papers, and attachments
wiki/      Editable synthesis organized by topic and source type
learning/  Active-recall questions and review history
log.md     Significant ingestion and maintenance operations
```

Source type and knowledge topic are intentionally separate. For example, notes from a book live under `sources/books/` and have a library page under `wiki/library/books/`, while the book's ideas are compiled into pages under `wiki/distributed-systems/`.

## Adding knowledge

1. Preserve the original material under the appropriate `sources/` directory.
2. Read [`AGENTS.md`](AGENTS.md) and [`wiki/index.md`](wiki/index.md).
3. Search for related pages before creating a new one.
4. Update the relevant topic pages and indexes with source citations.
5. Add durable review questions and append a short entry to `log.md`.
6. Validate local links before opening a pull request.

The repository deliberately uses Markdown and Git only. It has no database, vector store, or generated search index.

