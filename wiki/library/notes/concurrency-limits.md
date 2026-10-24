# 137. Concurrency limits — learning session

## Coverage

A user-supplied learning-session summary on concurrency limits: counting in-flight requests rather than arrivals, Little's Law, choosing the limit from the scarcest per-request resource, bounded waiting and fast 503 rejection, a `Semaphore` permit leak in a Spring controller, per-instance limits against a shared database budget, static versus adaptive limits, check-in answers, and further reading.

## Ideas contributed to the wiki

- [Concurrency limits](../../reliability/concurrency-limits.md)
- [Service resilience and observability](../../reliability/service-resilience-and-observability.md#resilience-controls) (link to the detailed page)

## Source status

Captured on 2026-10-24 from a local learning-session file (topic 137, area 07. Resilience and overload control). The ingestion preserves the summary's wording. No documentation was fetched during the session; the Netflix `concurrency-limits` and Resilience4j Bulkhead remarks and the reading list are from memory and unverified. Numeric limits are illustrative. The "Next up" section (topics 138 and 122) is study planning, not knowledge, and was not synthesized. No conflicting wiki claims were identified.

Source: [captured concurrency-limits learning session](../../../sources/notes/reliability/concurrency-limits-learning-session.md)
