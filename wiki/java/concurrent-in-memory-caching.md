# Concurrent In-Memory Caching

## What the map guarantees

`ConcurrentHashMap` provides thread-safe individual operations and allows updates to different keys to proceed concurrently. A sequence such as `containsKey` followed by `put` is not atomic merely because both calls are individually safe. Prefer per-key operations such as `putIfAbsent`, `compute`, `merge`, and conditional `replace`. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#41-what-concurrenthashmap-guarantees)

The map protects its own structure, not mutable values stored inside it. Prefer immutable value objects and replace the complete value when state changes. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#43-cached-mutable-values)

## Coalescing cache misses

An in-process stampede guard can store one in-flight `CompletableFuture` per key. The first caller performs the load and other callers share its future. Remove the in-flight entry after success or failure so completed futures do not accumulate and later calls can retry failures. Conditional removal prevents one completion from deleting a newer attempt. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#44-preventing-a-cache-stampede-in-one-jvm)

This mechanism coordinates only callers in one JVM. Multiple instances may still duplicate a load. A distributed lock is justified only when duplicate work is more expensive than the coordination, failure, and operational complexity it introduces. After acquiring cross-instance coordination, recheck the shared result before repeating the load. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#45-cross-instance-coordination)

## Correctness and lifecycle

Define an explicit same-key update policy: last write wins, optimistic versioning, per-key serialization, invalidation after the database update, or ordered event-driven updates. Treat the database as authoritative when staleness is acceptable. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#46-cache-consistency-choices)

A production cache also needs:

- maximum size or weight;
- expiration and refresh rules;
- eviction behavior;
- negative- and failure-caching policy;
- stale-value behavior;
- hit, miss, load, failure, and eviction metrics;
- bounded load concurrency, timeouts, and cancellation rules.

An unbounded concurrent map can exhaust the heap. For a single-JVM cache, the source recommends considering Caffeine for its tested concurrency, bounds, expiration, refresh, and statistics; it remains an in-process rather than distributed cache. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#47-cache-lifecycle)
