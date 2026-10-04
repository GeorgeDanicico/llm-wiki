# Graceful Degradation Practices

## Coverage

A user-supplied note about rate limiting, request coalescing, load shedding, retry jitter, circuit breakers, timeouts, and monitoring and alerts.

## Ideas contributed to the wiki

- [Service resilience and observability](../../reliability/service-resilience-and-observability.md#graceful-degradation-controls)
- [Cache stampedes](../../reliability/cache-stampedes.md) — related material on single-flight request coalescing and retry jitter.
- [Token buckets and network bandwidth shaping](../../infrastructure/token-buckets-and-network-bandwidth-shaping.md) — a related traffic-control mechanism at the network layer.

## Source status

Captured on 2026-09-29 from a user conversation. Authorship and prior verification status were not supplied. The supplied thresholds (10 requests per minute and 60 seconds) are examples, not general defaults. The resilience page corrects the claims about retry jitter, circuit-breaker recovery, IP-only rate limits, operation prioritization, and alerting. The claims were checked against the linked Google SRE, IETF, AWS, Microsoft, and OpenTelemetry primary references. No conflicting wiki claims were found; concrete thresholds and fallback behavior remain service-specific.

Source: [captured graceful-degradation note](../../../sources/notes/reliability/graceful-degradation-practices.md)
