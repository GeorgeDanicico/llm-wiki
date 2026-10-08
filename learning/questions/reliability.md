# Reliability and operations

Review questions for the [Reliability and operations](../../wiki/reliability/index.md) topic.

## REL-GD-001 — How do rate limiting, request coalescing, and load shedding protect a service in different ways?

Source: [Service resilience and observability](../../wiki/reliability/service-resilience-and-observability.md#graceful-degradation-controls)

Expected points:

- Rate limiting caps request volume for a chosen identity, resource, or service over time; an IP-based example is not a universal policy or a full DDoS defense.
- Coalescing shares one in-flight operation among equivalent same-key callers.
- Load shedding rejects work when capacity is unsafe; graceful degradation can also reduce work or return a cheaper useful result.
- Prioritization decides which work to preserve and depends on business correctness and durability guarantees.
- 429 is for rate limiting; 503 can report temporary service overload.

## REL-GD-002 — What makes retry jitter useful, and what conditions must a retry policy satisfy?

Source: [Service resilience and observability](../../wiki/reliability/service-resilience-and-observability.md#retry-backoff-and-jitter)

Expected points:

- Randomized backoff spreads synchronized retries and reduces retry bursts.
- Retry only plausibly transient failures; cap attempts and elapsed time and observe the request deadline and retry budget.
- Do not retry a mutation unless it is safe to repeat, for example through idempotency.
- Avoid retrying independently at multiple layers; respect Retry-After when provided.
- Jitter helps distribute load but does not by itself guarantee service recovery.

## REL-GD-003 — How does a circuit breaker allow a dependency to recover without flooding it?

Source: [Service resilience and observability](../../wiki/reliability/service-resilience-and-observability.md#circuit-breakers)

Expected points:

- Closed state sends calls while tracking recent outcomes.
- A configured failure threshold opens the breaker and calls fail fast.
- After a recovery interval, half-open permits only limited probes.
- Success closes the breaker; failure reopens it.
- A timeout interval is configuration, not proof that the dependency is healthy or repaired.

## REL-GD-004 — What should an overload alerting setup measure, and what does OpenTelemetry provide?

Source: [Service resilience and observability](../../wiki/reliability/service-resilience-and-observability.md#monitoring-and-alerts)

Expected points:

- Monitor user-facing latency, traffic, and errors as well as resource saturation.
- Choose actionable thresholds tied to user impact or imminent capacity trouble.
- OpenTelemetry instruments and exports telemetry signals such as metrics, traces, and logs.
- A separate monitoring or alerting backend evaluates telemetry and routes notifications.
- Observability improves detection and diagnosis but cannot guarantee an alert precedes customer reports.

## REL-RES-001 — How do circuit breakers, bulkheads, and load shedding differ?

Source: [Service resilience and observability](../../wiki/reliability/service-resilience-and-observability.md)

Expected points:

- A circuit breaker fails fast when recent dependency outcomes indicate it is unhealthy.
- A bulkhead isolates concurrency or resource capacity between operations.
- Load shedding rejects work when safe local capacity is exhausted.
- The controls can work together and do not replace deadlines or idempotency.

## REL-CACHE-001 — Why does a longer TTL not by itself prevent a cache stampede?

Source: [Cache stampedes](../../wiki/reliability/cache-stampedes.md#failure-mode)

Expected points:

- A cache stampede is concurrent duplicate work after the same miss or expiration.
- A longer TTL can make that event less frequent.
- It does not coordinate the callers that arrive when the hot key eventually misses.
- TTL must meet the data freshness contract.

## REL-CACHE-002 — How do TTL jitter and single-flight address different cache failure modes?

Source: [Cache stampedes](../../wiki/reliability/cache-stampedes.md#complementary-controls)

Expected points:

- TTL jitter spreads the expiration of many independently keyed entries.
- Single-flight shares one in-flight load among callers for the same key.
- Jitter does not stop a hot key’s duplicate refreshes.
- Single-flight does not create backend capacity for many distinct misses.

## REL-CACHE-003 — What must protect a database during a Redis outage?

Source: [Cache stampedes](../../wiki/reliability/cache-stampedes.md#protecting-a-downstream-during-cache-failure)

Expected points:

- Treat every request as potential backend work rather than letting cache failure bypass limits.
- Bound database concurrency and retain only a finite queue.
- Shed work that exceeds the real residual database capacity.
- Use coordinated, bounded retries and stale data only when the policy permits it.

## REL-CACHE-004 — Which signals reveal that coalescing is effective and a stampede is occurring?

Source: [Cache stampedes](../../wiki/reliability/cache-stampedes.md#observability)

Expected points:

- Track in-flight cache loads, coalesced loads, leader duration, and waiter count.
- Monitor cache hit and miss behavior together with downstream QPS, pool pressure, latency, and errors.
- A rise in cache misses, database QPS, and database latency together is a strong stampede signal.

## REL-CA-001 — In cache-aside, who loads data into the cache on a miss, and why does that matter?

Source: [Cache-aside](../../wiki/reliability/cache-aside.md#pattern-and-responsibility)

Expected points:

- The application loads it: it reads the database, then writes the result to the cache.
- The cache is passive and never talks to the database.
- The application sending the `SET` is what distinguishes cache-aside from read-through caching.

## REL-CA-002 — What are the four steps of a cache-aside read?

Source: [Cache-aside](../../wiki/reliability/cache-aside.md#read-path)

Expected points:

- `GET` the key from the cache.
- On a hit, return the value without touching the database.
- On a miss, query the database.
- `SET` the result in the cache with a TTL, then return it.
- A miss means the key was never stored (cold cache or evicted) or has expired.

## REL-CA-003 — Does a plain Redis `GET` hit reset a cached key's TTL, and what does that imply about staleness?

Source: [Cache-aside](../../wiki/reliability/cache-aside.md#ttl-semantics)

Expected points:

- No; the TTL countdown starts when the key is written.
- The TTL is therefore an upper bound on how stale a cached value can be.
- In the worked trace with a five-minute TTL, a key written at 10:00:00 misses again at 10:06:00 even though it was hit at 10:00:10.

## REL-CA-004 — What is the main trade-off when choosing a cache-aside TTL, and what data should not be served from the cache?

Source: [Cache-aside](../../wiki/reliability/cache-aside.md#freshness-versus-database-load)

Expected points:

- Freshness versus database load: a short TTL gives fresher data but more misses; a long TTL gives fewer reads but staler data.
- The TTL is how stale you can afford to be.
- Cache rarely changing data, such as product descriptions, with a long TTL.
- Do not serve decision-critical data, such as stock at checkout, from the cache; at most cache a display value with a very short TTL.

## REL-CA-005 — A user renamed their profile but the old name was served for about an hour. Why, and what are the fixes?

Source: [Cache-aside](../../wiki/reliability/cache-aside.md#freshness-versus-database-load)

Expected points:

- The value was cached before the update and nothing evicted it, so it was served until the TTL expired.
- Evicting the key on update fixes it but has its own race conditions.
- A shorter TTL reduces the stale window but increases database load.

## REL-CA-006 — Name two common cache-aside mistakes and their consequences.

Source: [Cache-aside](../../wiki/reliability/cache-aside.md#common-mistakes)

Expected points:

- No TTL: keys live until evicted, so changed data can stay stale indefinitely.
- Not caching "not found": lookups for missing IDs miss the cache and hit the database every time.

## REL-CA-007 — What happens to cache-aside reads when the cache server goes down?

Source: [Cache-aside](../../wiki/reliability/cache-aside.md#cache-failure)

Expected points:

- Reads fall through to the database, but only if the code treats cache errors as misses (catching exceptions, short timeouts).
- The database then takes the full load, the same risk as a cache stampede.

## REL-RT-001 — In read-through caching, who calls the database on a miss, and how does the cache know how to load?

Source: [Read-through caching](../../wiki/reliability/read-through-caching.md#pattern-and-responsibility)

Expected points:

- The cache itself calls the database, not the application call site.
- It invokes a loader, a `key → value` function registered when the cache was built.
- The caller only calls `get(key)` and never sees a miss.

## REL-RT-002 — What is the core difference between cache-aside and read-through, and what does not change?

Source: [Read-through caching](../../wiki/reliability/read-through-caching.md#what-stays-the-same-as-cache-aside)

Expected points:

- The difference is where the loading logic lives: repeated at every call site in cache-aside, written once in the cache's loader in read-through.
- The loading code is moved, not removed; the service still calls `cache.get(key)`.
- Cold misses still hit the database, staleness is still bounded by the TTL, and writes still need explicit invalidation.

## REL-RT-003 — A read-through user-profile cache shows an old display name for up to its TTL after an update. Why, and what is the fix?

Source: [Read-through caching](../../wiki/reliability/read-through-caching.md#writes-and-invalidation)

Expected points:

- Read-through covers only the read path; the update wrote the database without touching the cache.
- The cached value stays until the TTL expires; eviction policies remove entries only eventually.
- Call `cache.invalidate(id)` in the write path after saving, so the next `get` reloads the fresh value.

## REL-RT-004 — Why can't a plain Redis server act as a read-through cache by itself?

Source: [Read-through caching](../../wiki/reliability/read-through-caching.md#where-read-through-needs-a-loader-capable-layer)

Expected points:

- Redis has no loader hook: no query code and no database credentials, so a miss just returns nothing.
- Read-through on Redis needs an application-side layer that owns the loader, such as Redisson `MapLoader`.
- The pattern is about who owns the loading logic from the business code's point of view, not which process runs the query.

## REL-RT-005 — Name the main limitation of read-through caching and one access pattern that fits it poorly.

Source: [Read-through caching](../../wiki/reliability/read-through-caching.md#trade-off-centralisation-costs-flexibility)

Expected points:

- One loader per cache means one way to load a key: centralisation costs flexibility.
- Poor fits: callers that must bypass the cache for fresh data, multi-criteria lookups such as search filters or pagination.
- Database failures and latency surface from a `cache.get()` that looks cheap at the call site.

## REL-TO-001 — Name the four separate waits in an outbound HTTP call and the setting that bounds each.

Source: [Connection versus request timeouts](../../wiki/reliability/connection-versus-request-timeouts.md#separate-waits-separate-settings)

Expected points:

- Pool acquisition: waiting for the caller's own pool, bounded by e.g. Apache HttpClient `connectionRequestTimeout`.
- Connect: establishing the connection (TCP, and TLS on some clients), bounded by `connectTimeout`.
- Read/socket: the silence between reads, bounded by `readTimeout` or `SO_TIMEOUT`.
- Request/overall: the whole response from the start, bounded by e.g. JDK `HttpRequest.timeout(...)`; a wait with no setting can last forever.

## REL-TO-002 — A dependency accepts connections and then goes silent. Why doesn't a 2 s connect timeout help?

Source: [Connection versus request timeouts](../../wiki/reliability/connection-versus-request-timeouts.md#separate-waits-separate-settings)

Expected points:

- The connection was established, so the connect timeout has already done its job and never fires again for that call.
- The stuck wait is reading the response, which needs a read or overall timeout.

## REL-TO-003 — Why can a 5 s read timeout fail to stop a call that lasts ten minutes?

Source: [Connection versus request timeouts](../../wiki/reliability/connection-versus-request-timeouts.md#read-timeouts-are-not-total-caps)

Expected points:

- A read timeout bounds the gap between bytes, and each arriving byte resets the clock.
- A server that trickles data (for example one byte every 4 s) never trips it.
- Only an overall/request timeout caps the total elapsed time.

## REL-TO-004 — A pool of 20 connections, a slow dependency (p99 1.8 s, read timeout 2 s), all 200 threads busy, almost no timeout errors. What is happening and what do you change first?

Source: [Connection versus request timeouts](../../wiki/reliability/connection-versus-request-timeouts.md#pool-acquisition-the-forgotten-wait)

Expected points:

- Threads are queued on acquiring a connection from the caller's own pool and never touch the network.
- The slow calls stay under the read timeout, and connect/read timeouts have not started for queued requests, so nothing fires.
- Set a pool-acquisition timeout such as `connectionRequestTimeout` to about 1 s or less so overload fails visibly.

## REL-TO-005 — What goes wrong with a connect timeout that is too high, and with one that is too low?

Source: [Connection versus request timeouts](../../wiki/reliability/connection-versus-request-timeouts.md#trade-off-too-tight-versus-too-loose)

Expected points:

- Too high (e.g. 30 s in one region): every call to a dead host holds a thread for the full timeout, risking thread-pool exhaustion.
- Too low (e.g. 100 ms or less): ordinary SYN loss causes needless failures, which can trigger retry storms.
- A few hundred milliseconds to about one second is a common same-region range.

## REL-LAT-001 — Why can an average latency hide a poor user experience?

Source: [Latency averages and percentiles](../../wiki/reliability/latency-averages-and-percentiles.md#why-an-average-is-insufficient)

Expected points:

- An average combines fast and slow requests into one aggregate number.
- A small fraction of very slow requests can be obscured by many fast ones.
- Percentiles show how latency is distributed across request groups.

## REL-LAT-002 — What does a stable p50 with rising p90 and p95 indicate?

Source: [Latency averages and percentiles](../../wiki/reliability/latency-averages-and-percentiles.md#reading-the-distribution)

Expected points:

- Typical requests can remain stable while a broader group is slowing down.
- The change is evidence of a worsening observed latency distribution, not proof of its cause.
- Inspect traces, queues, dependencies, and resource metrics to identify the cause.

## REL-LAT-003 — How can a small slow-call rate affect many page loads?

Source: [Latency averages and percentiles](../../wiki/reliability/latency-averages-and-percentiles.md#compounding-page-load-risk)

Expected points:

- Multiple independent calls give each page load multiple chances to include a slow call.
- With ten independent calls at five-percent slow probability, at least one is slow about 40% of the time.
- Shared dependencies can invalidate the independence assumption, so the calculation is illustrative.
