# Distributed Systems

Knowledge about distributed coordination, data processing, stream-processing semantics, and safe external side effects.

- [Event time and processing time](event-time-and-processing-time.md) — why occurrence time and observation time can diverge.
- [Stream windows](stream-windows.md) — tumbling, hopping, sliding, and session windows.
- [Stream joins](stream-joins.md) — stream–stream correlation and stream–table enrichment.
- [Time-dependent stream joins](time-dependent-stream-joins.md) — out-of-order events and changing reference data.
- [Stream-processing fault tolerance](stream-processing-fault-tolerance.md) — why recovery differs between bounded batch input and continuous streams.
- [Kafka consumer progress and durability](kafka-consumer-progress-and-durability.md) — how committed offsets, rebalancing, acknowledgement modes, ISR policy, and idempotence combine into end-to-end behavior.
- [Payment idempotency and double-charge prevention](payment-idempotency-and-double-charge-prevention.md) — how order-scoped attempts, atomic claims, stable provider keys, and reconciliation make duplicate requests converge safely.

Sources: [personal Chapter 11 book notes](../../sources/books/designing-data-intensive-applications.md), [Kafka consumers and durability article](../../sources/articles/kafka-consumers-and-durability.md), and [payment-idempotency design summary](../../sources/designs/payment-idempotency-design-summary.md)
