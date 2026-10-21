# LLM Wiki

A small, Git-backed personal knowledge base built from immutable Markdown sources and synthesized topic pages.

## Start here

- Browse the knowledge map at [`wiki/index.md`](wiki/index.md).
- Inspect original material in [`sources/`](sources/README.md).
- Study with the per-topic review questions listed in [`learning/questions.md`](learning/questions.md).
- Study on the [study site](#study-site): a daily review, wiki pages to learn, and practice flashcards, generated from the wiki and its questions on every push to `main`.
- Review repository activity in [`log.md`](log.md).

## How the repository is organized

```text
sources/   Immutable notes, articles, books, papers, and attachments
wiki/      Editable synthesis organized by topic and source type
learning/  Active-recall questions and review history
scripts/   Validation, the Markdown renderer, and the study-site build (Python standard library only)
site/      Static study app; served with generated cards and Learn pages
server/    Progress server for the study site (Python standard library, SQLite)
tests/     Python unit tests (python3 -m unittest discover -s tests)
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

The knowledge base deliberately uses Markdown and Git only: it has no database, vector store, or generated search index. The one database is the study site's review progress, a SQLite file on the VPS outside the repository; it holds review history, never knowledge.

## Study site

The study site's cards and Learn pages are generated, never written by hand. `scripts/build_flashcards.py` reads `learning/questions/` and writes `_site/cards.json` next to the static app from `site/`, recording the date each question was first committed so recent cards get a **New** badge. It also renders every topic page under `wiki/` into `_site/learn/` (an `index.json` in wiki index order plus one HTML fragment per page) with `scripts/wiki_markdown.py`, a strict renderer for the Markdown subset the wiki uses; the build and `scripts/validate.py` fail with the file and line when a page uses anything else. The site has four views:

- **Today** — a short daily review (due cards first, then a few new ones; 12 cards by default), with a streak, mastered and due-tomorrow counts, a 12-week activity grid, and the topic list. A day counts toward the streak when its deck is finished or it has at least 10 reviews of any kind. New cards come only from pages marked as learned in Learn; when nothing is due and no new cards are available, Today offers the next page to learn.
- **Learn** — the wiki's topics and pages in index order, with pages learned and mastery. The reader shows a page with a section list (a sticky sidebar on wide screens, an "On this page" menu on phones), a chip on each section that has questions, and **Check yourself** with the page's questions. Grading there starts each card's schedule. **Mark as learned** makes the page's remaining questions eligible as new cards in Today, and **Next page** follows the index order. Wiki links stay inside Learn; source and library links open on GitHub.
- **Practice** — free review of one topic, all topics, or a chosen set, shuffled or weakest first. Practice counts toward the daily goal but never changes when a card is next due.
- **Settings** — cards per day, new cards per day, the daily goal, whether new cards come only from learned pages (on by default), **Sync across devices** (connect this device with its token, sync now, or disconnect), and **Export progress**, **Import progress** (merges a file; newer rows win), and **Reset progress on this device**.

During a review, `Space` shows the answer, `1`/`2` (or `j`/`k`) grade it, the arrow keys move between cards, `/` browses the session's cards, and `Esc` leaves. On a phone, swipe a revealed card right for "knew it" or left for "missed it". Outside a review, `/` searches every card. Old card links such as `#DATA-OL-004` still open that card.

Scheduling uses Leitner boxes with intervals of 1, 2, 4, 8, 16, and 32 days, derived from an append-only log of reviews. Progress from the earlier flashcards app is carried over automatically, and the pages of carried-over cards count as learned. The site is an installable web app: a service worker caches it, so it opens and reviews offline once loaded, and after a deploy the header offers **Update available · Reload**.

### Where it runs and where progress lives

- **VPS (primary).** The `Dockerfile` builds `_site/` inside the image and runs `server/progress_server.py`, which serves the site and stores progress in SQLite (`/data/progress.db`, mounted from `/var/lib/llm-wiki` on the host, with a daily `VACUUM INTO` snapshot in `/data/backups`, 30 kept). The [vps-apps](https://github.com/GeorgeDanicico/vps-apps) repository deploys it with `docker-compose.yml` on every push to `main`, behind the host's TLS reverse proxy. The build never writes into the host's wiki checkout.
- **Sync.** Each device keeps working in its own browser storage and syncs with the server when it has a device token: on start, when it comes back to the foreground or online, a few seconds after a grade, and every five minutes. The header shows **Synced**, **Saving…**, **Offline · N pending**, or **Disconnected**. Paste a token once under **Settings → Sync across devices**; connecting uploads the device's existing progress, and the merge rule (newer timestamp wins) makes that safe. Phone and laptop then share one review log, schedule, and streak.
- **GitHub Pages (local-only fallback).** The **Deploy flashcards** workflow still publishes the same site to [GitHub Pages](https://georgedanicico.github.io/llm-wiki/). There is no server there, so progress stays in that browser; move it with **Export** and **Import**.

Device tokens are random strings; the server stores only their SHA-256 hashes, in `PROGRESS_TOKEN_HASHES=<device>:<hex>,…` in `/etc/llm-wiki/study.env`. To add a device, create a token and record its hash:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
printf %s '<token>' | sha256sum
```

To revoke a device, remove its entry and redeploy or restart the container; that device then shows **Disconnected** and keeps its local progress. `GET /api/export` (with a token) returns every stored row in the app's import format. Server settings are documented at the top of [`server/progress_server.py`](server/progress_server.py).

### Tests and local preview

The scheduling, storage, and sync code has unit tests (`node --test site/js/lib/*.test.mjs`); the renderer, Learn build, service worker build, and progress server have Python tests (`python3 -m unittest discover -s tests`). Both run in `validate.yml`.

To preview without sync:

```bash
python3 scripts/build_flashcards.py && python3 -m http.server --directory _site
```

To run the site with the progress server locally (use throwaway test tokens):

```bash
python3 scripts/build_flashcards.py
PROGRESS_DB=/tmp/study/progress.db PROGRESS_BACKUP_DIR=/tmp/study/backups SITE_DIR=_site \
  PROGRESS_TOKEN_HASHES="laptop:$(printf %s local-test-laptop | shasum -a 256 | cut -d' ' -f1)" \
  python3 server/progress_server.py   # http://localhost:8000
```

