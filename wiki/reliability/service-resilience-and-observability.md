# Service Resilience and Observability

## Resilience controls

An end-to-end deadline should allocate time across connection acquisition, connection establishment, TLS, response reading, retries, and remaining application work. Long timeouts retain threads, connections, and memory; each downstream attempt must leave enough time for a controlled caller response. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#81-timeouts-and-deadlines)

Retries multiply traffic: two retries plus the initial attempt can produce three downstream requests. Retry bounded transient failures with backoff and jitter, cap attempts and elapsed time, respect retry budgets, and assign retry responsibility to one layer. A non-idempotent mutation is not safely retryable merely because a timeout occurred. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#82-retries) [Cache-load retry coordination](../../sources/notes/reliability/cache-stampede-study-notes.md#4-failed-loads-retries-and-stale-while-revalidate)

| Control | Purpose |
| --- | --- |
| Circuit breaker | Fail fast when recent dependency outcomes cross an unhealthy threshold |
| Bulkhead | Isolate concurrency, queues, pools, or executors between operations |
| Load shedding | Reject excess work before local queues and latency cause collapse |
| Idempotency | Make repeated attempts converge on one intended business effect |

A circuit breaker is a caller-side state decision, not a physical disconnection. Autoscaling is not a bulkhead and can worsen a downstream outage. An idempotency claim must be atomic—use a unique constraint, conditional insert, or transactional transition rather than check-then-insert. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#83-circuit-breaker) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#86-idempotency)

Under a cache outage or a cache-miss storm, bound database concurrency, keep any waiting queue finite, and shed work beyond the safe residual backend capacity. The cache-stampede study note treats `503 Service Unavailable` with `Retry-After` as appropriate for temporary capacity loss and `429 Too Many Requests` as appropriate for deliberate client/request limiting; those response choices must still fit the service contract. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#9-redis-outage-and-load-shedding) See also [Cache stampedes](cache-stampedes.md).

## Graceful degradation controls

Graceful degradation reduces work or serves a cheaper, lower-fidelity result while preserving useful service. Load shedding is the related choice to reject work before overload causes the whole service to fail. The appropriate action depends on the service's capacity signals and user-facing guarantees; it can include serving cached data, skipping optional computation, prioritizing work, or rejecting requests. [Google SRE: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)

### Rate limiting

Rate limiting caps demand over a defined interval. A limit such as 10 requests per minute per IP is only an example, not a universal default. IP-only limits can group many legitimate users behind one address and can be evaded by clients using many addresses. A limiter can key on a user or API credential, endpoint, resource, or aggregate service capacity; choose the key and limit to fit the abuse and capacity model. A rate limit is not a complete DDoS defense, and a fixed per-client limit may not react to current service health. Use upstream network or edge protection for attack traffic and overload-aware admission or shedding inside the service. HTTP 429 means the requester exceeded a rate limit; its response may include Retry-After. HTTP 503 is commonly used when the service cannot handle work temporarily. [RFC 6585, section 4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) [Google SRE: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)

### Request coalescing

For equivalent concurrent work on the same key, single-flight coalescing runs one in-flight operation and lets the other callers share its result. This is useful for a hot cache miss or refresh. It does not automatically coordinate callers across application instances, and it is safe only when those calls are interchangeable; bound waiter time and count, and avoid turning one failed leader into many independent retries. [Source](../../sources/notes/reliability/cache-stampede-study-notes.md#2-single-flight--request-coalescing) See also [Cache stampedes](cache-stampedes.md).

### Load shedding and prioritization

Load shedding rejects or drops work that cannot safely be completed within available capacity; graceful degradation can instead reduce the work needed for a useful response. Preferentially serving one operation over another is prioritization, which can be combined with shedding. Whether analytics clicks are expendable, or whether a payment can be accepted or must fail explicitly, depends on the product's correctness and durability guarantees. Do not silently lose a business action merely because it is lower priority. The example of preserving payments while dropping clicks is a possible policy, not a general rule. [Google SRE: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/) [Payment idempotency and double-charge prevention](../distributed-systems/payment-idempotency-and-double-charge-prevention.md)

### Retry backoff and jitter

For retries, use bounded exponential backoff with randomized jitter: after a plausibly transient failure, clients spread their next attempts over time. This reduces retry bursts; a random delay by itself does not guarantee recovery or prevent a crash. Limit attempts and elapsed time, use an overall deadline and retry budget, and retry a mutation only when its outcome is safe to repeat, usually through idempotency. When an overload response supplies Retry-After, respect it. Avoid retries at multiple layers, which multiply downstream work. [AWS Architecture Blog: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) [Google SRE: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/) [Retries and idempotency](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#82-retries)

### Circuit breakers

A circuit breaker does not usually remain shut out until someone confirms that a dependency is healthy. It tracks recent outcomes, opens after a configured failure threshold and rejects calls quickly, then permits a limited number of probes in a half-open state after a recovery interval. Successful probes close it; failures reopen it. The threshold and interval, such as 60 seconds, are service-specific. A circuit breaker limits repeated calls to a failing dependency; it does not repair that dependency. [Microsoft Azure Architecture Center: Circuit Breaker](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)

### Timeouts and deadlines

Set bounded timeouts for individual network stages and an end-to-end deadline for the whole request, then propagate the remaining budget to downstream work. This limits how long callers and resources wait and avoids continuing work after the caller can no longer use the result. A caller timeout does not prove the remote operation stopped or failed: a mutation may have completed even if its response was lost. Use idempotency and reconciliation for operations with side effects. [Google SRE: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#81-timeouts-and-deadlines)

### Monitoring and alerts

OpenTelemetry can instrument and export metrics, traces, and logs; it is not itself an alerting or storage backend. An alerting system evaluates the telemetry and routes actionable notifications. Track user-facing latency, traffic, and errors alongside saturation signals such as CPU, memory, queue depth, and in-flight work. Use service objectives and thresholds that indicate meaningful user impact or imminent capacity trouble rather than paging on every metric crossing. An observability stack can shorten detection and diagnosis; it cannot guarantee that operators are notified before a customer. [OpenTelemetry: What is OpenTelemetry?](https://opentelemetry.io/docs/what-is-opentelemetry/) [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)

The submitted note is preserved in the [Graceful Degradation Practices source](../../sources/notes/reliability/graceful-degradation-practices.md). Its numeric values are illustrative; rate-limit keys, retry policy, breaker thresholds, deadlines, degradation choices, and alerts need to be selected for the particular system.

## Observability model

- Metrics expose trends, saturation, and alert conditions.
- Traces show where one request spent time.
- Structured logs explain a specific failure or state transition.

Correlate the signals with trace and span identifiers. Normalize metric routes and operations; avoid user IDs, raw URLs, and exception messages as unrestricted tags. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#91-the-three-primary-signals) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#92-http-metrics)

Instrument HTTP rate, errors, latency percentiles, and active requests; JVM CPU, memory, allocation, GC, and thread state; executor utilization, queue depth, and rejections; database pool acquisition and SQL duration; and downstream latency, timeout category, retry count, breaker state, and bulkhead rejection. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#93-jvm-and-executor-metrics)

An average can conceal a small but impactful set of slow requests, so track latency distributions as well as aggregate cost. Read p50 through p99 together and alert on both thresholds and trends; a rising p90 or p95 with a stable p50 can show that latency is worsening for more users before the p99 signal is obvious. [Source](../../sources/notes/reliability/latencies-and-percentiles.md#why-averages-can-mislead) [Source](../../sources/notes/reliability/latencies-and-percentiles.md#practical-monitoring) See also [Latency averages and percentiles](latency-averages-and-percentiles.md).

Trace interpretation must separate queueing and resource acquisition from actual work. A long SQL span locates time but does not distinguish locks, I/O, CPU, or a poor plan without database evidence. Unexplained root-span self time can indicate application CPU, internal queueing, locks, serialization, or missing instrumentation. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#96-trace-interpretation)

## Health and incident reasoning

Temporary recovery does not prove a network fault. Distinguish DNS failures, connect timeouts, TLS negotiation, resets, read timeouts, server processing, and missing trace propagation from their specific evidence. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#98-do-not-infer-network-issue-from-temporary-recovery)

Liveness should answer whether restarting this process could help and should normally exclude external dependencies. Readiness decides whether the instance should receive traffic; adding dependencies requires considering whether removing every instance would be safer than degraded service. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#99-health-probes)
