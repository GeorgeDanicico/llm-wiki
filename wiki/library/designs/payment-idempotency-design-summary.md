# Payment Idempotency Design Summary

## Coverage

This design summary addresses double-charge prevention when one logical payment can be requested repeatedly or concurrently. It covers order-scoped invariants, atomic database claims, attempt generations, asynchronous queue processing, provider idempotency, ambiguous outcomes, and reconciliation.

## Ideas contributed to the wiki

- [Payment idempotency and double-charge prevention](../../distributed-systems/payment-idempotency-and-double-charge-prevention.md)
- [Stream-processing fault tolerance](../../distributed-systems/stream-processing-fault-tolerance.md), especially the boundary between internal processing guarantees and external side effects

## Source status

This is an unverified architecture proposal supplied on 2026-08-17. The wiki records its recommendations and reasoning; it does not establish that a particular database, queue, or payment provider implements the assumed guarantees. Provider-specific idempotency behavior, retention periods, and failure semantics still require verification before implementation.

Source: [original payment-idempotency design summary](../../../sources/designs/payment-idempotency-design-summary.md)

