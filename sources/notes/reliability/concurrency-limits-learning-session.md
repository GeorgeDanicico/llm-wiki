# Capture metadata

- Title: 137. Concurrency limits — learning session
- Captured: 2026-10-24
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/learning-sessions/2026-10-24-137-concurrency-limits.md` (20-minute software-engineering learning session, area 07. Resilience and overload control)
- Provenance note: Generated as a learning-session summary by an AI tutor. No external documentation was fetched during the session; the Netflix `concurrency-limits` and "Performance Under Load" references, the Resilience4j Bulkhead remarks (`maxConcurrentCalls`, `maxWaitDuration`, automatic release), and the reading list were stated from memory and are unverified. Numeric limits, sizes, and durations are illustrative.

---

# 137. Concurrency limits
Date: 2026-10-24 · Area: 07. Resilience and overload control · Status: done

## Lesson boundary
Protect an expensive endpoint by bounding in-flight work.

## Key ideas
- A concurrency limit caps requests **running right now**; a rate limit caps **starts per time unit**. A slot frees only when a request finishes (or fails / times out).
- Little's Law: in-flight = arrival rate × latency. Under a rate limit, rising latency makes in-flight work grow unbounded; a concurrency limit self-adjusts — new work enters only as fast as old work completes.
- Choose N from the scarcest per-request resource (heap, DB connections, CPU cores): N = the minimum across them. Max throughput ≈ N ÷ request duration.
- Request N+1: short bounded wait (≈100–500 ms), then fail fast with 503 (+ `Retry-After`), or 429 for a per-caller quota. Never an unbounded wait.
- Limits are per instance: with a shared resource, per-pod N = shared budget ÷ pod count, and must change when the pod count changes.

## Worked example
`POST /reports/generate` — ~300 MB heap, 1 DB connection, ~4 s each. N = 8 → ≈ 2 reports/s.

```java
if (!permits.tryAcquire(200, MILLISECONDS)) return tooBusy(); // 503 + Retry-After
try {
    return ResponseEntity.ok(reports.generate(req));
} finally {
    permits.release();
}
```

Bug in the original version: `release()` after `generate()` without `finally`. Each exception leaks a permit; after N failures the endpoint returns 503 forever, even after the DB recovers, until restart.

## Trade-off / common mistake
- Static N is a guess: too high protects nothing, too low rejects work the server could handle. Netflix's `concurrency-limits` adapts N from observed latency (TCP-congestion-style).
- Scenario: 6 pods × N=8 = 48 concurrent against a 24-connection DB budget (already over). Scaling to 12 pods → N = 2 per pod; scaling out then adds **no** report capacity (still ~24 concurrent ≈ 6 reports/s), and uneven load balancing causes 503s on busy pods while others idle. Watch the 503 rate.

## Flashcards
- Q: Why can a 10 req/s rate limit still blow up memory? / A: It caps arrivals, not duration; in-flight = rate × latency grows when latency rises.
- Q: How do you pick N? / A: Smallest limit among per-request scarce resources; divide shared budgets by instance count.
- Q: Two hand-rolled limiter bugs? / A: No `release()` in `finally` (permit leak → permanent 503); unbounded wait (overload moves into a queue).
- Q: What does request N+1 get? / A: A short bounded wait, then 503 with `Retry-After`.

## Your check-in answers
- Q1 Explain concurrency vs rate limit for slow endpoints → ✅ in-flight vs starts; latency growth captured.
- Q2 N for PDF render (500 MB/4 GB heap, 1 core/3 cores, 2 s) → 🟡 picked heap headroom (5–6) but missed CPU binds at 3; throughput 1.5/s and 503 on overflow. Recheck (DB 10 vs heap 5): identified heap as binding, but chose 2–3 — too cautious; budget already excludes headroom, so N = 4–5.
- Q3 Spot the mistake → ✅ unbounded wait for a permit.

## Seen in the wild
- Netflix — open-sourced `concurrency-limits` (Java) to adapt server/client concurrency limits from latency instead of hand-tuned constants.
- Resilience4j — semaphore `Bulkhead` (`maxConcurrentCalls`, `maxWaitDuration`) bounds concurrent calls and handles release for you.

## Learn more
- Netflix Tech Blog — "Performance Under Load" (from memory) — the motivation for adaptive concurrency limits.
- GitHub — `Netflix/concurrency-limits` (from memory) — the library and its limit algorithms.
- Resilience4j documentation — "Bulkhead" (from memory) — semaphore vs thread-pool bulkhead configuration.
- Java SE docs — `java.util.concurrent.Semaphore` — `tryAcquire(timeout)` semantics.

## Next up
- 138. Graceful degradation — choose a fallback that preserves essential functionality (no prerequisite redirect).
- Still open earlier in the area: 122. Deadline propagation.
- Revisit on review: picking N as the minimum across *all* resources (CPU was missed once).
