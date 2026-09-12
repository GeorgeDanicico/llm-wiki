# Cache Stampedes

## Failure mode

A cache stampede occurs when many callers concurrently see the same missing or expired entry and independently repeat an expensive database or downstream operation. The key danger is duplicate work converging on one key—not expiration by itself. The resulting load can slow the dependency, hold scarce connections, trigger timeouts and retries, and then amplify further. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#1-intuitive-explanation)

A longer TTL can reduce how often an entry expires, but it cannot prevent duplicate work when a hot key eventually misses. Set TTLs from the data’s freshness contract rather than attempting to conceal a concurrency problem with a longer lifetime. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#first-understanding-check-longer-ttl)

## Complementary controls

| Control | Protects primarily against | Boundary or trade-off |
| --- | --- | --- |
| TTL jitter | Many different keys expiring together | Does not coalesce a hot key’s one miss |
| Single-flight / request coalescing | Concurrent loads for the same key | Does not protect a wave of distinct misses |
| Stale-while-revalidate (SWR) | Refresh latency and some refresh failures | Requires an explicitly permitted stale period |
| Distributed coordination | Duplicate loads across instances | Adds lock, ownership, availability, and partition semantics |
| Admission control | More cache misses than the backend can safely serve | Intentionally rejects or delays excess work |

TTL jitter randomizes lifetimes around a freshness-valid base TTL to spread synchronized expiry after warm-up, deployment, or batch population. Retry jitter is separate: it spreads failure retries and does not spread cache expiry. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#3-ttl-jitter-a-different-failure-mode) [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#4-failed-loads-retries-and-stale-while-revalidate)

## Per-key request coalescing

Single-flight gives one request ownership of a refresh for a cache key; concurrent callers for that key wait for or share its result. It should be keyed narrowly so a refresh for one item does not block unrelated items. For a local JVM implementation, an atomically installed in-flight future represents the load and is conditionally removed after success or failure. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#2-single-flight--request-coalescing) [Related local implementation](../java/concurrent-in-memory-caching.md)

Local coalescing reduces duplicate work only within each process. With multiple pods, an expired hot key can still result in roughly one refresh per participating pod; whether that remaining work is safe is a capacity decision. Distributed coordination may reduce it further, but should be added only when the residual duplicate loads are materially unsafe. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#local-versus-distributed-coordination)

If a leader’s load fails, its waiters should not fan out into independent retries. Keep retry ownership with the leader, limit attempts and elapsed time, use backoff plus jitter, and retry only transient, safe operations. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#4-failed-loads-retries-and-stale-while-revalidate)

## Freshness and stale serving

SWR can return a value during an explicitly permitted stale interval while one background refresh proceeds. It lowers latency and can preserve availability, but it is not compatible with strict freshness rules. A long TTL, jitter, or a stale interval cannot make data safe when the business contract requires more current information—for example, potentially changing checkout prices. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#stale-while-revalidate-swr) [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#6-pricing-scenario-freshness-limits-the-available-defenses)

Event-driven invalidation or updates can be preferable to relying solely on expiration when data changes arrive as events. This is a design option from the supplied note, not a guarantee that events meet a particular freshness requirement. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#6-pricing-scenario-freshness-limits-the-available-defenses)

## Cross-instance coordination hazards

A basic `SETNX`-style Redis lock without expiry can strand a key after its owner crashes. A distributed refresh lock needs a bounded lease, ownership-safe release, behavior for a refresh that outlives its lease, and policy for partitions and lock-wait timeout. When duplicate writers could cause harm, fencing or versioning may also be necessary. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#5-distributed-lock-caveats)

This adds a dependency with ambiguous failure modes, so local coalescing is often the lower-risk first layer when one refresh per instance stays within the backend’s safe capacity. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#5-distributed-lock-caveats)

## Protecting a downstream during cache failure

Single-flight protects convergent hot-key misses; it cannot create capacity for a flood of distinct uncached keys or a complete cache outage. Bound database concurrency, keep any queue finite, and shed work beyond the real residual backend capacity. The supplied note recommends using `503 Service Unavailable` with `Retry-After` for temporary capacity loss, and reserving `429 Too Many Requests` for deliberate client or request rate limits. These response choices remain implementation and API-contract decisions. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#8-full-profile-service-exercise) [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#9-redis-outage-and-load-shedding)

The intended request path is cache, then per-key coalescing, then bounded downstream work. After a failed refresh, make only coordinated bounded retries; if permitted stale data is unavailable, fail fast rather than translating unlimited frontend concurrency into unlimited backend concurrency. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#8-full-profile-service-exercise)

## Observability

Monitor cache hit ratio, miss rate by key or key class, latency, evictions, and entry size alongside downstream query rate, pool utilization, saturation, tail latency, and errors. To verify that coalescing is actually effective, record in-flight loads, coalesced-load count, leader duration, and waiter count. A rise in cache misses alongside database QPS and latency is a strong stampede signal. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#7-observability-verify-cache-protection)

## Source status and related knowledge

This page synthesizes the supplied study note without independent external verification. Its values and scenarios are illustrative; it does not establish universal TTLs, retry counts, queue limits, distributed-lock algorithms, or stale-data policy. No conflict was found with the older [Concurrent in-memory caching](../java/concurrent-in-memory-caching.md) page, which covers the same local coalescing primitive; this page adds the distributed-cache, freshness, and capacity-protection context.
