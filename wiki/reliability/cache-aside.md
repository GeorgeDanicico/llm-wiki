# Cache-Aside

## Pattern and responsibility

Cache-aside (also called lazy loading) places a fast key-value store, such as Redis, next to the database. The application does all of the work: it reads the cache, falls back to the database, and fills the cache. The cache is passive and never talks to the database itself. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#key-ideas)

Who loads the cache on a miss is what distinguishes cache-aside from read-through caching: in cache-aside the application sends the `SET`. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#your-check-in-answers) In read-through caching, the cache calls a registered loader on a miss instead; see [Read-through caching](read-through-caching.md) for the comparison. [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#key-ideas)

## Read path

1. `GET` the key from the cache.
2. On a **hit**, return the cached value; the database is not touched.
3. On a **miss**, the application queries the database.
4. The application `SET`s the result with a TTL, then returns it.

A miss occurs when the key was never stored (a cold cache or an evicted entry) or when it has expired. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#key-ideas)

```java
public Product getProduct(long id) {
    String key = "product:" + id;
    String cached = redis.opsForValue().get(key);          // 1. look in cache
    if (cached != null) {
        return fromJson(cached);                            // 2. HIT
    }
    Product p = productRepository.findById(id).orElseThrow(); // 3. MISS → DB read
    redis.opsForValue().set(key, toJson(p), Duration.ofMinutes(5)); // 4. fill
    return p;
}
```

Spring's `@Cacheable` generates the same flow declaratively. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#worked-example)

## TTL semantics

The TTL starts when the key is written. A plain Redis `GET` hit does not extend it, so the TTL is an upper bound on how stale a cached value can be. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#key-ideas)

Worked trace with an empty cache and a five-minute TTL: [Source](../../sources/notes/reliability/cache-aside-learning-session.md#worked-example)

| Time | Call | Result |
| --- | --- | --- |
| 10:00:00 | `getProduct(42)` | Miss → database; key expires at 10:05:00 |
| 10:00:10 | `getProduct(42)` | Hit (does not reset the TTL) |
| 10:00:20 | `getProduct(7)` | Miss → database |
| 10:06:00 | `getProduct(42)` | Miss → database (expired) |

The trace makes three database queries.

## Freshness versus database load

The cache holds a copy, so a database update is not visible until the key expires or is evicted. A short TTL gives fresher data at the cost of more misses and database load; a long TTL gives fewer reads but staler data. In the source's words, the TTL is how stale you can afford to be. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#trade-off--common-mistake)

Decision rule from the source: cache rarely changing data, such as product descriptions, with a long TTL. Never serve decision-critical data, such as stock at checkout, from the cache; at most cache a display value with a very short TTL. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#trade-off--common-mistake) This agrees with the freshness-contract framing on [Cache stampedes](cache-stampedes.md#freshness-and-stale-serving).

Example diagnosis: a user's renamed profile stayed stale for about an hour because the value was cached before the update and nothing evicted it, so it was served until the TTL expired. The fixes are to evict the key on update, which has its own race conditions, or to shorten the TTL, which increases database load. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#your-check-in-answers) The source's reading list points to Microsoft guidance that orders writes as update the database first, then delete the cache key; that guidance was not read or verified during capture. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#learn-more)

## Common mistakes

- **No TTL.** Keys live until evicted, so changed data can stay stale indefinitely.
- **Not caching "not found".** Lookups for missing IDs miss the cache and hit the database every time.

[Source](../../sources/notes/reliability/cache-aside-learning-session.md#trade-off--common-mistake)

## Cache failure

The cache is optional: if it goes down, reads fall through to the database, provided the code treats cache errors as misses (catching exceptions and using short timeouts). The database then takes the full load, the same risk as a stampede. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#key-ideas)

**Synthesis:** "Optional" here means correctness does not depend on the cache, not that the database can absorb the fallback traffic. [Cache stampedes](cache-stampedes.md#protecting-a-downstream-during-cache-failure) describes the protections needed for that case: bounded database concurrency, finite queues, and load shedding.

## Seen in the wild

The source reports these uses; they were not independently verified during capture. [Source](../../sources/notes/reliability/cache-aside-learning-session.md#seen-in-the-wild)

- **Facebook / Meta** describes memcache as a "demand-filled look-aside cache" in front of MySQL: web servers read memcache, fall back to the database on a miss, fill memcache, and delete keys on writes. The cited paper also covers thundering herds and cold caches.
- **Spring Framework** implements cache-aside declaratively with `@Cacheable`.
- **AWS ElastiCache** and **Azure Managed Redis** document cache-aside (lazy loading) as the default caching pattern.

## Source status and related knowledge

This page synthesizes one learning-session summary without independent external verification. The five-minute TTL and the trace are illustrative, not recommended defaults. No conflicting wiki claims were found. Related pages: [Read-through caching](read-through-caching.md) (the same read path with loading moved into the cache), [Cache stampedes](cache-stampedes.md) (what happens when many callers miss together) and [Concurrent in-memory caching](../java/concurrent-in-memory-caching.md) (local coalescing of loads).

Sources: [captured cache-aside learning session](../../sources/notes/reliability/cache-aside-learning-session.md), [captured read-through caching learning session](../../sources/notes/reliability/read-through-caching-learning-session.md), library entry [101. Cache-aside — learning session](../library/notes/cache-aside.md)
