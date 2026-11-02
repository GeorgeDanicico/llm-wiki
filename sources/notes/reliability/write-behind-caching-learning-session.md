# Capture metadata

- Title: 104. Write-behind caching — learning session (data-loss risk of asynchronous persistence)
- Captured: 2026-11-02
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/learning-sessions/2026-11-02-104-write-behind-caching.md` (20-minute software-engineering learning session, area 06. Caching)
- Provenance note: Generated as a learning-session summary by an AI tutor. At wrap-up the tutor searched the web for Hazelcast MapStore documentation and fetched the Redis persistence page; the Hazelcast and Redis remarks were checked against those pages. The worked example, timelines, and fit guidance come from the tutor's session and were not checked against external documentation.

---
# 104. Write-behind caching
Date: 2026-11-02 · Area: 06. Caching · Status: done

## Lesson boundary
Trace the data-loss risk of asynchronous persistence.

## Key ideas
- Write-behind (write-back): the caller is acknowledged once the write is in the cache. A background flusher persists dirty entries to the DB later, usually batched and coalesced (100 writes to one key become 1 DB write).
- Until the flush commits, the cache is the system of record for dirty entries, and the cache usually lives in volatile RAM (in-process map or Redis).
- Loss window for one write = from the ack to the caller until the DB commit of that write ≈ flush interval + backlog wait + flush duration. After the commit, a crash costs only a cache miss.
- Three ways to lose an acknowledged write: (1) cache node crash/restart, (2) eviction of a dirty entry, (3) flush fails and the batch is dropped. In case 3 the caller already left, so there's nobody to return the error to.
- The window grows under stress: a slow DB means a growing backlog, so more acked writes sit in RAM for longer.
- "OK" no longer means "persisted". Fit test: if we lose the last N seconds of acked writes, who notices and what does it cost?

## Worked example
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
- Timeline: set 3 (t=0), set 5 (t=1) → flush at t=5 attempts ONE upsert(5) (coalesced), fails after (A) → at t=10 nothing is dirty → DB keeps the old value for good. The user sees 5 until a restart, then the old value.
- Fix for flush failures: clear dirty only after commit, and only if the value didn't change during the flush:
  `repo.upsert(key, v); if (Objects.equals(cache.get(key), v)) dirty.remove(key);`
- This does NOT protect against a JVM/cache crash (failure 1). The data is still only in RAM.

## Trade-off / common mistake
- Mistake: treating write-behind as "write-through, but faster". It's a weaker durability contract, traded for throughput.
- Ways to shrink the window (none of them free): shorter flush interval (less coalescing), durable cache (Redis AOF `appendfsync everysec` ≈ up to 1 s loss), replicated cache backups, or a durable log (e.g. Kafka) in front, which turns it into a different pattern.
- Scenario: recently viewed list and view counters → write-behind fits (losses go unnoticed, and counters coalesce well). Order placement / currency → synchronous DB commit.

## Flashcards
- Q: What is the loss window of a write-behind write? / A: From the ack to the caller until the DB commit of that write. The cache (RAM) holds the only copy.
- Q: Three ways an acked write is lost? / A: Cache crash/restart, eviction of a dirty entry, flush failure that drops the batch.
- Q: Why is a DB failure worse in write-behind than in write-through? / A: The caller was already told OK and won't retry. The error has no one to go to unless the flusher retries, dead-letters, or alerts.
- Q: Why does risk grow when the DB slows down? / A: The dirty backlog grows, so more acked writes wait longer in RAM.
- Q: Which question decides if write-behind fits? / A: If we lose the last N seconds of acked writes, who notices and what does it cost?

## Your check-in answers
- Hook: where is data guaranteed after a write-through OK? → ✅ DB and cache (the DB is the guarantee that matters; the cache copy can be evicted).
- Flashcard: why a failed DB write is worse here → 🟡 Missed that the caller was already acknowledged and can't retry.
- Predict (cart example) → ✅ One coalesced write; DB keeps the old value.
- Scenario (recently viewed / orders / counters) → ✅✅✅
- Q1 "write-behind = write-through on a background thread" → ✅ Durability is traded for throughput. Sharpen: OK ≠ persisted, errors can't reach the caller.
- Q2 Gold balance, Redis restart at t=4 s before the 10 s flush → ❌ on the trace: the player sees the pre-purchase balance (deduction lost, possibly a free item). 🟡 on mitigations: AOF ✅, but "clear dirty after save" fixes flush failures, not crashes; the real fix for currency is a synchronous write.
- Q2 retry: restart at t=12 s after a successful flush at t=10 s → ✅ Purchase persisted; the restart only costs a cache miss.
- Q3 MCQ: slow DB, flushes take 30 s → ✅ Risk grows.

## Seen in the wild
- Hazelcast IMDG / Platform `MapStore`: `write-delay-seconds > 0` switches a map to write-behind. Entries are marked dirty and written later via `storeAll`, with per-key coalescing by default and a configurable write-behind queue capacity. An older Hazelcast Javadoc (3.3.x `WriteBehindStore`) lists "not yet stored write behind queue operation" among things that can cause data inconsistencies.
- Redis as the write-behind store: its persistence docs state that AOF with `appendfsync everysec` may lose about 1 second of writes in a disaster, while RDB snapshots alone can lose minutes.

## Learn more
- [Configuring a MapStore — Hazelcast docs (5.5)](https://docs.hazelcast.com/hazelcast/5.5/mapstore/configuration-guide) — write-through vs write-behind config, coalescing, batch size.
- [Redis persistence — Redis docs](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) — RDB vs AOF and exactly how much data each fsync policy can lose.
- [WriteBehindStore Javadoc — Hazelcast 3.3.5](https://docs.hazelcast.org/docs/3.3.5/javadoc/com/hazelcast/map/mapstore/writebehind/WriteBehindStore.html) — the old note listing operations that can cause write-behind inconsistencies.

## Next up
- 105. Time-to-live selection — balance acceptable staleness against refresh load. No prerequisite redirect: it builds on 101–104, which are done.
