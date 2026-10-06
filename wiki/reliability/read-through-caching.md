# Read-Through Caching

## Pattern and responsibility

In read-through caching the application talks only to the cache. On a miss, the cache itself calls a loader, a `key → value` function registered when the cache was built. The cache then stores the result and returns it, so callers never see a miss. [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#key-ideas)

The difference from [cache-aside](cache-aside.md) is where the loading logic lives. In cache-aside, the miss handling (`if null → query database → SET`) is repeated at every call site. In read-through, it is written once, in the loader, and the cache decides when to call it. The loading code is moved, not removed: the service still calls `cache.get(key)`, and the repository is unchanged. [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#your-check-in-answers)

```text
CACHE-ASIDE                          READ-THROUGH
App ──GET──▶ Cache (miss)            App ──get(42)──▶ Cache (miss)
App ──SELECT──▶ DB                                    Cache ──load(42)──▶ Loader ──SELECT──▶ DB
App ──SET──▶ Cache                                    Cache stores value
App returns value                    App ◀── value ── Cache
```

## What stays the same as cache-aside

| | Cache-aside | Read-through |
| --- | --- | --- |
| Who calls the database on a miss | Application code at each call site | The cache, through its registered loader |
| Does the caller see a miss? | Yes, and must handle it | No; `get()` returns a value |
| Loading logic | Duplicated per call site | One loader per cache |
| First request for a key | Database trip | Database trip |
| Staleness | Bounded by the TTL | Bounded by the TTL |
| Writes | Application updates the database and evicts the key | Same; read-through does not cover writes |

Cold misses still reach the database, because every key is loaded once whichever pattern is used. Staleness is still bounded by the TTL, and writes still need explicit invalidation. Read-through is a structural pattern, not a performance or freshness upgrade. [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#key-ideas)

## Writes and invalidation

Read-through covers only the read path. Anything that writes the database must invalidate the cached key itself; otherwise the stale value lives until the TTL expires. [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#key-ideas) Size limits, LRU or LFU eviction, and TTL expiry remove entries only eventually, so explicit invalidation in the write path is the fix for a stale value after an update: [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#your-check-in-answers)

```java
public void updateName(long id, String name) {
    userRepository.updateName(id, name);
    cache.invalidate(id);          // next get(id) → miss → loader reloads the fresh value
}
```

This matches the cache-aside rule of updating the database and then removing the key; see [Cache-aside](cache-aside.md#freshness-versus-database-load).

## Worked example

A Caffeine `LoadingCache` registers the loader once, so the business method needs no miss handling: [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#worked-example)

```java
this.cache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(Duration.ofMinutes(5))
    .build(id -> {                                   // the loader
        log.info("DB load {}", id);
        return repo.findById(id).orElse(null);
    });

public Product getProduct(long id) {
    return cache.get(id);                            // no miss handling here
}
```

Trace with an empty cache:

| Time | Event | Result |
| --- | --- | --- |
| 10:00:00 | `getProduct(42)` | Miss → loader → database load |
| 10:00:10 | `getProduct(42)` | Hit |
| 10:00:20 | `getProduct(7)` | Miss → loader → database load |
| 10:00:30 | Product 42 renamed from "Mug" to "Coffee Mug" through the repository | Cache not touched |
| 10:01:00 | `getProduct(42)` | Hit → "Mug" (stale until 10:05:00) |

The trace makes two database loads. Calling `cache.invalidate(42)` after the update removes the stale value. The five-minute TTL is illustrative, not a recommended default.

## Where read-through needs a loader-capable layer

A plain Redis server cannot do read-through on its own: it has no loader hook, no query code, and no database credentials, so a `GET` miss just returns nothing. Read-through on top of Redis needs an application-side layer that owns the loader. [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#key-ideas) The pattern therefore describes who owns the loading logic from the business code's point of view, not which process runs the query. [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#your-check-in-answers)

Loader-based read-through implementations named by the source: [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#seen-in-the-wild)

- **Caffeine and Guava** `LoadingCache` take a `CacheLoader` at build time; `get(key)` computes the value if absent. The Caffeine documentation also notes that `get` may return `null` when the loader cannot compute a value.
- **Hazelcast** `MapLoader` gives an `IMap` read-through persistence: `map.get()` triggers `load()` on a miss. `MapStore` extends it to write-through and write-behind.
- **Redisson** (a Redis client) `RMap` with a `MapLoader` loads missing keys in read-through mode.
- **JCache (JSR-107)** uses a `CacheLoader` with read-through enabled in the cache configuration. *Unverified:* the source states this from memory.

## Trade-off: centralisation costs flexibility

A read-through cache has one loader, so there is one way to load a key. That fits many identical callers fetching by the same key, but it is a poor fit when: [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#trade-off--common-mistake)

- a caller needs to bypass the cache for fresh data;
- the lookup is not a simple key, such as search filters or pagination;
- database failures and latency would surface from a `cache.get()` call that looks cheap at the call site.

Common mistake: assuming read-through keeps the cache fresh. It does not handle writes.

Decision scenario from the session: [Source](../../sources/notes/reliability/read-through-caching-learning-session.md#trade-off--common-mistake)

| Access | Choice | Reason |
| --- | --- | --- |
| Product by ID for display, twelve identical callers | Read-through | Same key and same query everywhere |
| Price read at checkout to charge the customer | No cache; read the repository directly | Decision-critical data must not be stale |
| Admin report by `(category, page, sort)` | Cache-aside is plausible; no cache may be better | Multi-criteria lookup fits a `key → value` loader poorly, and low traffic with many key combinations gives a low hit rate |

**Synthesis:** because every miss for a key passes through one loader, a read-through cache is a natural place to coalesce concurrent loads for the same key. The source defers that idea to a later topic (single-flight loading), so this page does not describe it further. Related coalescing guidance exists in [Cache stampedes](cache-stampedes.md) and [Concurrent in-memory caching](../java/concurrent-in-memory-caching.md#coalescing-cache-misses).

## Source status and related knowledge

This page synthesizes one learning-session summary. The Caffeine, Hazelcast, and Redisson references were fetched and confirmed during the session; the JCache claim was not verified. No conflicting wiki claims were found. Related pages: [Cache-aside](cache-aside.md), [Cache stampedes](cache-stampedes.md), and [Concurrent in-memory caching](../java/concurrent-in-memory-caching.md).

Sources: [captured read-through caching learning session](../../sources/notes/reliability/read-through-caching-learning-session.md), library entry [102. Read-through caching — learning session](../library/notes/read-through-caching.md)
