# Capture metadata

- Title: Latencies: Averages and Percentiles
- Captured: 2026-09-20
- Source type: User-supplied study note
- Origin: Local ChatGPT project file `latencies-and-percentiles.md`
- Provenance note: Authorship and independent verification status were not supplied.

---

# Latencies: Averages and Percentiles

## Why averages can mislead

Suppose 100 requests have these latencies:

- 95 requests take 20 ms
- 5 requests take 1,000 ms

The average is:

```text
(95 × 20 + 5 × 1,000) / 100 = 69 ms
```

The average looks fast, but 5% of users waited one second. Averages can hide slow requests in the tail.

## What percentiles show

- **p50**: the median; about half of requests are faster and half are slower.
- **p75/p90**: show how latency is changing for a broader group of users.
- **p95**: a useful customer-impact and SLO signal.
- **p99**: the latency threshold for roughly 99% of requests; it exposes the slowest 1%.

Percentiles describe the shape of latency. For example, if p50 stays at 40 ms but p90 rises from 100 ms to 160 ms and p95 rises from 180 ms to 300 ms, performance is degrading for more users even if p99 barely changes.

## Practical monitoring

Track several percentiles together:

- Use **p50** to understand the normal experience.
- Use **p75–p95** to detect broad performance drift early.
- Use **p99** to investigate severe tail latency and outliers.

Also watch both absolute thresholds and trends. A gradual rise in p90 or p95 can provide an early warning before the problem becomes obvious in p99.

If a page makes multiple API calls, a small slow-request percentage can affect many page loads. With ten independent calls and a 5% chance of a slow call each time, the chance of at least one slow call is approximately:

```text
1 − 0.95¹⁰ ≈ 40%
```

The main lesson: **the average shows overall cost, while percentiles reveal what different groups of users experience.**
