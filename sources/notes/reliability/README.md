# Reliability source notes

Immutable source material about service reliability, caching, and downstream protection.

- [101. Cache-aside — learning session](cache-aside-learning-session.md) — user-supplied learning-session summary about the cache-aside read path, TTL semantics, freshness versus database load, and common mistakes; captured on 2026-10-05.
- [Graceful Degradation Practices](graceful-degradation-practices.md) — user-supplied note about rate limiting, request coalescing, load shedding, retry jitter, circuit breakers, timeouts, and monitoring; captured on 2026-09-29.
- [Latencies: Averages and Percentiles](latencies-and-percentiles.md) — user-supplied study note about tail latency, percentile interpretation, monitoring trends, and compounding slow-call risk; captured on 2026-09-20.
- [Cache Stampedes — Study Notes](cache-stampede-study-notes.md) — user-supplied study note about cache-miss storms, request coalescing, expiry jitter, stale serving, and downstream overload protection; captured on 2026-09-12.
