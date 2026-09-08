# Wiki Log

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
