# 121. Connection versus request timeouts — learning session

## Coverage

A user-supplied learning-session summary on HTTP client timeouts: the separate waits in an outbound call (pool acquisition, connect, read, overall), why a read timeout is not a total cap, a JDK `HttpClient` worked example, the forgotten pool-acquisition wait, the too-tight-versus-too-loose trade-off, check-in answers, and further reading.

## Ideas contributed to the wiki

- [Connection versus request timeouts](../../reliability/connection-versus-request-timeouts.md)
- [Service resilience and observability](../../reliability/service-resilience-and-observability.md#timeouts-and-deadlines) (link to the per-stage detail)

## Source status

Captured on 2026-10-08 from a local learning-session file (topic 121, area 07. Resilience and overload control). The ingestion preserves the summary's wording. The JDK `HttpRequest.Builder.timeout` semantics were fetched during the session; the Linux SYN-retry timings and the Google SRE reference are from memory and unverified. Numeric timeout values are illustrative. The session's "Next up" plan (deadline propagation) is study planning, not knowledge, and was not synthesized. No conflicting wiki claims were identified.

Source: [captured connection-versus-request-timeouts learning session](../../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md)
