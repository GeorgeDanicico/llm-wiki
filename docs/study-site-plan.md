# Study site plan: daily review, learn panel, and synced progress

Status: proposed (2026-10-21). This document plans the work; nothing here is implemented yet.

## Goals

- Turn the flashcards into a small study site with three views: **Today** (a short daily review with a streak), **Learn** (read a wiki page, then answer its questions), and **Practice** (free flashcards by topic).
- Keep it usable as the question bank grows from about 90 to several hundred cards.
- Store progress once, on the VPS, so phone and laptop share one streak and one schedule, while reviewing still works offline.
- Keep the repository's rules intact: the wiki and question files stay the only source of truth, generated output is never edited by hand, and `scripts/` stays standard-library Python.

## Non-goals

- Multiple users, sign-up, or passwords. There is one user with one token per device.
- Answer grades beyond "missed it" and "knew it".
- A JavaScript framework, bundler, or npm dependencies.
- Writing review results into the repository automatically. `learning/review-log.md` stays a deliberate, user-requested record.

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Scheduling | Leitner boxes 0–5 with intervals of 1, 2, 4, 8, 16, and 32 days | Fits two grades; boxes already exist in the current app |
| Stored data | An append-only review log; boxes, due dates, and streaks are derived | Derived values cannot disagree, and merging devices is a union |
| Database | SQLite in a host-mounted volume, written by a standard-library Python server | One file, no extra service; survives container rebuilds |
| Auth | One random bearer token per device; the server stores only SHA-256 hashes | No login flow; works in installed PWAs; per-device revocation |
| Offline | `localStorage` is the working copy; a service worker caches the app and pages | Reviews work on a train; Safari's storage eviction no longer loses data |
| Markdown | A strict standard-library renderer for the subset the wiki uses | Keeps `scripts/` dependency-free; fails the build on unsupported syntax |
| Hosting | The VPS container is primary; GitHub Pages keeps working in local-only mode | Pages costs nothing and remains a fallback |
| Delivery | Four pull requests, in order | Each one is reviewable and leaves a working site |

## Architecture

```text
learning/questions/*.md ─┐
wiki/**/*.md ────────────┼─ scripts/build_flashcards.py ─▶ _site/
                         │                                  ├─ index.html, js/, style.css, sw.js, manifest
                         │                                  ├─ cards.json
                         │                                  └─ learn/index.json, learn/<topic>/<page>.html
                         │
Docker image (multi-stage) builds _site/ and runs server/progress_server.py
  ├─ GET  /…            static files from _site/
  ├─ GET  /api/health   no auth
  ├─ POST /api/sync     bearer token; push local changes, pull remote changes
  └─ GET  /api/export   bearer token; full JSON dump
        │
        └─ /data/progress.db  (host: /var/lib/llm-wiki/progress.db, WAL, daily snapshots)

Browser
  ├─ localStorage: review log, pages, settings, outbox, sync cursor, token
  ├─ derived in JS: boxes, due dates, today's deck, streak, mastery
  └─ service worker: app shell precached; cards.json and learn/* network-first
```

## Data model

### Records

Three record types, used identically in the browser and in SQLite.

**Review** — one grading of one card.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text, primary key | `<sessionId>:<cardId>`; regrading in the same session replaces the row. Baselines use `baseline:<cardId>` |
| `card` | text | Question ID, such as `REL-CA-002` |
| `at` | text | ISO 8601 timestamp with the device's offset |
| `day` | text | Local `YYYY-MM-DD` on the device at grading time |
| `mode` | text | `daily`, `learn`, `practice`, or `baseline` |
| `knew` | integer or null | 1 or 0; null for `baseline` |
| `box` | integer or null | Only for `baseline` rows: the box carried over from the old format |
| `device` | text | Set by the server from the token name; informational |

**Page** — whether a wiki page has been learned: `path` (such as `wiki/reliability/cache-aside.md`, primary key), `learned` (0 or 1), `at`.

**Setting** — `key` (primary key), `value` (JSON text), `at`. Keys: `dailySize` (default 12), `newPerDay` (default 4), `dailyGoal` (default 10), `practiceTopics` (array of topic slugs).

Merge rule for every type: the row with the newer `at` wins; ties keep the existing row. Session IDs are random per device and session, so two devices never produce the same review `id`.

### Derived values

All computed in `site/js/lib/` as pure functions with tests.

- **Box per card.** Start at 0. Replay the card's rows in `at` order, ignoring `practice`: a `baseline` row sets the box to its `box`; `knew = 1` moves the box up by one, capped at 5; `knew = 0` sets it to 0. `learn` and `daily` rows count the same.
- **Due date.** The `day` of the last scheduling row plus `INTERVALS[box]` days, where `INTERVALS = [1, 2, 4, 8, 16, 32]`. Not stored, so changing the intervals later reschedules everything.
- **Introduced card.** A card with at least one scheduling row. New cards are cards on learned pages that are not introduced yet. Before the learn panel exists (pull request 1), every card counts as being on a learned page.
- **Today's deck.** Computed only from rows whose `day` is before today, so it does not change during the day and every device computes the same deck:
  1. Due cards (`due ≤ today`), most overdue first; ties ordered by a seeded shuffle.
  2. Up to `newPerDay` new cards, in seeded-shuffle order.
  3. Capped at `dailySize`.
  The seed is a hash of the date string fed to a small PRNG (mulberry32). Cards in the deck with a `daily` row dated today count as done.
- **Day met.** A day with at least `dailyGoal` reviews of any mode, or with today's deck fully graded. Practice can top up a day with few due cards, so there are no neutral days to special-case.
- **Streak.** Consecutive met days ending today; if today is not met yet, ending yesterday, shown as "at risk". Best streak is the longest run in the log.
- **Mastered.** Box 3 or higher, per card, page, and topic.
- **Activity grid.** Reviews per `day` for the last 12 weeks.

### Migration from the current format

The current app stores `{progress: {<id>: {box, reviews, last}}, topics, order}` under `llm-wiki-flashcards:v1`. On first load of the new app:

- Each card in `progress` becomes a `baseline` row: `id = baseline:<card>`, `box` copied, `at` and `day` taken from `last`.
- `topics` becomes the `practiceTopics` setting.
- The v1 key is kept, not deleted, so the old version can still be restored.
- In pull request 2, each page whose cards have baseline rows is marked learned, so existing progress keeps feeding the daily deck.

### Browser storage

- `llm-wiki-study:v2` — `{reviews, pages, settings, outbox: [ids], cursor}`.
- `llm-wiki-study:token` — the device token, kept in its own key so export and import never include it.

Every read and write is wrapped in `try/catch`; the app still works for a session if storage is blocked.

## Pull request 1 — Daily review, streak, and new layout

Branch: `maintenance/study-site-daily-review`.

### Files

```text
site/
  index.html            shell: header, tab bar, view container, dialogs, templates
  style.css             restyled; same token approach, light and dark
  js/main.js            boot: load data, migrate, route
  js/router.js          hash routes
  js/views/today.js     home: deck card, stats tiles, activity grid, topic list
  js/views/review.js    the card component and session runner (shared by all modes)
  js/views/practice.js  topic picker and practice sessions
  js/views/settings.js  daily size, goal, export/import, reset
  js/views/search.js    search dialog across all cards
  js/lib/store.js       records, merge, persistence, migration
  js/lib/schedule.js    boxes, due dates, deck, streak, mastery (pure)
  js/lib/random.js      string hash and mulberry32
  js/lib/*.test.mjs     node --test unit tests (not copied to _site/)
site/app.js             removed
```

ES modules (`<script type="module">`) work without a bundler on GitHub Pages and the VPS. Every URL stays relative so the site keeps working under the `/llm-wiki/` path on Pages.

### Routes

| Hash | View |
| --- | --- |
| `#/today` (default) | Home and the daily deck |
| `#/today/review` | Running the daily deck |
| `#/practice` | Topic list with mastery bars |
| `#/practice/<topic>` | Practice session for one topic, or `all` |
| `#/settings` | Settings |
| `#REL-CA-002` | Old card links: opens that card in a one-card practice session |

### Behavior

- **Today.** A main card showing "N cards, about M minutes" (estimate: 30 seconds a card), the due and new split, and a start button. When the deck is done it shows the session summary, "Review missed" when there are missed cards, and "Practice N more to keep your streak" while the day is not met. Below: streak, mastered, and due-tomorrow tiles; the 12-week activity grid; and the topic list.
- **Review runner.** Same interaction as today: reveal with Space, grade with 1 or 2 (or `j`/`k`), arrows to move, browse dialog with `/`. On narrow screens the grade buttons sit in a fixed bottom bar within thumb reach. Swipe right for "knew it" and left for "missed it" after reveal (pointer events, 80 px threshold, disabled with `prefers-reduced-motion`). A focus mode hides the header during review; Esc leaves.
- **Practice.** A list of topics, each row with its card count, due count, and a mastery bar, plus "All topics". Practice reviews are written with `mode = practice` and never change boxes.
- **Search.** A header button and `/` open a dialog that searches every card by ID, topic, and question text, not only the current session.
- **New this week.** `build_flashcards.py` adds an `added` date to each card from one pass over `git log --reverse -p --format=%x00%cI -- learning/questions/`, recording the first commit that added each `## <ID> —` heading. Cards added in the last 7 days get a "New" badge and are preferred among new cards. The Pages workflow needs `fetch-depth: 0` on checkout. Without Git history (for example in a shallow clone), `added` is omitted and the badge does not appear.
- **Settings.** Daily size, new cards per day, daily goal, "Export progress" (downloads the v2 document as JSON), "Import progress" (merges a file using the merge rule), and "Reset progress on this device" with a confirmation.

### Build changes

- `scripts/build_flashcards.py`: copy `site/` while skipping `*.test.mjs`; add `added` to each card; add `pageSlug` and `anchor` per card (used by pull request 2).

### Tests

- `node --test site/js/lib/`: due dates per box; misses reset to box 0; practice rows ignored; baselines; same deck for the same inputs and different decks on different days; deck unchanged by reviews made today; streak across a missed day, an at-risk today, and the best streak; merge (newer `at` wins, tie keeps the existing row); v1 migration.
- A new `validate.yml` step runs `node --test site/js/lib/` (Node is preinstalled on the GitHub runners).
- Manual checks in a browser at desktop and 375 px widths, light and dark, with storage blocked, and with v1 data loaded.

## Pull request 2 — Learn panel

Branch: `maintenance/study-site-learn-panel`.

### Rendering wiki pages

New module `scripts/wiki_markdown.py` (standard library only):

- Supported blocks: ATX headings (levels 1–3), paragraphs, unordered and ordered lists (one level), pipe tables with an alignment row, fenced code blocks with an optional language, blockquotes, and horizontal rules.
- Supported inline syntax: code spans, `**bold**`, `*italic*`, and links. Every text run is escaped with `html.escape` before inline markup is applied; code spans are extracted first so their contents are never transformed.
- Strict mode: raw HTML, images, nested lists, footnotes, and setext headings raise `UnsupportedMarkdown(path, line, construct)`. The build fails with the file and line, so a capture that uses new syntax gets a renderer change instead of a silently broken page.
- Heading IDs come from the same function the validator uses. Move `github_slug` and `heading_anchors` from `scripts/validate.py` into the new module and import them in the validator, so question anchors, validator checks, and rendered IDs cannot diverge.
- Link rewriting:
  - another wiki page → `#/learn/<topic>/<page>` with `/<anchor>` when present;
  - `sources/…` and any other repository file → the GitHub blob URL, opened in a new tab;
  - external links → unchanged, `target="_blank" rel="noopener"`.
- Labelled paragraphs become callouts: a paragraph that starts with `**Synthesis:**`, `**Inference:**`, `**Uncertainty:**`, `**Personal observation:**`, or `**Conflict:**` is wrapped in `<aside class="callout callout-<label>">`, keeping the label text.
- A paragraph that is only a `[Source](…)` link renders as a small citation line instead of its own paragraph.

`scripts/validate.py` gains a fifth check, "Wiki pages render": it renders every page under `wiki/` and reports `UnsupportedMarkdown` errors, so problems surface at pull-request time, not only at deploy.

### Build output

`scripts/build_flashcards.py` (the name stays, so existing docs and workflows keep working) also writes:

- `_site/learn/index.json`:

  ```json
  {
    "topics": [
      {
        "slug": "reliability",
        "name": "Reliability and operations",
        "description": "latency distributions, cache-aside, …",
        "pages": [
          {
            "path": "wiki/reliability/cache-aside.md",
            "slug": "cache-aside",
            "title": "Cache-Aside",
            "summary": "lazy-loading read path (hit, miss, database read, fill), …",
            "minutes": 4,
            "sections": [{"anchor": "ttl-semantics", "title": "TTL semantics", "questions": ["REL-CA-002"]}],
            "questions": ["REL-CA-001", "REL-CA-002"]
          }
        ]
      }
    ]
  }
  ```

- `_site/learn/<topic>/<page>.html`: the rendered page body as a fragment, fetched when opened.

Ordering and text come from the indexes, not from the file system:

- topics: the order of the `## Topics` list in `wiki/index.md`; `name` is the link text and `description` the text after ` — `;
- pages: the order of each topic's `index.md` list; `summary` is the text after ` — ` with trailing `[Source](…)` links removed;
- `minutes`: word count divided by 200, rounded up;
- questions: grouped by each question's source page, and by its anchor for sections. A question without an anchor belongs only to its page.

The library under `wiki/library/` is not part of Learn; it stays reachable through `[Source]` links. A wiki page that is not linked from its topic index fails validation already, so every page is reachable.

### Views and routes

| Hash | View |
| --- | --- |
| `#/learn` | Topics, each with pages learned and mastery |
| `#/learn/<topic>` | The topic's pages in index order: learned tick, question count, mastery |
| `#/learn/<topic>/<page>` | Page reader |
| `#/learn/<topic>/<page>/<anchor>` | Page reader scrolled to a section |

New files: `site/js/views/learn.js` and `site/js/views/reader.js`.

Reader:

- A header line with topic, reading time, and question count, then the page title and rendered body.
- Sections that have questions get a chip ("2 questions"); clicking it scrolls to **Check yourself** and highlights those questions.
- On wide screens, a sticky section list beside the text; on narrow screens, a collapsible "On this page" menu.
- **Check yourself** at the end uses the shared card component. Grading here writes `mode = learn`, which starts the card's schedule, so it is not shown again as new on the same day.
- **Mark as learned** (also offered after the last check-yourself question is graded) writes a page record. Ungraded questions on that page become eligible as new cards in the daily deck.
- **Next page** follows topic index order. Pages without questions show "No questions yet" instead of the check-yourself block.

Today view changes:

- New cards only come from learned pages (setting `onlyLearnedPages`, default on).
- When nothing is due and no new cards are available, the main card offers "Learn your next page: <title>", the first unlearned page with questions in wiki order.

### Tests

- Python `unittest` in `tests/test_wiki_markdown.py`: every supported construct, escaping (including `<` in code and prose), link rewriting, callouts, heading IDs matching the validator, and unsupported constructs raising with the line number.
- Rendering every current wiki page succeeds (also enforced by `validate.py`).
- `node --test`: gating new cards by learned pages, and migration marking pages learned.
- `validate.yml` runs `python3 -m unittest discover -s tests`.

## Pull request 3 — Progress server, sync, and PWA

Branch: `maintenance/study-site-sync`.

### Server

New file `server/progress_server.py`, standard library only (`http.server`, `sqlite3`, `hashlib`, `hmac`, `json`, `threading`):

- `ThreadingHTTPServer` with a request handler based on `SimpleHTTPRequestHandler`, serving `_site/` for everything outside `/api/`.
- One SQLite connection guarded by a lock (`check_same_thread=False`), opened with `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=NORMAL`, and `PRAGMA foreign_keys=ON`.
- Configuration from environment variables:

  | Variable | Default | Purpose |
  | --- | --- | --- |
  | `PROGRESS_DB` | `/data/progress.db` | Database file |
  | `PROGRESS_BACKUP_DIR` | `/data/backups` | Daily snapshots |
  | `PROGRESS_BACKUP_KEEP` | `30` | Snapshots to keep |
  | `PROGRESS_TOKEN_HASHES` | none (sync disabled) | `name:sha256hex,name:sha256hex` |
  | `PROGRESS_TRUST_PROXY` | `0` | Use `X-Forwarded-For` for rate limiting; set to 1 only behind the local proxy |
  | `SITE_DIR` | `/app/_site` | Static files |
  | `PORT` | `8000` | Listen port inside the container |

Schema, created on startup when missing and versioned with `PRAGMA user_version = 1`:

```sql
CREATE TABLE reviews (
  id     TEXT PRIMARY KEY,
  card   TEXT NOT NULL,
  at     TEXT NOT NULL,
  day    TEXT NOT NULL,
  mode   TEXT NOT NULL CHECK (mode IN ('daily', 'learn', 'practice', 'baseline')),
  knew   INTEGER CHECK (knew IN (0, 1)),
  box    INTEGER CHECK (box BETWEEN 0 AND 5),
  device TEXT NOT NULL,
  seq    INTEGER NOT NULL
);
CREATE INDEX reviews_seq ON reviews(seq);
CREATE INDEX reviews_card ON reviews(card, at);

CREATE TABLE pages (
  path    TEXT PRIMARY KEY,
  learned INTEGER NOT NULL CHECK (learned IN (0, 1)),
  at      TEXT NOT NULL,
  seq     INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  at    TEXT NOT NULL,
  seq   INTEGER NOT NULL
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);  -- 'seq' counter
```

`seq` is a global change counter. Each accepted row gets the next value in the same transaction, so a client can ask for "everything changed since N".

### API

All responses are JSON with `Cache-Control: no-store`.

- `GET /api/health` → `200 {"ok": true, "schema": 1}`. No auth; used by Docker and the deploy health check.
- `POST /api/sync` (auth) — push and pull in one call:

  ```json
  { "since": 1840, "reviews": [ … ], "pages": [ … ], "settings": [ … ] }
  ```

  The server validates every row, then upserts each one with
  `INSERT … ON CONFLICT(id) DO UPDATE SET … WHERE excluded.at > reviews.at` (same pattern for pages and settings), assigning `seq` to inserted or changed rows. It responds with every row whose `seq > since`, plus the new cursor:

  ```json
  { "seq": 1852, "reviews": [ … ], "pages": [ … ], "settings": [ … ] }
  ```

  Sending the same batch twice changes nothing, so retries are safe.
- `GET /api/export` (auth) → every row from all three tables, for backups and for import on another device.

Validation (rejected with `400` and a message; nothing in the batch is written):

- body at most 1 MB, at most 5,000 rows;
- `card` matches the question ID pattern from `scripts/question_bank.py`; `id` at most 120 characters;
- `day` matches `YYYY-MM-DD`; `at` parses with `datetime.fromisoformat` and includes an offset;
- `mode`, `knew`, and `box` combinations as in the schema;
- `path` starts with `wiki/` and ends with `.md`; setting keys come from a fixed list.

The server sets `device` from the token name and ignores any value the client sends.

### Authentication

- Tokens are created on the VPS with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`. Only `sha256(token)` in hex goes into `PROGRESS_TOKEN_HASHES` with a device name.
- Every `/api/` request except `health` needs `Authorization: Bearer <token>`. The server hashes the presented token and compares it with each stored hash using `hmac.compare_digest`; no match returns `401`.
- Failed attempts are counted per client IP (from `X-Forwarded-For` only when `PROGRESS_TRUST_PROXY=1`). More than 10 failures in a minute returns `429` for that IP for 5 minutes.
- Tokens never appear in logs; the access log records method, path, status, and device name.
- Security headers on every response: `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. The site has no inline scripts or styles, so this policy holds; the current inline SVG favicon becomes a file.
- No CORS headers. The Pages copy cannot call the API and stays local-only.
- Revoking a device: remove its entry from the env file and restart the container.

### Backups

- A background thread runs `VACUUM INTO '/data/backups/progress-YYYY-MM-DD.db'` once a day (and on startup if today's snapshot is missing), then deletes snapshots beyond `PROGRESS_BACKUP_KEEP`.
- The live database file is never copied directly, because a copy taken during a write can be corrupt.
- Export from the app is the second, user-held backup.

### Client sync

New file `site/js/lib/sync.js`:

- When no token is set, sync stays off and the app behaves exactly as in pull request 2.
- Triggers: app start, the tab becoming visible, the `online` event, 3 seconds after the last grade, and every 5 minutes while visible. Only one sync runs at a time.
- Sending: rows whose IDs are in the outbox, plus the stored `cursor` as `since`. On success, the returned rows are merged with the normal merge rule, the cursor is saved, and sent IDs leave the outbox unless the row changed while the request was in flight.
- Errors: network failures keep the outbox and retry with backoff (5 seconds, doubling up to 5 minutes); `401` shows "This device was disconnected" and stops syncing until a new token is set; `400` is logged and those rows stay in the outbox for inspection.
- Header status: "Synced", "Saving…", "Offline · N pending", or "Not connected".
- Settings → **Connect this device**: paste the token, then "Test connection" calls sync with an empty batch. "Disconnect" removes the token. Connecting a device that already has local data uploads all of it with `since = 0`; merge rules make that safe.

### PWA

- `site/manifest.webmanifest`: `name` "LLM Wiki study", `short_name` "Wiki study", `start_url` `./#/today`, `scope` `./`, `display` `standalone`, theme and background colors from the CSS tokens, and icons at 192 and 512 px plus a 180 px `apple-touch-icon`. The PNG icons are committed once under `site/icons/`.
- `site/sw.js`:
  - the build script writes a version (a hash of the `_site` files) into `sw.js`, so a new deploy installs a new service worker;
  - install precaches the shell (`index.html`, CSS, JS modules, icons, manifest);
  - `cards.json` and `learn/**`: network first, falling back to the cache when offline;
  - `/api/**`: never cached;
  - when a new worker is waiting, the app shows "Update available · Reload".
- Registered from `main.js` only when `'serviceWorker' in navigator`. The Pages copy also works offline, scoped to `/llm-wiki/`.

### Container

`Dockerfile` (multi-stage):

```dockerfile
FROM python:3.12-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
RUN python3 scripts/validate.py && python3 scripts/build_flashcards.py

FROM python:3.12-slim
RUN useradd --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=build /src/_site /app/_site
COPY server/ /app/server/
USER app
EXPOSE 8000
HEALTHCHECK CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"
CMD ["python3", "/app/server/progress_server.py"]
```

- The build stage gets `.git` so the `added` dates work. Only `_site/` and `server/` reach the final image.
- `.dockerignore` excludes `_site/`, `__pycache__/`, and editor files.
- Pin the base image by digest when implementing.

`docker-compose.yml`:

```yaml
services:
  study:
    build: .
    image: llm-wiki-study
    restart: unless-stopped
    env_file: [/etc/llm-wiki/study.env]
    environment:
      PROGRESS_TRUST_PROXY: "1"
    volumes:
      - /var/lib/llm-wiki:/data
    ports:
      - "127.0.0.1:3002:8000"
    read_only: true
    tmpfs: [/tmp]
    security_opt: ["no-new-privileges:true"]
```

The build never writes into the host checkout, so the persistent wiki checkout stays clean. The orchestrator refuses to deploy over uncommitted changes, and the Telegram bridge reads the same checkout.

### Tests

`tests/test_progress_server.py` (`unittest`, server on an ephemeral port with a temporary database):

- `health` without a token; `401` without or with a wrong token; `429` after repeated failures;
- the same batch sent twice is idempotent; an older `at` never overwrites a newer row; `since` returns only newer rows;
- validation errors write nothing;
- static files are served with the security headers; paths outside `_site/` are rejected;
- a snapshot is created and old ones pruned.

`node --test` for sync merge logic using a fake `fetch`. Manual checks: install the PWA on a phone, review offline, reconnect, and confirm the laptop shows the same streak.

## Pull request 4 — VPS deployment (`vps-apps` repository)

Branch in `vps-apps`: `maintenance/llm-wiki-study-site`.

- `deploy/adapters/llm-wiki.sh`: keep the `wiki/index.md` check, then follow the Obsy adapter pattern:

  ```bash
  export LLM_WIKI_PROJECT_NAME="${LLM_WIKI_PROJECT_NAME:-llm-wiki}"
  export LLM_WIKI_BIND_ADDRESS="${LLM_WIKI_BIND_ADDRESS:-127.0.0.1}"
  export LLM_WIKI_HOST_PORT="${LLM_WIKI_HOST_PORT:-3002}"
  export LLM_WIKI_ENV_FILE="${LLM_WIKI_ENV_FILE:-/etc/llm-wiki/study.env}"
  export LLM_WIKI_DATA_DIR="${LLM_WIKI_DATA_DIR:-/var/lib/llm-wiki}"
  require_file "$LLM_WIKI_ENV_FILE"
  require_dir "$LLM_WIKI_DATA_DIR"
  docker compose --project-name "$LLM_WIKI_PROJECT_NAME" --project-directory "$APP_DIR" \
    -f "$APP_DIR/docker-compose.yml" -f "$ORCHESTRATOR_DIR/deploy/compose/llm-wiki.yml" \
    up --build --detach --wait --wait-timeout 180
  wait_http "http://127.0.0.1:$LLM_WIKI_HOST_PORT/api/health"
  ```

- `deploy/compose/llm-wiki.yml`: `!override` the port, env file, and volume using the variables above, as `deploy/compose/obsy.yml` does.
- `config/examples/llm-wiki.sh`: the five variables with their defaults.
- `README.md`: a row for llm-wiki that mentions the container and the required host files.
- `tests/test_deploy.py`: extend if it asserts adapter behavior.
- Optional: an Obsy probe for `http://127.0.0.1:3002/api/health` in `config/examples/obsy-apps.json`.

Every push to the wiki rebuilds the image. With a slim base and cached layers this should take seconds; confirm on the first deploys.

## One-time host setup

Done by hand on the VPS before pull request 4 is merged:

1. Create the data directory, owned by the container user:

   ```bash
   sudo install -d -o 10001 -g 10001 -m 700 /var/lib/llm-wiki /var/lib/llm-wiki/backups
   ```

2. Create a token for each device and record only the hashes:

   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   printf %s '<token>' | sha256sum
   ```

   Then write `/etc/llm-wiki/study.env` (mode `600`, readable by the runner account):

   ```text
   PROGRESS_TOKEN_HASHES=phone:<hex>,laptop:<hex>
   ```

   Keep each token in a password manager; it is pasted once per device.
3. Copy `config/examples/llm-wiki.sh` to `/etc/vps-apps/llm-wiki.sh` and adjust if needed.
4. Add a reverse-proxy site with TLS for the chosen subdomain, pointing to `127.0.0.1:3002`, with the `X-Forwarded-For` header set and a request body limit of about 2 MB.
5. Point DNS for the subdomain at the VPS.
6. After the first deploy: `curl https://<subdomain>/api/health`, then connect each device in Settings.

## Documentation updates

- `README.md`: rename "Flashcards" to "Study site"; describe the Today, Learn, and Practice views, the VPS deployment, and local-only mode on Pages. Reword "It has no database…" to say the knowledge base itself has none, and that review progress lives in a SQLite file on the VPS, outside the repository.
- `AGENTS.md`: state that Learn pages are generated from `wiki/` by `scripts/build_flashcards.py` and never edited by hand; that wiki pages must stay within the renderer's supported Markdown (checked by `validate.py`); and that `server/` and `site/` changes are maintenance pull requests.
- `log.md`: a maintenance entry for each pull request.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A capture uses Markdown the renderer does not support | Strict renderer plus a validator check; the pull request fails with file and line |
| Losing the database | Host volume, daily `VACUUM INTO` snapshots, and user-held exports |
| A leaked device token | Per-device hashes, revoke by editing one line; HTTPS only; rate limiting |
| iOS clearing site storage | The server is the durable copy; the outbox only holds unsynced rows |
| Clock skew between devices | Timestamps only order regrades of the same row and settings; reviews never conflict across devices |
| A rebuild on every capture | Small image with cached layers; the health check gates the switch to the new container |
| The deploy touching the wiki checkout | The build runs inside the image; nothing is written to the host checkout |

## Open questions

- Which subdomain to use, and which reverse proxy runs on the VPS (it decides the exact config in step 4 of the host setup).
- Whether to keep the GitHub Pages deployment as a local-only fallback or retire it once the VPS site works.
- Default daily size (12), new cards per day (4), and daily goal (10): adjust after a week of use.
- Whether to run Node in `validate.yml` for the JavaScript unit tests (proposed), or keep CI Python-only and run them locally.
