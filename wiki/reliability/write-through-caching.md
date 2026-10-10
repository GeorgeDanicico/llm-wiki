# Write-Through Caching

## Pattern and write path

In write-through caching every write goes through the cache layer. The cache layer writes to the database synchronously, stores the value in the cache only after the database confirms, and then acknowledges the client. After a successful write the cache and the database hold the same value, so reads of that key are fresh without an invalidation step. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#key-ideas)

`	ext
Client --write(k,v)--> Cache layer --1. write v--> Database
                           |<-------2. ack--------------|
                           | 3. store k=v in cache
Client <-----4. ack--------|
`

The order is database first, cache second. If the database write fails, the cache must not keep the new value. The session noted that caching the value first and retrying the database write later is possible but complex; that is the direction of asynchronous persistence, which the catalog covers separately as write-behind. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#your-check-in-answers)

Compare [cache-aside](cache-aside.md) and [read-through caching](read-through-caching.md), which govern only reads and rely on invalidation after writes. Write-through is the write-path counterpart: the cache layer owns the write instead of leaving a stale entry behind.

## Cost

Write latency is cache time plus database time, so a write is slower than a plain database write. Data that is written but never read still occupies cache space. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#key-ideas)

## Consistency assumptions

"Cache equals database" holds only under assumptions: [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#key-ideas)

- **All writers go through the cache layer.** A direct database write (a batch job, a script, another service) leaves the cache stale, because write-through has no invalidation to catch it.
- **Writes to the same key are ordered.** Concurrent writers can interleave the database and cache steps differently.
- **The two stores are not atomic.** If the database commit succeeds but the cache update fails, the cache keeps the old value.

## Worked example: concurrent writers

[Source](../../sources/notes/reliability/write-through-caching-learning-session.md#worked-example)

`java
public Product save(Product p) {
    Product saved = repository.save(p);        // step 1: DB, synchronous
    cache.put("product:" + saved.id(), saved); // step 2: cache
    return saved;
}
`

| Step | Thread A (price=10) | Thread B (price=12) |
| --- | --- | --- |
| 1 | DB write 10 | |
| 2 | | DB write 12 |
| 3 | | cache.put 12 |
| 4 | cache.put 10 | |

The database ends at 12 and the cache at 10. Readers see the stale 10 on every cache hit until the entry expires or is evicted, even though both writes were synchronous. Mitigations listed in the session: serialize writes per key, use versions so only a newer value overwrites the cache, keep a TTL as a safety net, or delete the cache key instead of putting the value. The session offered these as common approaches, not an exhaustive or verified list.

If the database write succeeds and the cache update then fails, the state is new value in the database and old value in the cache; the cache layer should evict or invalidate the key and/or return an error so the caller retries. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#your-check-in-answers)

## Trade-off and fit

Write-through spends write latency and cache space to get fresh reads. It suits read-heavy data that is read soon after it is written (write once, read many), and fits poorly where data is write-heavy and rarely read. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#trade-off--common-mistake)

Scenario from the session: a seat-availability view for a ticketing system, where each seat is written about once and read thousands of times per second. Write-through is reasonable if every booking and every cancellation goes through the cache layer, with a moderate TTL as a safety net. The booking decision itself should be made against the database (a transaction or unique constraint), never against the cached value. A long TTL makes a missed cancellation stay visible longer. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#your-check-in-answers)

Common mistake: letting a batch job update the database directly. Flushing the whole cache afterwards works but is blunt, and a burst of misses then hits the database (see [Cache stampedes](cache-stampedes.md)). Better options are to write through the cache layer, or evict only the changed keys. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#your-check-in-answers)

## Source status and uncertainty

This page synthesizes one learning-session summary. The mitigation list and the fit guidance come from the tutor's session and were not checked against external documentation. The summary's remarks that AWS ElastiCache documents write-through and that CPU caches use it were stated from memory and are not synthesized here as verified claims. No conflicting wiki claims were found. Related pages: [Cache-aside](cache-aside.md), [Read-through caching](read-through-caching.md), [Cache stampedes](cache-stampedes.md).

Sources: [captured write-through caching learning session](../../sources/notes/reliability/write-through-caching-learning-session.md), library entry [103. Write-through caching — learning session](../library/notes/write-through-caching.md)