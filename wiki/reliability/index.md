# Reliability and Operations

Patterns and diagnostic practices for keeping services responsive under dependency failure and production incidents.

- [Latency averages and percentiles](latency-averages-and-percentiles.md) — tail-latency interpretation, distribution trends, and compounding slow-call risk. [Source](../../sources/notes/reliability/latencies-and-percentiles.md)
- [Cache-aside](cache-aside.md) — lazy-loading read path (hit, miss, database read, fill), write-time TTL, freshness versus database load, and common mistakes. [Source](../../sources/notes/reliability/cache-aside-learning-session.md)
- [Cache stampedes](cache-stampedes.md) — coalescing, expiry jitter, stale reads, bounded downstream work, and cache/downstream signals. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md)
- [Service resilience and observability](service-resilience-and-observability.md) — graceful degradation, rate limiting, coalescing, deadlines, retries, circuit breakers, bulkheads, load shedding, telemetry, and probes.

Sources: [Latencies: Averages and Percentiles](../../sources/notes/reliability/latencies-and-percentiles.md), [101. Cache-aside — learning session](../../sources/notes/reliability/cache-aside-learning-session.md), [Cache Stampedes — Study Notes](../../sources/notes/reliability/cache-stampede-study-notes.md), and [Senior Java and Spring Boot interview notes](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md)
