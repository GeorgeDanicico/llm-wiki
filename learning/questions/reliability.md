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
