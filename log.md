# Wiki Log

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
