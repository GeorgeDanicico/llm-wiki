# Capture metadata

- Title: Cache Stampedes — Study Notes
- Captured: 2026-09-12
- Source type: User-supplied study note
- Origin: Local ChatGPT project file `cache-stampede-study-notes.md`
- Provenance note: Authorship and independent verification status were not supplied.

---

# Cache Stampedes — Study Notes

## Session overview

| Item | Notes |
| --- | --- |
| **Today’s topic** | Cache stampedes (cache-miss storms) |
| **Broader area** | Distributed systems, caching, performance, and reliability |
| **Why it matters** | A cache protects a backend only while it serves hits. A cache miss can multiply one backend load into thousands of simultaneous operations. |
| **Where it appears** | Redis-backed Spring services, API/query caches, CDNs, recommendation engines, and expensive downstream API calls. |
| **Goal** | Explain the failure mode, select appropriate defenses, and protect downstream capacity under cache or database failure. |

---

## 1. Intuitive explanation

Imagine a Spring Boot endpoint that generates product recommendations. Calculating them requires a database query that takes roughly 500 ms, so the service caches the result in Redis for ten minutes.

```java
@Cacheable(cacheNames = "recommendations", key = "#productId")
public Recommendations getRecommendations(long productId) {
    return recommendationRepository.calculate(productId);
}
```

Normally:

```text
Request → Redis HIT → return in a few ms
```

Now suppose a popular product’s cache entry expires and 500 requests arrive nearly simultaneously. Each observes the same miss and independently calls the database.

```text
500 concurrent requests
        ↓
same cache MISS
        ↓
500 duplicate DB calculations
        ↓
DB saturation → slower queries → held connections → timeouts/retries → more load
```

A **cache stampede** happens when many callers simultaneously encounter missing or expired cached data and independently redo the same expensive work. It is a cache-specific form of the broader **thundering-herd problem**.

> The problem is not simply expiration. It is many callers reacting to the same miss with duplicate expensive work.

### First understanding check: longer TTL

**Question:** Does changing a popular key’s TTL from 10 to 60 minutes solve the stampede?

**Your answer:** It would make the problem happen less frequently, but would not completely fix it.

**Evaluation:** Correct. A longer TTL may reduce the *frequency* of expiration, but does not control concurrent duplicate work when a hot key eventually misses. TTL must be driven by freshness requirements, not only performance goals.

---

## 2. Single-flight / request coalescing

**Single-flight** (also called **request coalescing**) gives one request ownership of a refresh for one cache key. Other concurrent callers for that same key wait for, or share, that leader’s result.

```text
1,000 requests for product 123
             ↓
          cache MISS
             ↓
     one leader refreshes
             ↓
       database query
             ↓
       populate Redis
             ↓
all waiters receive the same result
```

The desired change is:

```text
Without coordination: 1,000 misses → 1,000 DB operations
With single-flight:   1,000 misses → about 1 DB operation
```

Coordination is **per cache key**: a load for product 123 must not block product 456.

### Simplified local Spring Boot shape

This example shows the important property: at most one local in-flight computation per key. Production code must additionally consider executor capacity, deadlines, cancellation, and error mapping.

```java
private final ConcurrentHashMap<Long, CompletableFuture<Profile>> inFlight =
        new ConcurrentHashMap<>();

public Profile getProfile(long userId) {
    Profile cached = redis.get("profile:" + userId);
    if (cached != null) {
        return cached;
    }

    CompletableFuture<Profile> created = new CompletableFuture<>();
    CompletableFuture<Profile> existing = inFlight.putIfAbsent(userId, created);

    if (existing != null) {
        return existing.join(); // another request owns this key's refresh
    }

    try {
        Profile profile = profileRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException(userId));
        redis.put("profile:" + userId, profile, ttlWithJitter());
        created.complete(profile);
        return profile;
    } catch (Throwable error) {
        created.completeExceptionally(error);
        throw error;
    } finally {
        inFlight.remove(userId, created);
    }
}
```

### Local versus distributed coordination

| Approach | One hot key across 30 pods | Strengths | Costs and limits |
| --- | --- | --- | --- |
| Local single-flight, e.g. ConcurrentHashMap | Up to about 30 backend loads, one per pod | Simple, fast, no distributed lock | Not global; a restart loses in-flight state |
| Distributed coordination / lock | Ideally one backend load for the fleet | Stronger cross-pod deduplication | Extra network dependency, lock expiry/ownership/crash semantics |

**Question:** With 30 pods, local single-flight, and 3,000 evenly distributed requests for one expired key, how many expensive calculations might occur?

**Your answer:** At most 30 rather than 3,000 — a 100× reduction.

**Evaluation:** Correct. It is not globally coordinated, but one load per pod is often safe enough and much simpler than a distributed lock. Add distributed coordination only when that residual cross-pod load is still unsafe.

---

## 3. TTL jitter: a different failure mode

If deployment, warm-up, or batch population fills many keys at roughly the same time, an identical TTL makes them expire together.

```text
12:00  many keys populated
12:10  many keys expire together
       ↓
       burst of unrelated DB loads
```

**TTL jitter** randomizes the lifetime around a base TTL so expirations spread out.

```java
Duration baseTtl = Duration.ofMinutes(10);
long extraSeconds = ThreadLocalRandom.current().nextLong(0, 120);
Duration ttl = baseTtl.plusSeconds(extraSeconds);
```

```text
key A → 10m 17s
key B → 11m 03s
key C → 10m 41s
key D → 10m 09s
```

| Technique | Primary protection | It does not solve |
| --- | --- | --- |
| Longer TTL | Frequent refreshes | Duplicate work at one hot-key miss |
| TTL jitter | Many **different** keys expiring together | One very hot key expiring |
| Single-flight | Many callers loading the **same** key | A flood of distinct uncached keys |
| Stale-while-revalidate | Refresh latency/failure when stale reads are allowed | Strict freshness requirements |
| Distributed lock | Duplicate refreshes across instances | Lock and dependency failure modes |

### Product-catalog scenario

**System:** 40 EKS pods, 20,000 requests/s peak, product data cached in Redis for 15 minutes. Entries tend to be populated in batches after deployments; database CPU spikes every ~15 minutes.

Options considered:

1. Increase the TTL from 15 to 60 minutes.
2. Add ±20% TTL jitter.
3. Add per-pod single-flight.

**Your answer:** Use a 60-minute TTL only if data does not change frequently, add TTL jitter, monitor the app, and add single-flight if spikes remain.

**Evaluation and refinement:**

- Correct: a longer TTL is acceptable only if that staleness is acceptable.
- Correct: periodic spikes aligned with the TTL strongly suggest synchronized expiry, so jitter directly targets the likely cause.
- Good signals: DB CPU, cache hit/miss rate, latency, and connection-pool pressure.
- Refinement: in a high-throughput system, local single-flight is often cheap enough to add proactively. Jitter protects many keys, but cannot stop one product receiving 2,000 concurrent requests from stampeding when its own key expires.

A strong default is:

```text
TTL based on freshness requirements
        + TTL jitter
        + local single-flight for hot misses
```

---

## 4. Failed loads, retries, and stale-while-revalidate

**Question:** 500 callers wait behind a single-flight leader, then its DB query times out. Should all 500 retry independently?

**Your answer:** That would remove the benefit of single-flight; there should be a retry mechanism that remains reliable.

**Evaluation:** Exactly. The leader should own the retry policy and waiters should continue sharing the same in-flight work.

```text
500 callers
     ↓
single-flight leader
  ├─ DB attempt 1 → timeout
  ├─ exponential backoff + jitter
  ├─ DB attempt 2 → success
  ↓
all callers receive one result
```

Keep retries bounded and coordinated:

```text
maximum attempts: 2–3
exponential backoff
jitter on every delay
overall request deadline / timeout
```

Retry only failures that are plausibly transient and safe to retry. Uncoordinated retries create a **retry storm**, reintroducing the very load that single-flight removed.

**TTL jitter** and **retry jitter** are independent controls:

- TTL jitter spreads cache expirations.
- Retry jitter spreads retries after failure.

### Stale-while-revalidate (SWR)

If the business permits briefly old data, a cache entry can have a fresh period plus an allowed stale period.

```text
value = profile
fresh until = 12:00
stale allowed until = 12:05
```

At 12:01:

```text
request A → return stale value and start one background refresh
request B → return stale value
request C → return stale value
```

SWR trades freshness for lower latency and better resilience. It is valid only when the stale window is explicitly acceptable.

---

## 5. Distributed-lock caveats

A simplistic Redis lock is dangerous:

```text
SETNX lock:product:123
```

Without an expiry, a crashed owner can leave the key permanently unrefreshable.

If distributed coordination is necessary, account for:

- a bounded lease/expiry;
- an owner token and compare-and-delete release;
- a refresh that runs longer than its lease, creating more than one leader;
- Redis or network partitions;
- lock wait timeout behavior: serve stale, retry later, or fail fast;
- fencing/versioning if duplicate writers can harm correctness.

Distributed locks reduce cross-instance duplicate work, but they also add a distributed dependency and ambiguous failure modes. Local single-flight is usually the safer first layer when it reduces load enough.

---

## 6. Pricing scenario: freshness limits the available defenses

**Scenario:** Prices change roughly every 30 seconds. One product receives 10,000 requests/s and its cached price expires. Consider a 10-minute TTL, TTL jitter, per-pod single-flight, and SWR allowing prices to remain stale for five minutes.

**Your answer:** A 10-minute TTL and its jitter do not fit. Per-pod single-flight is the best fit. SWR might work because some refreshes may return the same price.

**Evaluation and correction:**

- Correct: a 10-minute TTL is incompatible with prices that may change every 30 seconds.
- Correct: single-flight protects the backend without loosening the freshness rule.
- Important correction: a five-minute stale window is usually unsafe. A prior refresh returning the same value cannot tell us whether *this* refresh will reveal a change, e.g. €100 → €75.
- TTL jitter cannot make an invalidly long TTL safe. It can still spread expirations when used with a short TTL that meets the freshness contract.
- For checkout or financially sensitive price reads, stale serving may be forbidden or limited to a very short explicitly approved window.

A suitable design is:

```text
TTL ≈ allowed freshness interval
        + single-flight
        + short timeouts and coordinated bounded retry
        + only an explicitly allowed short stale fallback
```

If price changes are delivered as events, proactively updating or invalidating the Redis entry can be better than relying only on expiration.

---

## 7. Observability: verify cache protection

Monitor both cache behavior and downstream health.

| Area | Useful signals |
| --- | --- |
| Cache | hit ratio, miss rate, misses by key/key class, cache latency, evictions, entry count/size |
| Coalescing | cache loads in flight, coalesced-load count, leader duration, waiter count |
| Database | query rate, acquired/available pool connections, saturation, p95/p99 latency, errors/timeouts |
| Resilience | retries by attempt/result, stale responses, shed requests, bounded-queue depth/wait |
| Correlation | cache misses ↑, DB QPS ↑, DB latency ↑ together is a strong stampede signal |

Two particularly useful metrics are:

```text
cache_loads_in_flight
cache_loads_coalesced_total
```

They show whether coalescing is actually reducing duplicate work rather than merely being present in the code.

---

## 8. Full profile-service exercise

**System**

```text
Spring Boot profile service
20 EKS pods
50,000 requests/s peak
GET /profiles/{userId}
Redis cache
DB supports ~3,000 queries/s
Profiles may be at most 5 minutes stale
10% of traffic targets the top 100 users
```

### Your proposed solution

- Use a five-minute TTL because that is the freshness limit.
- Add local single-flight for repeated hot keys.
- If 50,000 requests use different keys, single-flight cannot prevent DB overload.
- Use stale-while-revalidate because profile data is not very important.
- Use retry jitter so thousands of retries do not synchronize.
- Monitor acquired/available DB connections, cache hit/miss/size, and DB/cache latency.

### Evaluation and refined architecture

Your reasoning was strong, especially the recognition that single-flight works only when requests converge on the **same key**.

- **TTL:** five minutes is valid only if data may genuinely be five minutes old. A practical policy could be fresh for 4–5 minutes, with jitter, while remaining inside the allowed staleness contract.
- **Jitter:** add TTL jitter independently of retry jitter.
- **Coordination:** local single-flight is a good default. Across 20 pods, a hot missing key may create about 20 loads rather than thousands. Use distributed coordination only if those 20 loads are dangerous.
- **SWR:** appropriate if stale profile data is business-approved. For example, return data as fresh for four minutes; until minute five return stale while one asynchronous refresh runs.
- **Distinct misses:** there is still protection available. A wave of 50,000 different misses needs **admission control**; no cache mechanism can create database capacity.
- **Metrics:** add the two coalescing metrics above.

Refined request path:

```text
Request
  ↓
Redis
  ├─ fresh HIT ───────────────────→ return
  ├─ stale HIT ───────────────────→ return stale
  │                                  └→ one asynchronous refresh
  └─ MISS
       ↓
  local single-flight (per key)
       ↓
  bounded DB concurrency / admission control
       ↓
      DB
```

Failure path:

```text
DB error or timeout
     ↓
coordinated, bounded retry with exponential backoff + jitter
     ↓
serve permitted stale data, if any
     ↓
otherwise fail fast
```

The top 100 users are exactly where local coalescing and SWR provide outsized benefit because traffic converges on a small set of keys.

---

## 9. Redis outage and load shedding

**Scenario:** The DB is already around 90% utilized. Redis becomes completely unavailable, and the application receives 50,000 requests/s. Every request now behaves like a cache miss.

**Your answer:** Do not allow all requests to reach the DB. Limit DB concurrency; use only a bounded queue because an unbounded queue would grow quickly; batch requests where genuinely possible; otherwise accept safe traffic and reject the rest.

**Evaluation and refinements:**

- Correct principle: **protect the database even if that requires rejecting application traffic.** A degraded service is better than a cascading failure.
- **Concurrency limiting:** cap DB work at the service’s real residual capacity.
- **Queueing:** retain only a small bounded queue. An unbounded queue translates overload into unbounded latency and memory pressure.
- **Batching:** helps only when work can be combined, such as one query using an IN clause; it is not universal.
- **Responses:** prefer HTTP 503 Service Unavailable with Retry-After for temporary capacity loss. Use 429 Too Many Requests for deliberate client/request rate limits. Avoid generic 500 for intentional overload shedding.
- **Capacity correction:** a DB capable of 3,000 queries/s but already at 90% cannot safely accept 3,000 more. The cache-backed service may have only a few hundred QPS of remaining budget.

```text
50,000 requests/s
      ↓
Redis unavailable
      ↓
admission limiter + bounded DB concurrency
  ├─ within safe budget → DB
  └─ excess traffic     → fail fast: 503 + Retry-After
```

This is **load shedding**: intentionally rejecting work the system cannot safely process in order to preserve the health of the system.

> Never allow frontend concurrency to translate directly into unlimited backend concurrency.

### Final 2–3 sentence explanation

Redis reduces database load only while requests can be served from cache. If Redis is unavailable, many keys expire together, or traffic targets uncached keys, requests can fall through to the database and create a sudden load spike or cache stampede. The application therefore still needs single-flight, bounded concurrency, load shedding, timeouts, and controlled retries.

---

## 10. Concise summary

A cache stampede occurs when many concurrent requests encounter the same missing or expired entry and independently recompute it. Use TTLs based on freshness needs, jitter for synchronized expiry, local request coalescing for hot-key misses, stale-while-revalidate only when stale data is acceptable, and coordinated bounded retries. Redis is not a capacity guarantee: downstream systems still need timeouts, concurrency limits, and load shedding.

---

## 11. Five review questions with answers

1. **What causes a cache stampede?**  
   Many concurrent requests see the same missing or expired entry and independently do the expensive backend load.

2. **Does increasing TTL solve stampedes?**  
   No. It can reduce frequency but does not stop duplicate work when a hot key misses.

3. **What does single-flight do?**  
   It coalesces concurrent loads for one key so one caller performs the work and other callers share its result.

4. **Why use TTL jitter?**  
   To spread expirations across many keys and avoid synchronized miss storms after batch population or warm-up.

5. **Why can retries worsen a stampede?**  
   Independent retries multiply traffic during failure. Keep them bounded, jittered, and owned by the coalesced leader.

---

## 12. Three interview questions with strong sample answers

### What is a cache stampede?

> A cache stampede occurs when many concurrent requests encounter the same expired or missing cache entry and independently recompute it, creating a sudden spike against a database or downstream service. Mitigations include request coalescing, TTL jitter, stale-while-revalidate where permitted, and sometimes distributed coordination.

### What is the difference between TTL jitter and single-flight?

> TTL jitter distributes expiration times across many keys to prevent synchronized expiry. Single-flight coordinates concurrent requests for one key so only one expensive recomputation happens. They solve different failure modes and are often combined.

### Would you use a distributed lock to prevent stampedes?

> Only when cross-instance duplicate refreshes are materially dangerous. Local single-flight is simpler and may reduce thousands of calls to roughly one per application instance. A distributed lock provides stronger coordination but introduces latency and failure modes around expiry, ownership, crashes, partitions, and availability.

---

## 13. Recognition checklist

Use explicit cache-stampede protection when several conditions apply:

- Cache misses trigger expensive DB or downstream work.
- Access is highly concurrent.
- A few keys are hot.
- Entries are warmed or expire in synchronized batches.
- Backend capacity is much lower than frontend capacity.
- DB CPU/QPS/latency spikes correlate with cache misses.
- Retries can multiply downstream load.
- Stale data may be acceptable for a tightly bounded period.

---

## 14. Independent exercise

Design caching for a Spring Boot endpoint with 12 pods, 15,000 requests/s at peak, Redis, and a database with a safe residual budget of 400 queries/s. Data may be two minutes stale, and 25% of traffic targets the top 50 keys.

Decide:

1. Fresh TTL, stale window, and jitter range.
2. Whether local single-flight is sufficient, and why.
3. DB timeout, retry attempts, backoff, and deadline.
4. Admission-control behavior if Redis or the DB slows down.
5. Metrics and an alert condition that reveal a stampede.

Test the design against one extremely hot expired key and 15,000 distinct cache misses.

---

## 15. Optional follow-up topic

**Load shedding versus backpressure** is the natural next topic. It explains how to protect a saturated dependency by rejecting work early, slowing producers where possible, and keeping queues bounded rather than converting overload into a total outage.

