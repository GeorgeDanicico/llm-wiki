# Capture metadata

- Title: 101. Cache-aside — learning session
- Captured: 2026-10-05
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/learning-sessions/2026-10-05-101-cache-aside.md` (20-minute software-engineering learning session, area 06. Caching)
- Provenance note: Generated as a learning-session summary; the cited external references were not independently verified during capture.

---

# 101. Cache-aside
Date: 2026-10-05 · Area: 06. Caching · Status: done

## Lesson boundary
Trace a cache hit, cache miss, and database read.

## Key ideas
- **Cache-aside (lazy loading)** puts a fast key-value store (e.g. Redis) *next to* the database. The **application** does all the work; the cache is passive and never talks to the database.
- **Read path:** 1) `GET key` from the cache → 2) **hit**: return it, DB untouched → 3) **miss**: the app queries the DB → 4) the app `SET`s the result with a TTL, then returns it.
- A **miss** happens when the key was never stored (cold cache or evicted) or has **expired**.
- The **TTL starts when the key is written**. A plain `GET` hit does not extend it, so the TTL is an upper bound on how stale a cached value can be.
- The cache is **optional**: if it goes down, reads fall through to the DB, *if* the code treats cache errors as misses (catch exceptions, short timeouts). The DB then takes the full load, the same risk as a stampede (topic 107).

## Worked example
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
Spring's `@Cacheable` generates the same flow.

Trace with an empty cache and a 5-minute TTL:

| Time | Call | Result |
|---|---|---|
| 10:00:00 | `getProduct(42)` | Miss → DB, key expires at 10:05:00 |
| 10:00:10 | `getProduct(42)` | Hit (does not reset the TTL) |
| 10:00:20 | `getProduct(7)` | Miss → DB |
| 10:06:00 | `getProduct(42)` | Miss → DB (expired) |

**Total: 3 DB queries.**

## Trade-off / common mistake
- **Trade-off: stale reads vs DB load.** The cache holds a copy, so a DB update isn't visible until the key expires (or is evicted). A short TTL means fresher data but more misses and DB load. A long TTL means fewer reads but staler data. **The TTL is how stale you can afford to be.**
- **Decision rule:** cache rarely-changing data (product descriptions) with a long TTL. Never serve decision-critical data (stock at checkout) from the cache; at most cache a *display* value with a very short TTL.
- **Mistake 1: no TTL.** Keys live until evicted, so changed data can be stale forever.
- **Mistake 2: not caching "not found".** Lookups for missing IDs miss the cache *and* hit the DB every time.

## Flashcards
- Q: In cache-aside, who loads data into the cache on a miss? / A: The application. It reads the DB, then writes to the cache.
- Q: The 4 steps of a cache-aside read? / A: GET from cache → hit: return → miss: query DB → SET with TTL, return.
- Q: Does a cache hit reset the TTL on a plain Redis GET? / A: No. The countdown starts at write time.
- Q: The cache server goes down; what happens? / A: Reads fall through to the DB (if errors are treated as misses), and the DB takes the full load.
- Q: The main trade-off when picking a TTL? / A: Freshness vs DB load.

## Your check-in answers
- Q1 Explain the miss flow → 🟡 Flow correct. Precision: the **app** sends the `SET`, the cache doesn't load anything itself (that's what distinguishes cache-aside from read-through).
- Q2 User's renamed profile stale for ~1 hour → ✅ Cached before the update, nothing evicted it, so it was served until the TTL expired. Fixes: evict on update (has its own race conditions) or a shorter TTL (more DB load).
- Q3 Spot the bug (`set` without TTL) → ✅

## Seen in the wild
- **Facebook / Meta**: memcache is used as a "demand-filled look-aside cache" in front of MySQL. Web servers read memcache, fall back to the DB on a miss, then fill memcache, and delete keys on writes. The paper also covers protecting the DB from thundering herds and cold caches.
- **Spring Framework**: `@Cacheable` implements cache-aside declaratively.
- **AWS ElastiCache** and **Azure Managed Redis**: both document cache-aside (lazy loading) as the default caching pattern.

## Learn more
- [Scaling Memcache at Facebook — USENIX NSDI 2013 (Nishtala et al.)](https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala) · [PDF](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf): cache-aside at huge scale, including leases against stale sets and thundering herds. Section 3 is the most relevant.
- [Cache-Aside pattern — Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside): clear write-up with considerations (TTL, eviction, consistency) and the "update DB *then* delete cache key" ordering.
- [Caching patterns — AWS whitepaper "Database Caching Strategies Using Redis"](https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html): short comparison of cache-aside vs write-through. (Marked as historical reference by AWS, but the patterns still hold.)

## Next up
- **102. Read-through caching**: locate loading responsibility and compare it with cache-aside. This follows directly from your Q1 note about who loads the cache. No prerequisite redirect: it builds on 101, which is now done.
- Then 103 Write-through and 105 TTL selection. 108 Single-flight loading (which builds on your 107 stampedes) is now unblocked too.
