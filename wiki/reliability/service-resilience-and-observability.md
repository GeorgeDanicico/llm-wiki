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

## Observability model

- Metrics expose trends, saturation, and alert conditions.
- Traces show where one request spent time.
- Structured logs explain a specific failure or state transition.

Correlate the signals with trace and span identifiers. Normalize metric routes and operations; avoid user IDs, raw URLs, and exception messages as unrestricted tags. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#91-the-three-primary-signals) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#92-http-metrics)

Instrument HTTP rate, errors, latency percentiles, and active requests; JVM CPU, memory, allocation, GC, and thread state; executor utilization, queue depth, and rejections; database pool acquisition and SQL duration; and downstream latency, timeout category, retry count, breaker state, and bulkhead rejection. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#93-jvm-and-executor-metrics)

Trace interpretation must separate queueing and resource acquisition from actual work. A long SQL span locates time but does not distinguish locks, I/O, CPU, or a poor plan without database evidence. Unexplained root-span self time can indicate application CPU, internal queueing, locks, serialization, or missing instrumentation. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#96-trace-interpretation)

## Health and incident reasoning

Temporary recovery does not prove a network fault. Distinguish DNS failures, connect timeouts, TLS negotiation, resets, read timeouts, server processing, and missing trace propagation from their specific evidence. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#98-do-not-infer-network-issue-from-temporary-recovery)

Liveness should answer whether restarting this process could help and should normally exclude external dependencies. Readiness decides whether the instance should receive traffic; adding dependencies requires considering whether removing every instance would be safer than degraded service. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#99-health-probes)
