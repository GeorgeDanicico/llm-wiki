# Cache Invalidation Races

## The race

In [cache-aside](cache-aside.md), a reader that misses reads from the database and then writes the value to the cache. Those two steps are not atomic, and time can pass between them (a GC pause, a slow network). If a writer commits a new value and deletes the key inside that gap, the reader's late `SET` puts the old value back into the cache. The delete still happened, but too early: it hit an empty key before the reader's `SET`. [Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#core-idea)

```
Reader (R)                    Writer (W)                Cache       DB
---------------------------------------------------------------------------
GET price:42 → miss                                     (empty)     10
SELECT price → 10
        ... R is paused (GC, slow network) ...
                              UPDATE price = 12                     12
                              DEL price:42              (empty)
SET price:42 = 10                                       10   ❌     12
```

What gets lost is the **invalidation**, not a cache update: the writer's delete is overwritten by the reader's stale fill. [Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#assessment)

## How long the stale value lives

The stale value stays until the TTL expires, or until the next write's `DEL` clears it. The TTL counts from the reader's late `SET`, not from the write, so the worst case is a full TTL of wrong data. Without a TTL the stale value can stay indefinitely. The TTL is the safety net that caps how long a race does damage. [Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#core-idea)

This extends the [TTL semantics](cache-aside.md#ttl-semantics) on the cache-aside page, where the TTL starts when the key is written.

## Where the gap sits in code

```java
public BigDecimal getPrice(long id) {
    String key = "price:" + id;
    BigDecimal cached = redis.opsForValue().get(key);      // 1. miss
    if (cached != null) return cached;

    BigDecimal fromDb = repo.findPrice(id);                 // 2. reads 10
    // ---- gap: a writer can commit 12 and DEL here ----   // 3.
    redis.opsForValue().set(key, fromDb, Duration.ofMinutes(10)); // 4. caches 10 ❌
    return fromDb;
}

@Transactional
public void updatePrice(long id, BigDecimal p) {
    repo.updatePrice(id, p);                                // commits 12
    redis.delete("price:" + id);                            // DEL lands inside step 3
}
```

1. The reader misses the cache.
2. The reader reads the old value, 10, from the database.
3. The race window: the writer commits 12 and deletes the key, which is not there yet.
4. The reader caches 10 with a fresh ten-minute TTL.

[Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#worked-example) The ten-minute TTL is illustrative, not a recommended default.

## Reading a timeline

The rule of thumb from the session is to ask **which happened last, the reader's `SET` or the writer's `DEL`?** If the `SET` came last, the cache is stale. [Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#core-idea)

| Step | Timeline A | Timeline B |
| --- | --- | --- |
| t=0s | R: `GET` → miss | R: `GET` → miss |
| t=1s | R: `SELECT` → "Ana" | R: `SELECT` → "Ana" |
| t=2s | W: `UPDATE` → "Ana Pop" | R: `SET` = "Ana" (TTL 5m) |
| t=3s | W: `DEL` | W: `UPDATE` → "Ana Pop" |
| t=4s | R: `SET` = "Ana" (TTL 5m) | W: `DEL` |

In A the reader's `SET` comes after the `DEL`, so "Ana" stays cached until about t=4s plus five minutes. In B the `DEL` comes after the stale `SET` and removes it, so the next read misses and loads "Ana Pop". [Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#assessment)

**Two framings, preserved.** The tutor's feedback said ordering, not transactions, is what saves B: the cache and the database are separate systems, and no transaction spans both. The learner's position is that, as a teaching simplification, the reader and writer in B can be modelled as two non-interfering units that run one after the other, and that even an ordering like B's can fail in real distributed systems. The two framings do not contradict each other. The session did not cover which real failures could break B. [Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#assessment)

## Delete-first does not fix it

Deleting the key before updating the database does not remove the race. It widens the window: between the `DEL` and the `COMMIT`, any reader misses, reads the old value from the database, and caches it. [Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#trade-off--common-mistake)

```
W: DEL price:42
R: GET → miss → SELECT → 10      (W hasn't committed yet)
R: SET price:42 = 10  ❌
W: COMMIT 12
```

A database failure after a delete-first is mostly harmless. The cache is just empty, and the next read reloads the correct old value, so the cost is one extra miss. The real problem with delete-first is the larger race window. [Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#trade-off--common-mistake)

## Mitigations (named, not taught)

The session named three mitigations without teaching them. They are unverified and each is a topic of its own: [Source](../../sources/notes/reliability/cache-invalidation-races-learning-session.md#trade-off--common-mistake)

- a short TTL, which caps how long the damage lasts;
- a delayed second delete, which deletes the key again shortly after the commit;
- versioned writes, which reject a `SET` when a newer version already exists.

**Synthesis:** [Write-through caching](write-through-caching.md#consistency-assumptions) lists "delete the cache key instead of putting the value" as one mitigation for concurrent-writer staleness. This page shows that a delete has its own race with concurrent cache-aside readers, so it moves the problem rather than removing it. A TTL appears as the backstop in both places.

## Source status and related knowledge

This page synthesizes one learning-session summary without independent external verification. No external documentation was fetched. No conflicting wiki claims were found; the write-through relationship above is agent synthesis. Related pages: [Cache-aside](cache-aside.md) (the read path this race lives in), [Write-through caching](write-through-caching.md) (concurrent-writer staleness) and [Cache stampedes](cache-stampedes.md) (many readers missing together).

Sources: [captured cache invalidation races learning session](../../sources/notes/reliability/cache-invalidation-races-learning-session.md), library entry [106. Cache invalidation races — learning session](../library/notes/cache-invalidation-races.md)
