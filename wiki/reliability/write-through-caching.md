# Write-Through Caching

## Pattern and write path

In write-through caching every write goes through the cache layer. The cache layer writes to the database synchronously, stores the value in the cache only after the database confirms, and then acknowledges the client. After a successful write the cache and the database hold the same value, so reads of that key are fresh without an invalidation step. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#key-ideas)

```text
Client --write(k,v)--> Cache layer --1. write v--> Database
                           |<-------2. ack--------------|
                           | 3. store k=v in cache
Client <-----4. ack--------|
```

The order is database first, cache second. If the database write fails, the cache must not keep the new value. The session noted that caching the value first and retrying the database write later is possible but complex; that is the direction of asynchronous persistence, which the catalog covers separately as write-behind. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#your-check-in-answers)

Compare [cache-aside](cache-aside.md) and [read-through caching](read-through-caching.md), which govern only reads and rely on invalidation after writes. Write-through is the write-path counterpart: the cache layer owns the write instead of leaving a stale entry behind.

Write-through is usually paired with read-through, so one cache layer owns both a loader for misses and a writer for updates. A read that follows a successful write is a cache hit on the new value. The second session named JCache (JSR-107) `CacheLoader`/`CacheWriter` with `setReadThrough(true)`/`setWriteThrough(true)`, and Hazelcast and Ehcache, as implementations; these API names were given from memory and are unverified. [Source](../../sources/notes/reliability/write-through-caching-transactional-learning-session.md#key-ideas)

## Cost

Write latency is cache time plus database time, so a write is slower than a plain database write. Data that is written but never read still occupies cache space. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#key-ideas)

The second session refined the latency comparison with [cache-aside](cache-aside.md). A cache-aside write also makes a cache call (an invalidation), and the cache round trip is usually small next to the database commit. So the main difference is not the extra latency. It is what the cache holds afterwards: the fresh value, so the next read hits, or nothing, so the next read misses and reloads. The figures given (about 1 ms for a Redis call against several milliseconds for a commit) were illustrative and unverified. [Source](../../sources/notes/reliability/write-through-caching-transactional-learning-session.md#key-ideas)

## Consistency assumptions

"Cache equals database" holds only under assumptions: [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#key-ideas)

- **All writers go through the cache layer.** A direct database write (a batch job, a script, another service) leaves the cache stale, because write-through has no invalidation to catch it.
- **Writes to the same key are ordered.** Concurrent writers can interleave the database and cache steps differently.
- **The two stores are not atomic.** If the database commit succeeds but the cache update fails, the cache keeps the old value.

## Worked example: concurrent writers

[Source](../../sources/notes/reliability/write-through-caching-learning-session.md#worked-example)

```java
public Product save(Product p) {
    Product saved = repository.save(p);        // step 1: DB, synchronous
    cache.put("product:" + saved.id(), saved); // step 2: cache
    return saved;
}
```

| Step | Thread A (price=10) | Thread B (price=12) |
| --- | --- | --- |
| 1 | DB write 10 | |
| 2 | | DB write 12 |
| 3 | | cache.put 12 |
| 4 | cache.put 10 | |

The database ends at 12 and the cache at 10. Readers see the stale 10 on every cache hit until the entry expires or is evicted, even though both writes were synchronous. Mitigations listed in the session: serialize writes per key, use versions so only a newer value overwrites the cache, keep a TTL as a safety net, or delete the cache key instead of putting the value. The session offered these as common approaches, not an exhaustive or verified list.

If the database write succeeds and the cache update then fails, the state is new value in the database and old value in the cache; the cache layer should evict or invalidate the key and/or return an error so the caller retries. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#your-check-in-answers)

## Worked example: cache written before the transaction commits

[Source](../../sources/notes/reliability/write-through-caching-transactional-learning-session.md#worked-example)

```java
@Transactional
public void updatePrice(String sku, BigDecimal price) {
    repo.updatePrice(sku, price);                                   // SQL sent, not committed yet
    redis.opsForValue().set("price:" + sku, price, Duration.ofMinutes(30)); // cache written
}                                                                  // commit happens HERE
```

The source order reads database first, cache second. But with a transaction around the method, the commit happens only when the method returns, after the cache write. If the commit then fails (the session named a deadlock, a constraint violation, or a serialization error), the database rolls back while the cache keeps the uncommitted value. Readers can also see the new value in the cache before it is visible in the database. The fix is to update the cache after the commit, for example with `TransactionSynchronization.afterCommit()` or `@TransactionalEventListener(phase = AFTER_COMMIT)`. Related: a local Spring transaction does not include other resources such as a cache; see [Spring transactions, beans, and scopes](../frameworks/spring-transactions-beans-and-scopes.md#rollback-and-asynchronous-boundaries).

In the same example, a nightly job runs `UPDATE product SET price = 15` directly. Reads keep returning the cached 12 until the 30-minute TTL expires, then load 15. This is the bypassing-writer assumption breaking. [Source](../../sources/notes/reliability/write-through-caching-transactional-learning-session.md#worked-example)

## Trade-off and fit

Write-through spends write latency and cache space to get fresh reads. It suits read-heavy data that is read soon after it is written (write once, read many), and fits poorly where data is write-heavy and rarely read. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#trade-off--common-mistake)

Scenario from the session: a seat-availability view for a ticketing system, where each seat is written about once and read thousands of times per second. Write-through is reasonable if every booking and every cancellation goes through the cache layer, with a moderate TTL as a safety net. The booking decision itself should be made against the database (a transaction or unique constraint), never against the cached value. A long TTL makes a missed cancellation stay visible longer. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#your-check-in-answers)

Common mistake: letting a batch job update the database directly. Flushing the whole cache afterwards works but is blunt, and a burst of misses then hits the database (see [Cache stampedes](cache-stampedes.md)). Better options are to write through the cache layer, or evict only the changed keys. [Source](../../sources/notes/reliability/write-through-caching-learning-session.md#your-check-in-answers)

The second session applied the same mistake to another service. An admin microservice updates `email` directly in a shared Postgres database, and the profile service keeps serving the old email. The fixes were to route the admin tool's writes through the owning service, or to invalidate the key when the database changes, by publishing a change event or by change data capture from the database log (Debezium reading the Postgres WAL was named from memory). In both cases, keep a TTL as a backstop. [Source](../../sources/notes/reliability/write-through-caching-transactional-learning-session.md#your-check-in-answers)

Second-session scenario: 100,000 devices each write a latest reading every second, but only about 2% are viewed on a dashboard at any time. Write-through would pay write latency and fill the cache with keys nobody reads (cache pollution). The recommended choice was cache-aside with invalidation on write, or a short TTL. Write-through can be reconsidered if reads grow. [Source](../../sources/notes/reliability/write-through-caching-transactional-learning-session.md#trade-off--common-mistake)

## Source status and uncertainty

This page synthesizes two learning-session summaries on the same catalog topic (captured 2026-10-10 and 2026-10-20). Their claims agree; the second adds the transaction-timing pitfall, the latency comparison with cache-aside, the read-through pairing, and the telemetry and admin-service scenarios. Its framework API names, latency figures, and CDC example are from memory and unverified. The mitigation list and the fit guidance come from the tutor's session and were not checked against external documentation. The summary's remarks that AWS ElastiCache documents write-through and that CPU caches use it were stated from memory and are not synthesized here as verified claims. No conflicting wiki claims were found. Related pages: [Cache-aside](cache-aside.md), [Read-through caching](read-through-caching.md), [Cache stampedes](cache-stampedes.md).

Sources: [captured write-through caching learning session](../../sources/notes/reliability/write-through-caching-learning-session.md), library entry [103. Write-through caching — learning session](../library/notes/write-through-caching.md), [captured second write-through learning session](../../sources/notes/reliability/write-through-caching-transactional-learning-session.md), library entry [103. Write-through caching — second learning session](../library/notes/write-through-caching-transactional.md)