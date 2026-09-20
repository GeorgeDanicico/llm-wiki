# Latency Averages and Percentiles

## Why an average is insufficient

In the supplied example, 95 of 100 requests take 20 ms and five take 1,000 ms, yielding a 69 ms average. That average conceals that five percent of users waited a second. An average describes aggregate cost; it does not reveal how the experience is distributed across requests. [Source](../../sources/notes/reliability/latencies-and-percentiles.md#why-averages-can-mislead)

## Reading the distribution

The source frames p50 as the median, p75/p90 as views of a broader portion of users, p95 as a customer-impact and SLO signal, and p99 as a view of severe tail latency. Read them together rather than treating one percentile as the entire experience. [Source](../../sources/notes/reliability/latencies-and-percentiles.md#what-percentiles-show)

For example, a stable p50 with rising p90 and p95 means the impact is spreading beyond the tail, even if p99 has barely moved. This is an interpretation supplied by the note; it identifies a change in observed latency distribution, not the cause of that change. [Source](../../sources/notes/reliability/latencies-and-percentiles.md#what-percentiles-show)

## Monitoring practice

Track absolute thresholds and trends. The note recommends p50 for the normal experience, p75–p95 for earlier broad drift, and p99 to investigate severe tail latency and outliers. A gradual p90 or p95 increase can therefore be useful before a problem becomes obvious in p99. [Source](../../sources/notes/reliability/latencies-and-percentiles.md#practical-monitoring)

**Synthesis:** Segment measurements by meaningful operation, route, dependency, and outcome where the observability design permits; percentiles alone do not identify whether queueing, a downstream dependency, database work, or application work caused the delay. [Related incident reasoning](service-resilience-and-observability.md#observability-model)

## Compounding page-load risk

If a page performs several independent API calls, even a small chance of a slow call can affect a large share of page loads. The source’s example assumes ten independent calls, each with a five-percent slow-call probability: the probability of at least one slow call is approximately `1 − 0.95¹⁰ ≈ 40%`. [Source](../../sources/notes/reliability/latencies-and-percentiles.md#practical-monitoring)

**Inference:** The independence assumption matters: the calculation is illustrative and does not apply unchanged when calls share a failing dependency or other common cause.

## Source status and related knowledge

This page synthesizes the supplied study note without independent external verification. It supports interpreting latency distributions but does not prescribe an aggregation method, measurement window, traffic segmentation, alert threshold, SLO, or root-cause diagnosis. It complements [Service resilience and observability](service-resilience-and-observability.md), which connects latency with traces, downstream measurements, queues, and resource saturation. No conflicting claim was found.
