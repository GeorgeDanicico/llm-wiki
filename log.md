# Wiki Log

## 2026-10-23 — Study site: device token helper and clearer token error

- Raw device tokens stored in `PROGRESS_TOKEN_HASHES` instead of their hashes made the progress server exit at start, so the container restarted in a loop and every VPS deploy failed on llm-wiki. The server's error now names the entry and device and says it holds a raw token, without echoing the value.
- Added `scripts/new_device_token.py`, which creates a token and prints the `name:sha256hex` entry to store, or hashes an existing token from stdin with `--hash-only`. `README.md` and the server's docstring now point to it. No knowledge content changed.
- Validation: `python3 scripts/validate.py --base origin/main` and `python3 -m unittest discover -s tests`.

## 2026-10-22 — Dependency injection learning session ingestion

- Preserved the learning-session summary for topic 004 (dependency injection) verbatim beneath capture metadata as a new immutable source under `sources/notes/architecture/`.
- Added a focused [Dependency injection](wiki/architecture/dependency-injection.md) page (construction inside a class versus injection, inversion versus injection, constructor versus setter and field injection, a framework-free unit-test example, over-long constructors, circular dependencies, injecting non-obvious sources) and a library-note entry.
- Updated architecture, library-note, source-category, source-catalog, and root indexes; registered four review questions (ARCH-INJ-001 through ARCH-INJ-004), which feed the flashcards.
- No documentation was fetched during the session; the Spring remarks, the static-mocking remark, and the reading list are marked unverified. No conflicting wiki claims were identified.

## 2026-10-22 — Dependency inversion learning session ingestion

- Preserved the learning-session summary for topic 003 (dependency inversion) verbatim beneath capture metadata as a new immutable source under `sources/notes/architecture/`.
- Created the Architecture topic area with a focused [Dependency inversion](wiki/architecture/dependency-inversion.md) page (business-owned port, package-ownership rule, before-and-after Java example, leaky ports, reporting-query scenario, inversion versus injection) and a library-note entry.
- Updated architecture, library-note, source-category, source-catalog, and root indexes; registered four review questions (ARCH-DI-001 through ARCH-DI-004), which feed the flashcards.
- No documentation was fetched during the session; the hexagonal-architecture, Spring, and reading-list remarks are marked unverified. No conflicting wiki claims were identified.

## 2026-10-21 — Study site: progress server, sync, and installable app

- Added `server/progress_server.py` (Python standard library): it serves the built site and stores reviews, learned pages, and settings in SQLite with a global change counter. `POST /api/sync` pushes and pulls in one call with the merge rule (newer instant wins, ties keep the existing row); `GET /api/export` returns every row; `GET /api/health` needs no token. Device tokens are checked against SHA-256 hashes, failed attempts are rate-limited per IP, every response carries a strict Content-Security-Policy, and a daily `VACUUM INTO` snapshot is kept for 30 days.
- Added client sync (`site/js/lib/sync.js`), **Settings → Sync across devices**, and a header sync status. Without a token the site behaves as before, so the GitHub Pages copy stays local-only.
- Made the site an installable web app: a web manifest, PNG icons, and a service worker (`site/sw.js`) whose version `scripts/build_flashcards.py` fills in from the built files; the app works offline and offers **Update available · Reload** after a deploy. The inline favicon became `site/icons/favicon.svg`.
- Added a multi-stage `Dockerfile` (base image pinned by digest; the site is built inside the image), `docker-compose.yml` (service `study`, `127.0.0.1:3002:8000`, read-only, uid 10001), and `.dockerignore`, for deployment by vps-apps.
- Added Python tests for the server and the service worker build, and Node tests for sync. Documented the study site, its deployment, and tokens in `README.md`; `AGENTS.md` now lists `server/` and the container files as maintenance. No knowledge content changed.
- Validation: `python3 scripts/validate.py --base origin/main`, `python3 -m unittest discover -s tests`, `node --test site/js/lib/*.test.mjs`, the site build, a local server with two simulated devices, headless Chromium for the service worker, and `docker compose build` plus a container health check.

## 2026-10-21 — Study site: Learn panel

- Added `scripts/wiki_markdown.py`, a strict standard-library renderer for the Markdown subset the wiki uses. Unsupported syntax raises an error with the file and line; all text is escaped, and only `http`, `https`, and `mailto` links are emitted. `github_slug` and `heading_anchors` moved there from `scripts/validate.py`, which now also checks that every page under `wiki/` renders (check 5).
- `scripts/build_flashcards.py` now also writes `_site/learn/index.json` (topics and pages in wiki index order, with summaries, reading time, sections, and questions) and one rendered fragment per topic page. Wiki links become Learn routes; source, library, and other repository links point to GitHub.
- Added the **Learn** view (topics, a topic's pages, and a page reader with section chips, a section list, **Check yourself**, **Mark as learned**, and **Next page**). Today now draws new cards only from learned pages (setting `onlyLearnedPages`, on by default) and offers the next page to learn when nothing else is available. Pages whose cards carry v1 baseline progress are marked learned once, on load.
- Repaired two code fences on [Write-through caching](wiki/reliability/write-through-caching.md) that had lost two of their three backticks (from the 2026-10-10 ingestion, which ran without the validator). Fence markers only; no wording changed.
- Added Python unit tests under `tests/` (run in `validate.yml`) and Node tests for page gating, page migration, and the Learn index.
- Validation: `python3 scripts/validate.py --base origin/main`, `python3 -m unittest discover -s tests`, `node --test site/js/lib/*.test.mjs`, and the site build passed; checked in a browser at desktop and 375 px widths, light and dark.

## 2026-10-21 — Study site: daily review, streak, and new layout

- Rebuilt the flashcards app (`site/`) as ES modules with three views: **Today** (a daily deck of due and new cards, streak, mastery, due-tomorrow count, 12-week activity grid, topic list), **Practice** (by topic, all topics, or chosen topics), and **Settings** (deck size, new cards per day, daily goal, export, import, reset). Search covers every card; old `#CARD-ID` links still work.
- Progress is now an append-only review log in the browser (`llm-wiki-study:v2`); boxes, due dates, the deck, and streaks are derived from it. Earlier `llm-wiki-flashcards:v1` progress is migrated to baseline rows on first load, and the v1 key is kept.
- `scripts/build_flashcards.py` adds each card's `added` date (from Git history), `pageSlug`, and `anchor`, and no longer copies tests into `_site/`. The Pages workflow fetches full history; the validation workflow runs the new Node unit tests. No knowledge content changed.
- Validation: `python3 scripts/validate.py --base origin/main`, `node --test site/js/lib/*.test.mjs`, and the flashcard build passed; checked in a browser at desktop and 375 px widths, light and dark, with storage blocked, and with v1 data migrated.

## 2026-10-20 — Second write-through caching learning session ingestion

- Preserved a second learning-session summary for topic 103 (write-through caching) verbatim beneath capture metadata as a new immutable source under `sources/notes/reliability/`; the 2026-10-10 capture was left unchanged.
- Extended the existing [Write-through caching](wiki/reliability/write-through-caching.md) page rather than creating a new one: read-through pairing, the latency comparison with cache-aside invalidation, a Spring `@Transactional` example in which the cache is written before the commit (fixed by an after-commit update), an admin service that bypasses the cache, and a write-heavy telemetry scenario. Added a library-note entry.
- Updated reliability, library-note, source-category, and source-catalog indexes; registered four review questions (REL-WT-007 through REL-WT-010).
- The two sessions agree. Framework API names, latency figures, and the Debezium/CDC example are from memory and unverified.
- Validation: `python3 scripts/validate.py --base origin/main`.

## 2026-10-10 — Write-through caching learning session ingestion

- Preserved the learning-session summary for topic 103 (write-through caching) verbatim beneath capture metadata as a new immutable source under `sources/notes/reliability/`.
- Added a focused [Write-through caching](wiki/reliability/write-through-caching.md) page (synchronous database-then-cache write path, write-latency cost, consistency assumptions, concurrent-writer and bypassing-writer staleness, fit and trade-offs) and a library-note entry.
- Updated reliability, library-note, source-category, source-catalog, and root indexes; registered six review questions (REL-WT-001 through REL-WT-006), which feed the flashcards.
- The mitigation list and fit guidance come from the session and were not checked against external documentation; the AWS ElastiCache and CPU-cache remarks and the reading list are from memory and not synthesized. No conflicting wiki claims were identified.
- Validation: `scripts/validate.py` could not be run on the authoring machine (no Python installation); links, anchors, and question format were checked by hand and the GitHub Actions run is the authoritative check.
## 2026-10-08 — Connection versus request timeouts learning session ingestion

- Preserved the learning-session summary for topic 121 (connection versus request timeouts) verbatim beneath capture metadata as a new immutable source under `sources/notes/reliability/`.
- Added a focused [Connection versus request timeouts](wiki/reliability/connection-versus-request-timeouts.md) page (the four waits and their settings, read timeouts versus total caps, JDK `HttpClient` example, pool-acquisition queueing, too-tight-versus-too-loose trade-off) and a library-note entry; linked it from the timeouts section of the service-resilience page.
- Updated reliability, library-note, source-category, source-catalog, and root indexes; registered five review questions (REL-TO-001 through REL-TO-005), which feed the flashcards.
- The JDK `HttpRequest.Builder.timeout` documentation was checked during the session; Linux SYN-retry timings and Apache HttpClient setting names are marked unverified. No conflicting wiki claims were identified.

## 2026-10-06 — Read-through caching learning session ingestion

- Preserved the learning-session summary for topic 102 (read-through caching) verbatim beneath capture metadata as a new immutable source under `sources/notes/reliability/`.
- Added a focused [Read-through caching](wiki/reliability/read-through-caching.md) page (loader-owned misses, comparison with cache-aside, write-path invalidation, loader-capable layers, centralisation-versus-flexibility trade-off) and a library-note entry; replaced the cache-aside page's placeholder about read-through with a link to it.
- Updated reliability, library-note, source-category, source-catalog, and root indexes; registered five review questions (REL-RT-001 through REL-RT-005), which feed the flashcards.
- Caffeine, Hazelcast, and Redisson references were checked during the session; the JCache claim is marked unverified. No conflicting wiki claims were identified.

## 2026-10-05 — Cache-aside learning session ingestion

- Preserved the learning-session summary for topic 101 (cache-aside) verbatim beneath capture metadata as a new immutable source under `sources/notes/reliability/`.
- Added a focused [Cache-aside](wiki/reliability/cache-aside.md) page (read path, write-time TTL, freshness versus database load, common mistakes, cache-failure fallback) and a library-note entry, linked to the existing cache-stampede page.
- Updated reliability, library-note, source-category, source-catalog, and root indexes; registered seven review questions (REL-CA-001 through REL-CA-007), which feed the flashcards.
- Marked real-world uses and external references as unverified; no conflicting wiki claims were identified.

## 2026-10-04 — Flashcard navigation

- Added Prev/Next navigation (buttons and arrow keys) and a searchable **Browse all** list for jumping to any card in the session, with knew/missed marks per card.
- Revisited cards show their verdict for the session, and regrading replaces it instead of counting twice. Each card now has a shareable link (`#CARD-ID`).
- Grading keys are now `1`/`2` (or `j`/`k`); the arrow keys navigate. No knowledge content changed.
- Validation: repository checks and flashcard build passed; tested in a browser (navigation, regrading, browse filter and jump, deep links, desktop dark and mobile light layouts).

## 2026-10-04 — GitHub Pages flashcards

- Added a static flashcard app (`site/`) and `scripts/build_flashcards.py`, which turns every registered review question into a card in `cards.json` using the shared question parser.
- Added a **Deploy flashcards** workflow that validates the wiki, builds the cards, and publishes them to GitHub Pages on every push to `main`.
- Cards show the question, then the expected points and a link to the supporting wiki page. Topic filters, shuffle or weakest-first order, and per-card progress (stored in the browser) are available. No knowledge content changed.
- Validation: 61 cards in 7 topics built; tested the app manually in a browser (reveal, grading, topic filter, session summary, saved progress, light/dark and mobile layouts).

## 2026-10-04 — Per-topic question bank

- Split `learning/questions.md` into one file per topic under `learning/questions/`, matching the wiki topic directories; `learning/questions.md` is now the index of those files.
- All 61 questions kept their identifiers, wording, supporting-page links, and expected points; only heading levels and relative link depth changed. The former "Spring Framework" group is now named "Frameworks" to match the wiki topic.
- The validator now also requires every topic file to start with a topic heading and to be listed in the index.
- Validation: 90 Markdown files, 457 local links, and 61 review questions passed.

## 2026-10-04 — Repository validation

- Added `scripts/validate.py` with a shared question-bank parser: it checks local links and heading anchors, wiki index coverage, review-question format, unique question identifiers, supporting-page links, and (with `--base`) that captured sources are unchanged.
- Added a GitHub Actions workflow that runs the validator on every pull request and on pushes to `main`.
- Assigned stable identifiers to 21 previously unregistered questions (DIST-STREAM-001–006, DIST-KAFKA-001–005, DIST-PAY-002–006, INFRA-DNS-001–003, INFRA-DOCKER-001–002); question wording and expected points are unchanged.
- Validation: 83 Markdown files, 441 local links, and 61 review questions passed.

## 2026-09-30 — System-design fundamentals note ingestion

- Preserved the submitted system-design note verbatim as an immutable user-supplied technical source, including its final empty bullet.
- Added a focused synthesis correcting reliability versus resilience, general versus CAP availability, CAP consistency and partition behavior, stateless-service terminology, partitioning dimensions, replication acknowledgements, and consistency models.
- Updated source, library, distributed-systems, and root indexes; registered four stable active-recall questions (DIST-SD-001 through DIST-SD-004).
- Checked definitions against NIST, RFC 9110, the CAP and COPS papers, and official PostgreSQL and MongoDB documentation. Concrete replication guarantees remain configuration- and version-specific; no conflicting wiki claims were found.
- Validation: exact source-body preservation, local Markdown links and anchors, unique review-question IDs, and Git whitespace checks.

## 2026-09-29 — Graceful degradation practices ingestion

- Preserved the seven supplied resilience claims verbatim as an immutable user-supplied technical note.
- Extended the existing service-resilience page with corrections and detail on rate limits, request coalescing, load shedding, retry jitter, circuit breakers, deadlines, and alerts; linked the related cache-stampede and payment material.
- Updated the source, library, reliability-topic, and root indexes and registered four active-recall questions (REL-GD-001 through REL-GD-004).
- Marked the numeric limits as examples and checked the technical corrections against Google SRE, RFC 6585, AWS, Microsoft, and OpenTelemetry primary references; no conflicting wiki claims were found.
- Validation: 425 local Markdown links and anchors, 36 unique review-question IDs, exact captured source wording, and Git whitespace checks passed.

## 2026-09-27 — Java interview summary ingestion

- Preserved the supplied Java interview summary verbatim beneath capture metadata as a user-supplied chat-summary source.
- Reused the existing Java map, JVM-memory, and interview-guide pages; added GC reachability and collection-timing details plus focused pages for string identity/interning and task execution/fork-join.
- Updated the source, library, Java-topic, interview-guide, root, and question indexes; registered five active-recall questions (JAVA-COL-001, JAVA-JVM-002, JAVA-STR-001, and JAVA-EXEC-001 through JAVA-EXEC-002).
- Checked the principal map, future scheduling, fork/join, string interning, and PC-register claims against Java SE 26 primary API/specification pages; kept OpenJDK internals and scheduling details marked implementation-dependent. No conflicts with the existing notes were found.
- Validation: original source body preserved byte-for-byte; local Markdown links and anchors, unique review-question IDs, and Git whitespace checks passed.

## 2026-09-25 — Language-model token note ingestion

- Preserved the supplied `tokens-gist.md` wording beneath capture metadata as a new immutable language-model source.
- Added a focused synthesis and source-oriented library entry on token boundaries, model-specific counts, and practical implications for context, cost, and processing time.
- Updated source, library, topic, and root indexes and registered two stable review questions (LLM-TOK-001 and LLM-TOK-002).
- Marked example splits and service-dependent cost and timing claims as unverified; no conflicting wiki claims were identified.
- Validation: checked 371 local links and anchors, 27 unique registered question IDs, exact source-body preservation, and Git whitespace checks.

## 2026-09-20 — Latencies-and-percentiles note ingestion

- Preserved the supplied latency study note verbatim beneath capture metadata as a new immutable reliability source.
- Added a focused synthesis covering averages versus latency distributions, p50 through p99 interpretation, trends, and compounding slow-call probability.
- Connected the note to service observability, updated source, library, topic, and root indexes, and registered three stable review questions (REL-LAT-001 through REL-LAT-003).
- Marked percentile guidance, example values, thresholds, and the independence calculation as illustrative and unverified; recorded the missing aggregation, segmentation, and root-cause detail; no conflicting wiki claims were identified.

## 2026-09-12 — Cache-stampede study-note ingestion

- Preserved the supplied cache-stampede study note verbatim beneath capture metadata as a new immutable reliability source.
- Added a focused reliability synthesis covering stampede detection, per-key coalescing, TTL and retry jitter, stale-while-revalidate, distributed-lock caveats, bounded downstream work, and observability.
- Linked the new source to the existing local Java cache and general resilience pages; updated source, library, topic, and root indexes; and registered four stable review questions (REL-CACHE-001 through REL-CACHE-004).
- Marked operational defaults, figures, and response recommendations as unverified and implementation-dependent; no conflicting wiki claims were identified.

## 2026-09-05 — SAGA pattern note ingestion

- Captured the supplied SAGA pattern document as an immutable user-supplied technical note with provenance metadata.
- Added a distributed-systems synthesis covering coordination styles, durable workflow state, retry classification, unknown outcomes, idempotency, transactional outboxes, compensation failure, isolation limits, and observability.
- Connected the general SAGA model to the existing payment-workflow material and updated source, library, topic, and top-level indexes.
- Added three stable active-recall questions.
- Marked authorship and prior verification as unknown; treated coordination-style guidance as heuristic and implementation-specific guarantees as requiring separate verification.

## 2026-09-02 — Payment idempotency branch synchronization

- Merged the latest `origin/main` knowledge into the payment-idempotency branch.
- Preserved both payment pages and their distinct source relationships in the distributed-systems and library indexes.
- Consolidated duplicate Kafka source, library, review-question, and log entries introduced by parallel ingestion histories.

## 2026-08-29 — Senior Java and Spring interview knowledge

- Captured the supplied synthesized interview document as immutable source material.
- Organized its knowledge into Java/JVM, concurrent caching, Spring Framework, data access, reliability and observability, and distributed payment-workflow pages.
- Added an interview-preparation guide that maps the categories and records high-value distinctions and coverage gaps.
- Linked Kafka delivery and durability material to the existing Kafka page to make overlap and guarantee boundaries explicit.
- Added eight stable active-recall and diagnosis questions.
- Marked version-sensitive Java, Spring, Hibernate, and Kafka behavior as requiring confirmation against deployed versions; no independent claim-by-claim verification was performed.

## 2026-08-18 — Kafka consumer and durability article ingestion

- Captured the supplied Kafka article as an immutable article source.
- Added a source-oriented library entry and a synthesized distributed-systems page.
- Connected consumer positions, committed offsets, rebalancing, replay behavior, producer acknowledgements, ISR policy, page-cache persistence, and exactly-once boundaries.
- Added five active-recall and failure-diagnosis questions.
- Compared version-sensitive claims with Apache Kafka 4.3 documentation and recorded protocol/default caveats.

## 2026-08-17 — Payment idempotency design ingestion

- Captured the supplied payment-idempotency design summary as an immutable design source.
- Added source-oriented design indexes and a library entry that records the proposal's unverified status.
- Compiled the use case into a distributed-systems page covering the order-scoped invariant, payment generations, atomic serialization, queue redelivery, provider idempotency, the transactional outbox, and reconciliation.
- Added five active-recall and failure-diagnosis questions.
- Documented provider-specific idempotency behavior as an implementation assumption requiring verification.

## 2026-08-15 — Token buckets and network bandwidth shaping

- Captured an AI-assisted conversational explanation of token-bucket rate limiting and network bandwidth shaping.
- Added a synthesized infrastructure page covering refill rate, bucket capacity, bounded bursts, bandwidth shaping, and the distinction from traffic policing.
- Registered two stable active-recall questions.
- Marked the captured claims as not externally verified.

## 2026-08-13 — Agent interaction and GitHub workflow

- Defined capture, inquiry, and quiz modes for direct and stateless Telegram interactions.
- Required one atomic pull request for every knowledge capture and documented safe synchronization with `origin/main`.
- Kept Telegram scheduling and delivery outside the wiki repository.

## 2026-08-11 — Initial Notex/Notes import

- Created the Git-and-Markdown wiki structure.
- Imported four immutable files from the local `gd/Notes` collection: one book note and three technology notes.
- Compiled stream-processing material into five distributed-systems pages.
- Compiled DNS and Docker notes into two infrastructure pages.
- Retained the empty Quarkus note as a source placeholder without inventing knowledge.
- Added eleven active-recall questions.
- Marked incomplete or oversimplified source claims where they need later verification.

## 2026-09-08 — Optimistic locking note ingestion

- Preserved the supplied learning note verbatim beneath capture metadata as a new immutable source.
- Added a focused data-access synthesis and a source-oriented library entry covering lost updates, atomic version checks, intent-preserving retries, locking trade-offs, JPA, and three-way form reconciliation.
- Updated topic, library-note, source-category, and root indexes; registered five stable review questions (DATA-OL-001 through DATA-OL-005).
- Marked claims as not independently verified and database/JPA details as implementation-dependent; no conflicting wiki claims were identified.
- Validation: checked 289 local links and anchors, unique question identifiers, exact source-body preservation, and Git whitespace checks; the repository has no configured automated test suite.
