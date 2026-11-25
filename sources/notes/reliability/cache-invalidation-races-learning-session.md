# Capture metadata

- Title: 106. Cache invalidation races — learning session
- Captured: 2026-11-25
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/Projects/Learning/session-notes/2026-11-25-106-cache-invalidation-races.md` (20-minute software-engineering learning session, area 06. Caching)
- Provenance note: Generated as a learning-session summary by an AI tutor. No external documentation was fetched during the session; the mitigations (short TTL, delayed second delete, versioned writes) were named from memory, not taught, and are unverified.

---
# 106. Cache invalidation races

- **Date:** 2026-11-25
- **Subject:** Software engineering · **Topic:** 106 (area 06. Caching)
- **Source:** software-engineering-20-minute-topics.md

## Lesson boundary
Walk through a read that repopulates stale data after a write.

## Why it matters
You update a product's price, delete its cache entry, and still see the old price for the next 10 minutes. Nothing failed: a write and a read simply ran concurrently in an unlucky order.

## Learning outcomes
- Trace the exact interleaving where a read puts stale data back into the cache after a write.
- Explain why "update the database, then delete the key" doesn't fully prevent it.

## Core idea
In cache-aside, the reader's miss path is *read from DB → write to cache*, and those two steps are **not atomic**. Time passes between them (GC pause, slow network). If a writer commits a new value and deletes the key inside that gap, the reader's late `SET` puts the old value back. The delete did happen, it just happened **too early**: it hit an empty key, before the reader's `SET`.

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

How long it stays stale: until the TTL expires, **counted from the reader's late `SET`** (not from the write), or until the next write's `DEL` clears it. With **no TTL**, the stale value can stay indefinitely. The TTL is the safety net that caps how long a race does damage.

Rule of thumb: ask **which happened last, the reader's `SET` or the writer's `DEL`?** If the `SET` was last, the cache is stale.

## Worked example
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
2. The reader gets the old value, 10, from the database.
3. The race window: the writer commits 12 and deletes the key, which isn't there yet.
4. The reader writes 10 into the cache with a fresh 10-minute TTL. Worst case: wrong price for up to the full TTL.

## Trade-off / common mistake
"Just delete the cache **before** updating the database" doesn't fix it. It **widens** the window: between the `DEL` and the `COMMIT`, any reader misses, reads the old value from the database, and caches it.

```
W: DEL price:42
R: GET → miss → SELECT → 10      (W hasn't committed yet)
R: SET price:42 = 10  ❌
W: COMMIT 12
```

A database failure after a delete-first is mostly harmless (the cache is just empty, and the next read reloads the correct old value). The real problem with delete-first is the larger race window.

Mitigations mentioned, but not taught (each is its own topic): a short TTL, a **delayed second delete** (delete again shortly after commit), and **versioned writes** (reject a `SET` if a newer version already exists).

## Assessment
| # | Question | Your answer (summary) | Feedback |
|---|---|---|---|
| Pitfall | Does deleting the cache before the DB update prevent the race? | No: the race happens after the cache was already checked, so the reader can still read the old value; some cases fixed, not all. Also worried the DB could be down after the delete. | ✅ Key insight right. ➕ Delete-first actually widens the window (readers between DEL and COMMIT cache the old value). A DB failure after the delete only costs one extra miss, it is not a correctness problem. |
| 1 | What is an invalidation race and why doesn't the `DEL` protect us? | The DEL creates a small window where reads sneak in; the reader reads stale data while the cache is being updated, the update is lost, and the stale value is shown until the TTL expires. | ✅ Essence right. ➕ In the update-then-delete case the DEL doesn't open a window, it comes too early (before the reader's late SET). What's lost is the invalidation, not a cache update. Model: the reader loads before the write and stores after the delete, so the delete hits an empty key and the stale value lives for a full TTL. |
| 2 | Two timelines (5-min TTL): is the cache left stale, and until when? | A: stale, because the reader writes the stale value after the delete. B: fine, because reader and writer can be treated as two transactions that run serially, so there is no conflict. | ✅ A correct. ➕ A stays stale until about t=4s + 5 min (TTL counts from the late SET). ✅ B correct conclusion. ➕ What saves B is ordering: the DEL (t=4s) comes after the stale SET (t=2s); cache and DB are separate systems with no transaction spanning both. |

Timelines used in Q2:

```
Timeline A                         Timeline B
t=0s  R: GET → miss                t=0s  R: GET → miss
t=1s  R: SELECT → "Ana"            t=1s  R: SELECT → "Ana"
t=2s  W: UPDATE → "Ana Pop"        t=2s  R: SET = "Ana" (TTL 5m)
t=3s  W: DEL                       t=3s  W: UPDATE → "Ana Pop"
t=4s  R: SET = "Ana" (TTL 5m)      t=4s  W: DEL
```

**Learner's follow-up remark:** As a teaching simplification, the reader and the writer in B can be treated as two non-interfering units that run one after the other. The learner knows the cache and database are separate services, and noted that even an ordering like B's can fail in real distributed systems. (Tutor's agreement: fair as a model. Examples of how B could still fail were not covered in the session.)

## Key takeaways
1. In cache-aside, the reader's *read-from-DB → write-to-cache* isn't atomic. A write and its `DEL` landing in that gap let the stale value go back into the cache.
2. The deciding question: **did the reader's `SET` come after the writer's `DEL`?** If so, it's stale for a full TTL counted from that `SET`. With no TTL, it can stay stale indefinitely.
3. Deleting *before* the DB update doesn't fix it, it widens the window. A TTL caps the damage, and techniques like a delayed double delete or versioned writes narrow or close the gap.

## Next steps
- Suggested next topic: **105. Time-to-live selection**, since the TTL decides how long a race does damage.
- Something to try on your own: draw the timeline for a delayed double delete and find the remaining gap.
