# Cache Stampedes — Study Notes

## Coverage

A user-supplied study note explaining cache-miss storms, per-key request coalescing, local and distributed coordination, TTL and retry jitter, stale-while-revalidate, distributed-lock hazards, capacity protection, and cache/downstream observability.

## Ideas contributed to the wiki

- [Cache stampedes](../../reliability/cache-stampedes.md)
- [Service resilience and observability](../../reliability/service-resilience-and-observability.md)
- [Concurrent in-memory caching](../../java/concurrent-in-memory-caching.md)

## Source status

Captured on 2026-09-12 from a local ChatGPT project file. Authorship and independent verification status were not supplied. The ingestion preserves the study note’s wording and treats its examples, figures, operational defaults, and HTTP-response recommendations as unverified guidance rather than universal rules. Freshness windows, retry policy, lock semantics, and capacity limits must be chosen and tested for the specific system. The related existing cache page agrees on local in-JVM coalescing; no conflicting wiki claims were identified.

Source: [captured cache-stampede study note](../../../sources/notes/reliability/cache-stampede-study-notes.md)
