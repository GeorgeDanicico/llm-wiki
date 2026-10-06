# Capture metadata

- Title: 102. Read-through caching — learning session
- Captured: 2026-10-06
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/learning-sessions/2026-10-06-102-read-through-caching.md` (20-minute software-engineering learning session, area 06. Caching)
- Provenance note: Generated as a learning-session summary. During the session, the Caffeine population wiki, the Hazelcast "Building a Cache with MapStore" page (5.5), and the Redisson `MapLoader` Javadoc were fetched and confirmed to describe loader-based read-through; the JCache claim was stated from memory and not verified.

---

# 102. Read-through caching
Date: 2026-10-06 · Area: 06. Caching · Status: done

## Lesson boundary
Locate loading responsibility and compare it with cache-aside.

## Key ideas
- **Read-through:** the application only talks to the cache. On a miss, the **cache itself** calls a **loader** (`key → value`) that was registered when the cache was built, stores the result, and returns it. Callers never see a miss.
- **The difference from cache-aside is where the loading logic lives.** In cache-aside, the miss handling (`if null → query DB → SET`) is repeated at every call site. In read-through, it's written **once, in the loader**, and the cache decides when to call it. The code is *moved*, not removed.
- **What does not change:** cold misses still hit the DB (every key is loaded once either way), staleness is still bounded by the TTL, and writes still need explicit invalidation. Read-through is a structural pattern, not a performance or freshness upgrade.
- **Read-through covers only the read path.** Anything that writes the DB must call `cache.invalidate(key)`. Otherwise the stale value lives until the TTL expires.
- **Plain Redis can't do read-through on its own.** It has no loader hook, no query code and no DB credentials. You need an app-side layer such as Caffeine `LoadingCache`, JCache `CacheLoader` (`readThrough`), Redisson `MapLoader`, or Hazelcast `MapLoader`.

## Worked example
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
|---|---|---|
| 10:00:00 | `getProduct(42)` | Miss → loader → DB load |
| 10:00:10 | `getProduct(42)` | Hit |
| 10:00:20 | `getProduct(7)` | Miss → loader → DB load |
| 10:00:30 | Admin renames 42 "Mug" → "Coffee Mug" via the repository | Cache not touched |
| 10:01:00 | `getProduct(42)` | Hit → **"Mug"** (stale until 10:05:00) |

**2 DB loads.** Fix the staleness with `cache.invalidate(42)` after the update.

## Trade-off / common mistake
- **Centralisation costs flexibility.** There's one loader per cache, so there's one way to load a key. That breaks down when a caller needs to **bypass** the cache for fresh data, when the lookup isn't a simple key (search filters, pagination), and because DB failures and latency now surface from an innocent-looking `cache.get()`.
- **Mistake:** assuming read-through keeps the cache fresh. It doesn't handle writes. Invalidate in the write path.
- **Decision scenario (your answer):** product-by-ID used by 12 identical callers → read-through ✅. Checkout price → no cache, call the repository directly ✅. Admin report by `(category, page, sort)` → cache-aside is plausible, but with low traffic and a low hit rate, *no cache* may be better 🟡.

## Flashcards
- Q: In read-through, who calls the DB on a miss? / A: The cache, via a loader registered at build time. The caller just calls `get(key)`.
- Q: Core difference between cache-aside and read-through? / A: Where the loading responsibility lives: every call site (cache-aside) versus once, in the cache's loader (read-through).
- Q: Does read-through reduce DB queries or staleness compared with cache-aside? / A: No. It has the same misses, the same cold-start DB trips and the same TTL-bounded staleness.
- Q: Why can't plain Redis do read-through by itself? / A: It has no loader hook (no query code, no credentials), so you need an app-side library layer.
- Q: One limitation of read-through? / A: One loader per cache: it's hard to bypass, it fits multi-criteria lookups poorly, and DB failures hide behind `get()`.

## Your check-in answers
- Prereq: who loads in cache-aside → ✅ The app queries the DB and sets the cache.
- Why Redis can't be read-through → ✅ It has no loader. Nuance: use an app-side library (e.g. Redisson MapLoader).
- Fill-in: why cold-start DB queries don't drop → ✅
- Predict the trace → ✅✅ 2 DB loads; "Mug" is stale because nothing invalidated it.
- Q1 Explain what changed → 🟡 "Nothing else changed" was right. Precision: the loading code is **moved** into the loader, not removed, and it's the service code that gets cleaner, not the repository.
- Q2 Stale display name for 10 min → 🟡 Cause right. The fix is **explicit `cache.invalidate(id)`** in `updateName()`, not an "eviction policy". Read-through only governs reads.
- Q3 Multiple choice → ✅ "Cache calls a loader on miss."
- Re-check fill-in (loader / miss / TTL expires / `invalidate`) → ✅ Gap closed.

## Seen in the wild
- **Caffeine / Guava**: `LoadingCache` takes a `CacheLoader` at build time; `get(key)` computes the value if absent.
- **Hazelcast**: `MapLoader` gives an `IMap` read-through persistence: `map.get()` triggers `load()` on a miss. `MapStore` extends it to write-through and write-behind.
- **Redisson (Redis client)**: `RMap` with a `MapLoader` loads missing keys in read-through mode. This is how you get read-through on top of Redis.
- **JCache (JSR-107)**: `CacheLoader` plus `setReadThrough(true)` in the cache configuration (from memory).

## Learn more
- [Population — Caffeine wiki (Ben Manes)](https://github.com/ben-manes/caffeine/wiki/Population): manual vs loading vs async caches. It also notes that `get` may return `null` if the loader can't compute a value.
- [Building a Cache with MapStore — Hazelcast docs (5.5)](https://docs.hazelcast.com/hazelcast/5.5/mapstore/working-with-external-data): read-through in a distributed cache, and how MapLoader differs from MapStore.
- [MapLoader — Redisson Javadoc](https://javadoc.io/static/org.redisson/redisson/3.24.0/org/redisson/api/map/MapLoader.html): the interface that adds read-through to a Redis-backed map.

## Next up
- **103. Write-through caching**: examine write latency and consistency assumptions. This is the write-side counterpart to today. No prerequisite redirect.
- Also unblocked: **108. Single-flight loading**. A read-through cache is the natural place to coalesce concurrent misses for one key.
