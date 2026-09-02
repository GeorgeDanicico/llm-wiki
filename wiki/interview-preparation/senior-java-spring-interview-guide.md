# Senior Java and Spring Interview Guide

This guide organizes the captured senior-interview notes into focused categories. The source emphasizes production reasoning: distinguish a symptom from proof, identify the exact boundary of each guarantee, and make partial-failure recovery explicit. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#purpose)

## Category map

| Category | Focus | Detailed page |
| --- | --- | --- |
| Java concurrency | Visibility, atomicity, mutual exclusion, and compound invariants | [Concurrency and the Java Memory Model](../java/concurrency-and-the-java-memory-model.md) |
| JVM and profiling | Memory areas, GC evidence, OOM classification, JFR, and CPU incidents | [JVM memory, GC, and production profiling](../java/jvm-memory-gc-and-production-profiling.md) |
| Concurrent caching | Atomic map operations, mutable values, stampede control, and cache lifecycle | [Concurrent in-memory caching](../java/concurrent-in-memory-caching.md) |
| Spring Framework | Transaction proxies, rollback rules, asynchronous boundaries, lifecycle, and scopes | [Spring transactions, beans, and scopes](../frameworks/spring-transactions-beans-and-scopes.md) |
| Persistence | N+1, over-fetching, locks, indexes, and connection-pool saturation | [JPA and database performance diagnosis](../data-access/jpa-and-database-performance-diagnosis.md) |
| Reliability | Deadlines, retries, circuit breakers, bulkheads, shedding, observability, and incident response | [Service resilience and observability](../reliability/service-resilience-and-observability.md) |
| Distributed workflows | Idempotent APIs, outbox publication, Kafka ordering, redelivery, reconciliation, and compensation | [Payment processing with Spring and Kafka](../distributed-systems/payment-processing-with-spring-and-kafka.md) |

## High-value distinctions

- `volatile` provides visibility and ordering, not atomic compound updates.
- Thread-safe calls do not make a multi-call workflow atomic.
- Allocation measures object creation; retention measures what remains reachable.
- A rising heap before GC is normal; a rising post-GC live set is suspicious.
- JFR records behavior over time; a heap dump captures reachable objects at one instant.
- A concurrent map protects the map structure, not mutable values stored in it.
- A same-object method call bypasses Spring proxy advice.
- A relationship mapping suggests N+1 risk; executed SQL counts prove or reject it.
- Pool acquisition time is distinct from SQL execution time.
- A circuit breaker protects a dependency boundary; load shedding protects local capacity.
- Kafka producer idempotence is not business idempotence.
- Kafka exactly-once processing does not make an external HTTP side effect exactly once.
- Restarting is mitigation; preserving evidence and correcting the cause is diagnosis and repair.

These distinctions are synthesized from the source's rapid-review table. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#12-rapid-review-distinctions)

## Production answer pattern

For incident and architecture questions, a strong answer follows this sequence:

1. Clarify semantics and the required business invariant.
2. Locate the boundary: thread, JVM, database transaction, Kafka partition, or distributed workflow.
3. Gather evidence that separates likely causes rather than naming one from a symptom.
4. Define timeout, retry, concurrency, and resource limits.
5. Walk through each partial-failure window.
6. Explain idempotency, conditional transitions, reconciliation, or compensation.
7. Separate immediate mitigation from permanent correction.

This sequence is a synthesis of the source rather than a verbatim framework supplied by it.

## Coverage limits

The captured material is strongest on runtime diagnosis, Spring internals, persistence performance, resilience, and Kafka workflows. It is not a complete senior-Java syllabus: collections and complexity, generics and type erasure, streams, class loading, modern language features, Spring Security, testing, and reactive programming receive little or no coverage. This coverage assessment is synthesis based on the topics present in the captured source.

## Source status

The source is a synthesized interview note created by George and Codex on 2026-08-29. It includes primary-reference links, but this ingestion did not independently re-verify every claim or version-sensitive configuration example. Treat defaults and framework or broker behavior as needing confirmation against the deployed Java, Spring, Hibernate, and Kafka versions.

Primary source: [Senior Java and Spring Boot Interview Knowledge](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md)
