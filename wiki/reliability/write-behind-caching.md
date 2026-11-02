# Write-Behind Caching

## Pattern and write path

In write-behind (also called write-back) caching the caller is acknowledged as soon as the write is in the cache. A background flusher persists dirty entries to the database later, usually in batches, and coalesces repeated writes to the same key, so 100 writes to one key can become a single database write. [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#key-ideas)

```text
Caller --write x=12--> Cache: store x=12, mark dirty
Caller <---200 OK----- Cache
          ... later (flush interval or batch size) ...
Flusher --take dirty batch--> Cache
Flusher --UPDATE x=12-------> Database --commit--> Flusher
Cache: mark x clean
```

Until the flush commits, the cache is the system of record for dirty entries. The cache usually lives in volatile memory (an in-process map or Redis), so for that period the only copy of an acknowledged write is in RAM. [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#key-ideas)

Compare [write-through caching](write-through-caching.md), where the caller waits for the database commit and the cache update. There, the durable database copy is the guarantee; in write-behind, "OK" no longer means "persisted". [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#your-check-in-answers)

## The loss window

The loss window for one write runs from the acknowledgement to the caller until the database commit of that write. It is roughly the flush interval plus the time spent waiting in the backlog plus the flush duration. After the commit, a crash costs only a cache miss, because the next read reloads the persisted value. [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#key-ideas)

Three ways to lose an acknowledged write inside the window: [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#key-ideas)

- **Cache node crash or restart.** Every dirty entry that was not yet flushed is lost.
- **Eviction of a dirty entry.** If the cache does not protect dirty entries, memory pressure can drop one silently.
- **Flush failure.** If the database rejects or times out the write and the flusher drops the batch, the write is lost. The caller already left with "OK", so there is nobody to return the error to unless the flusher retries, dead-letters, or alerts.

The window grows under stress. When the database slows down, the dirty backlog grows, so more acknowledged writes wait in RAM for longer. [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#key-ideas)

## Worked example: a flush failure that loses a write

[Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#worked-example)

```java
public void setQty(String cartItem, int qty) {
    cache.put(cartItem, qty);
    dirty.add(cartItem);                        // 200 OK immediately
}

@Scheduled(fixedDelay = 5000)
public void flush() {
    for (String key : dirty) {
        dirty.remove(key);                      // (A) BUG: removed before the write succeeds
        repo.upsert(key, cache.get(key));       // (B) throws → write lost forever
    }
}
```

| Time | Event | Cache | Dirty set | Database |
| --- | --- | --- | --- | --- |
| 0 s | set 3, acknowledged | 3 | item | old |
| 1 s | set 5, acknowledged | 5 | item | old |
| 5 s | flush: (A) runs, (B) fails | 5 | empty | old |
| 10 s | flush: nothing dirty | 5 | empty | old |

The two updates were coalesced into one attempted `upsert(5)`. Because the key left the dirty set before the write succeeded, no later flush retries it, and the database keeps the old value for good. The user sees 5 until the cache is restarted, and then the old value.

The fix for flush failures is to clear the dirty mark only after the commit, and only if the value did not change during the flush:

```java
repo.upsert(key, v);
if (Objects.equals(cache.get(key), v)) dirty.remove(key);
```

This does not protect against a crash of the JVM or the cache node, because the data is still only in RAM. [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#worked-example)

## Worked example: a restart before or after the flush

A game stores player gold balances with write-behind: Redis with persistence disabled, flushed to Postgres every 10 seconds. A player buys a 500-gold item and sees "Purchase complete". [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#your-check-in-answers)

- **Restart at 4 s, before the flush.** RAM is wiped, the dirty balance is lost, and the next flush finds nothing to write. On login the cache misses and reloads the pre-purchase balance from Postgres. The deduction is gone; if the item itself was stored durably, the player keeps both the item and the gold.
- **Restart at 12 s, after a successful flush at 10 s.** Postgres already holds the new balance, so the restart wipes only a clean copy and the next read reloads the correct value.

The system falls back to the last persisted state, not the last acknowledged one.

## Trade-off and fit

Common mistake: treating write-behind as "write-through, but faster". It is a weaker durability contract, traded for write throughput. [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#trade-off--common-mistake)

Ways to shrink the window, none of them free: [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#trade-off--common-mistake)

- A shorter flush interval, which reduces the coalescing benefit.
- A durable cache, for example Redis AOF with `appendfsync everysec`.
- Replicated cache backups.
- A durable log such as Kafka in front, which turns it into a different pattern.

Fit test: if the last N seconds of acknowledged writes were lost, who would notice and what would it cost? In the session's scenario, a "recently viewed products" list and product view counters fit write-behind, because losses go unnoticed and counters coalesce well. Order placement and currency balances do not; they need a synchronous database commit. [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#trade-off--common-mistake)

## Implementations

- **Hazelcast `MapStore`.** Setting `write-delay-seconds` above zero switches a map to write-behind. Entries are marked dirty and written later with `storeAll`, updates to one key are coalesced by default, and the write-behind queue capacity is configurable. An older Hazelcast Javadoc (3.3.x `WriteBehindStore`) lists operations not yet stored from the write-behind queue among causes of possible data inconsistency. [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#seen-in-the-wild)
- **Redis as the write-behind store.** Its persistence documentation states that AOF with `appendfsync everysec` may lose about one second of writes in a disaster, while RDB snapshots alone can lose minutes. [Source](../../sources/notes/reliability/write-behind-caching-learning-session.md#seen-in-the-wild)

## Source status and uncertainty

This page synthesizes one learning-session summary (captured 2026-11-02). The Hazelcast and Redis remarks were checked by the tutor against Hazelcast's MapStore documentation and Javadoc and Redis's persistence page at wrap-up. The current Hazelcast documentation found did not explicitly describe what happens to queued entries when a member crashes, so that behavior is not stated here. During the lesson the tutor said from memory that Hazelcast's documentation warns about crash loss and that Ehcache 2 offered write-behind; the summary corrected the first and omitted the second, so neither is synthesized. The worked examples, the window formula, and the fit guidance come from the tutor's session and are not externally verified. No conflicting wiki claims were found. Related pages: [Write-through caching](write-through-caching.md), [Read-through caching](read-through-caching.md), [Cache-aside](cache-aside.md).

Sources: [captured write-behind caching learning session](../../sources/notes/reliability/write-behind-caching-learning-session.md), library entry [104. Write-behind caching — learning session](../library/notes/write-behind-caching.md)
