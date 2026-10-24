# Concurrency Limits

## What a concurrency limit counts

A concurrency limit caps how many requests to an endpoint are running at the same moment. A rate limit caps how many requests start per unit of time. Under a concurrency limit a slot frees only when a request finishes, fails, or times out, so new work can enter only as fast as old work completes. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#key-ideas)

The session used Little's Law to show why the difference matters for slow, expensive work: in-flight requests ≈ arrival rate × time in the system. At 10 requests per second and 4 seconds per request, about 40 requests are in flight. If latency rises to 20 seconds, the same 10 requests per second means about 200 in flight. A rate limiter still sees 10 requests per second and does not stop it, while a concurrency limit admits fewer new requests exactly when requests slow down. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#key-ideas) [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#flashcards)

## Choosing the limit

Derive N from the scarcest resource each request holds, not from traffic. Compute a limit for each resource and take the smallest. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#key-ideas)

| Constraint per request | Budget | Limit from that resource |
| --- | --- | --- |
| About 300 MB of heap | About 3 GB spare heap | About 10 |
| 1 database connection | Pool share for this endpoint | About 8 |
| CPU-bound work | 4 cores | About 4 to 6 |

The numbers are the session's illustrative example. Maximum throughput is roughly N divided by the request duration: 8 slots at 4 seconds each give about 2 requests per second. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#key-ideas) [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#worked-example)

A limit that is too low is also a failure mode: it rejects work the server could have handled. When the budget already excludes headroom for the rest of the application, extra caution on top of it wastes capacity. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#your-check-in-answers)

## Handling the request over the limit

The request that finds no free slot should wait only briefly (the session suggested roughly 100 to 500 ms) and then fail fast, with `503 Service Unavailable` and a `Retry-After` header, or `429 Too Many Requests` when the limit is a per-caller quota. An unbounded wait moves the overload into a queue of blocked threads: memory and threads stay held, callers time out upstream, and the work may still run later for nobody. Raising the limit for one more request, or running the request outside the limiter, removes the protection. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#key-ideas) [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#your-check-in-answers)

This matches the 503-versus-429 guidance already recorded in [Service resilience and observability](service-resilience-and-observability.md#resilience-controls).

## Worked example

A report endpoint uses a `java.util.concurrent.Semaphore` with eight permits. The permit must be released in `finally`, and only after a successful acquire:

```java
if (!permits.tryAcquire(200, MILLISECONDS)) return tooBusy(); // 503 + Retry-After
try {
    return ResponseEntity.ok(reports.generate(req));
} finally {
    permits.release();
}
```

The session's buggy version called `release()` after `generate()` without `finally`. Each exception leaked one permit. After eight failures during a database incident, the endpoint returned 503 for every request, even after the database recovered, until the instance restarted. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#worked-example)

The session described Resilience4j's semaphore `Bulkhead` (`maxConcurrentCalls`, `maxWaitDuration`) as a wrapper that handles the release for you; this was stated from memory and is **unverified**. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#seen-in-the-wild)

## Limits are per instance

A limit held in one process bounds only that process. When instances share a scarce resource, the per-instance limit must be the shared budget divided by the instance count, and it must change when the instance count changes. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#key-ideas)

In the session's scenario, 6 pods with N = 8 allowed 48 concurrent reports against a 24-connection database budget, which was already over budget. Scaling to 12 pods requires N = 2 per pod. Scaling out then adds no report capacity: the cluster still runs about 24 reports at once, about 6 per second at 4 seconds each. Small per-pod limits combined with uneven load balancing can reject requests on a busy pod while another is idle, so the 503 rate needs watching. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#trade-off--common-mistake)

This agrees with the existing wiki claim that autoscaling is not a bulkhead and can worsen a downstream outage. [Related](service-resilience-and-observability.md#resilience-controls)

## Static versus adaptive limits

A static N is a guess. Too high and it protects nothing; too low and it rejects work the server could handle. The right value also drifts as dependencies, hardware, and payload sizes change. The session said Netflix open-sourced a Java library, `concurrency-limits`, that adjusts the limit from observed latency in a way similar to TCP congestion control; this is from memory and **unverified**. [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#trade-off--common-mistake) [Source](../../sources/notes/reliability/concurrency-limits-learning-session.md#seen-in-the-wild)

## Source status and related knowledge

This page synthesizes one learning-session summary written by an AI tutor. The session fetched no documentation; the Netflix and Resilience4j remarks and the reading list are from memory and **unverified**, and all numbers are illustrative. No conflicting wiki claims were found. Related pages: [Service resilience and observability](service-resilience-and-observability.md), which lists bulkheads and load shedding as resilience controls, [Connection versus request timeouts](connection-versus-request-timeouts.md), and [Cache stampedes](cache-stampedes.md), which also recommends bounding database concurrency.

Sources: [captured concurrency-limits learning session](../../sources/notes/reliability/concurrency-limits-learning-session.md), library entry [137. Concurrency limits — learning session](../library/notes/concurrency-limits.md)
