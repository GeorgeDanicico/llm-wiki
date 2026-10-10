# Capture metadata

- Title: 103. Write-through caching — learning session
- Captured: 2026-10-10
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/learning-sessions/2026-10-10-103-write-through-caching.md` (20-minute software-engineering learning session, area 06. Caching)
- Provenance note: Generated as a learning-session summary by an AI tutor. No external documentation was fetched during the session; the AWS ElastiCache and CPU-cache remarks and the reading list were named from memory and are unverified.

---
# 103. Write-through caching
2026-10-10: 2026-10-10 · Area: 06. Caching · Status: done

## Lesson boundary
Examine write latency and consistency assumptions.

## Key ideas
- **Write-through:** every write goes through the cache layer, which writes to the database **synchronously**. Only after the database confirms does the cache store the value and acknowledge the client. After a successful write, the cache and database hold the same value, so reads of that key are fresh with no invalidation step.
- **Order matters:** database first, cache second. If the database write fails, the cache must not keep the new value. Caching before the database confirms moves toward write-behind (topic 104).
- **Cost:** write latency is cache time + database time. Data that is written but never read still takes cache space.
- **Assumptions behind "cache = database":** all writers go through the cache layer; writes to one key are ordered; and the two stores are not atomic, so a failed cache up2026-10-10 after a committed database write leaves the cache stale.
- **Best fit:** read-heavy data read soon after it is written (write-once, read-many). Poor fit: write-heavy data that is rarely read.

## Worked example
```java
public Product save(Product p) {
    Product saved = repository.save(p);        // step 1: DB, synchronous
    cache.put("product:" + saved.id(), saved); // step 2: cache
    return saved;
}
```

Two threads up2026-10-10 product 7 concurrently:

| Step | Thread A (price=10) | Thread B (price=12) |
|---|---|---|
| 1 | DB write 10 | |
| 2 | | DB write 12 |
| 3 | | cache.put 12 |
| 4 | cache.put 10 | |

Result: **database = 12, cache = 10**; readers see the stale 10 on every hit until expiry or eviction. Mitigations: serialize writes per key, use versions (only overwrite if newer), keep a TTL as a safety net, or delete the cache key instead of putting the value.

## Trade-off / common mistake
- Pay write latency and cache space for fresh reads.
- Common mistake: letting another writer (a batch job, a script, another service) up2026-10-10 the database directly. Write-through has no invalidation to catch it, so the cache silently goes stale.
- **Scenario (seat reservations, write once, read thousands of times per second):** write-through is reasonable for the availability view if every booking and cancel goes through the cache layer, with a moderate TTL as a safety net. Decide the booking itself against the database (transaction or unique constraint), never the cached value.

## Flashcards
- Q: What does a write-through write do, and in what order? / A: The cache layer writes to the database synchronously; after the database confirms, it stores the value in the cache and acks the client.
- Q: Main cost of write-through? / A: Higher write latency (cache + database), plus cache space spent on data that may never be read.
- Q: Two assumptions write-through needs to stay consistent? / A: All writes go through the cache layer, and writes to the same key are ordered. The stores are not atomic, so concurrent writers or a failed cache up2026-10-10 can leave stale data.
- Q: Database write succeeds but the cache up2026-10-10 fails. What now? / A: The cache holds the old value; evict or invali2026-10-10 the key and/or return an error so the caller retries.

## Your check-in answers
- Prereq: who loads in cache-aside vs read-through → ✅
- Should the cache keep the value if the database write fails → ✅ No; retry-then-cache is possible but complex.
- Predict the concurrent-write outcome → 🟡 Reached "readers see 10" but did not state that the database holds 12.
- Seat-reservation scenario → 🟡 Spotted the cancellation risk; but write-once/read-many is where write-through helps most, and a long TTL worsens staleness.
- Q1 What write-through guarantees and where it breaks → 🟡 "Cache hit if the database write succeeded" is true but incomplete: the guarantee is that both stores hold the same value; it breaks with concurrent writers or bypassing writers.
- Q2 Nightly batch writes SQL directly → ✅ Bypassed the cache layer. Flushing everything is blunt; prefer writing through the cache or evicting the changed keys.
- Q3 Cache up2026-10-10 fails after database commit → ✅ B: invali2026-10-10 or retry.

## Seen in the wild
- AWS ElastiCache caching-strategies guidance documents write-through as a named strategy (from memory, not verified this session).
- Write-through caches are a standard design in CPU memory hierarchies (from memory).

## Learn more
- Amazon ElastiCache docs — "Caching strategies" (AWS): lazy loading vs write-through, with trade-offs. Named from memory; link not verified.
- *Designing Data-Intensive Applications* — Martin Kleppmann: discusses caches, derived data, and keeping them consistent with a system of record.

## Next up
- **104. Write-behind caching** — trace the data-loss risk of asynchronous persistence. Builds directly on today; no prerequisite redirect.
