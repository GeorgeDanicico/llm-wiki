# Stream Joins

## Stream–stream joins

A stream–stream join correlates events from two streams according to shared criteria. Because both sides change continuously, a system normally needs a bounded correlation rule—often involving keys and time—to decide which events can match and how long unmatched state must be retained.

## Stream–table joins

A stream–table join enriches each event with reference data from a table. A remote database lookup can add network latency to event processing. The source notes suggest reducing that cost by keeping a local indexed snapshot, or an in-memory map when the reference data is small enough.

## Trade-offs to check

- Freshness of reference data versus lookup latency.
- Memory or local-disk cost versus repeated network calls.
- What happens when reference data is missing or changes during replay.
- Whether event ordering and the join's time semantics are explicit.

Source: [personal notes on Chapter 11 of *Designing Data-Intensive Applications*](../../sources/books/designing-data-intensive-applications.md#stream-joins)

