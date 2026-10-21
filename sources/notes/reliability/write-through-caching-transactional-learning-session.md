# Capture metadata

- Title: 103. Write-through caching — second learning session (transaction timing, latency, fit)
- Captured: 2026-10-20
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/learning-sessions/2026-10-20-103-write-through-caching.md` (20-minute software-engineering learning session, area 06. Caching)
- Provenance note: Generated as a learning-session summary by an AI tutor. No external documentation was fetched during the session; the JCache, Hazelcast, Ehcache, and Debezium remarks, the latency figures, and the reading list were named from memory and are unverified.

---
# 103. Write-through caching
Date: 2026-10-20 · Area: 06. Caching · Status: done

## Lesson boundary
Examine write latency and consistency assumptions.

## Key ideas
- Every write goes through the cache layer, which writes to the database and then updates the cache, synchronously. The caller waits for both.
- The extra write latency is DB commit + one cache round trip. Usually the cache call is small compared with the commit. In exchange, the next read is a hit with the fresh value; with cache-aside invalidation, the next read is a miss.
- Order matters: database first, then cache, so a failed DB write never leaves a phantom (uncommitted) value in the cache.
- Write-through stays fresh only if (1) every write goes through the cache layer, (2) no crash happens between the DB commit and the cache update, and (3) concurrent writers don't interleave their two steps. Keep a TTL as the safety net.
- Usually paired with read-through (JCache `CacheLoader` + `CacheWriter`, `setReadThrough(true)` / `setWriteThrough(true)`).

## Worked example
```java
@Transactional
public void updatePrice(String sku, BigDecimal price) {
    repo.updatePrice(sku, price);                                   // SQL sent, not committed yet
    redis.opsForValue().set("price:" + sku, price, Duration.ofMinutes(30)); // cache written
}                                                                   // commit happens HERE
```
- Timeline: price 10 → `updatePrice(12)` → read returns 12 (hit). A nightly batch job then runs `UPDATE ... price = 15` directly → reads return 12 until the TTL expires, then 15 (the batch job bypassed the cache).
- Hidden bug: `@Transactional` commits after the method returns, so the cache is written before the commit. If the commit fails, Redis holds a phantom 12. Fix: update the cache after commit (`TransactionSynchronization.afterCommit()` or `@TransactionalEventListener(phase = AFTER_COMMIT)`).

## Trade-off / common mistake
- Cost: write latency on every write, plus cache pollution (writing keys nobody reads).
- Fits data that's read soon and often after it's written. A poor fit for write-heavy, read-light data.
- Scenario: 100k devices write telemetry every second, but only ~2% are viewed. Choose cache-aside with invalidation (or a short TTL) instead. Reconsider write-through if reads grow.
- Concurrent-writer race: W1 db, W2 db, W2 cache, W1 cache → cache=10, db=12 until the next write or TTL.

## Flashcards
- Q: What does the caller wait for in write-through? / A: The DB write and the cache update, both synchronous.
- Q: Why write the DB first? / A: So a failed DB write never leaves a phantom value in the cache.
- Q: Three ways write-through can go stale? / A: A writer that bypasses the cache; a crash between the commit and the cache update; interleaved concurrent writers.
- Q: Why can `@Transactional` make the cache write "too early"? / A: The commit happens on method return, after the cache put. Update the cache after commit.
- Q: When is write-through a poor fit? / A: Write-heavy, read-light data (latency and cache pollution).

## Your check-in answers
- Q1 Cache-aside vs write-through on writes → ✅ Correct. Refinement: "double latency" overstates it; the key difference is that the cache holds the fresh value afterwards instead of being empty.
- Q2 Admin service writing directly to Postgres → ✅ Bypass identified; fixes: route writes through the service, or invalidate on change (event/CDC). Keep a TTL.
- Q3 MCQ: most likely to stay stale indefinitely → ✅ B, concurrent interleaved writers.
- During the lesson: 🟡 Named TTL as what ends the stale value but missed "the next write through the cache".

## Seen in the wild
- JCache / JSR-107 (`CacheWriter`, write-through config), Hazelcast `MapStore` and Ehcache: write-through support built into the cache layer (from memory).
- Debezium: CDC from database logs, often used to invalidate caches when writers bypass the cache layer.

## Learn more
- JSR-107 (JCache) specification — sections on `CacheLoader`/`CacheWriter`, read-through and write-through (from memory)
- Hazelcast docs — "Loading and Storing Persistent Data" (`MapStore`, write-through vs write-behind) (from memory)
- AWS whitepaper — "Database Caching Strategies Using Redis" (lazy loading vs write-through) (from memory)
- Martin Kleppmann — *Designing Data-Intensive Applications* (derived data and keeping systems in sync)

## Next up
- 104. Write-behind caching — trace the data-loss risk of asynchronous persistence. Prerequisites 101–103 are done, so no redirect.
