# Payment Idempotency and Double-Charge Prevention

## Use case and invariant

A single logical payment may arrive repeatedly or concurrently after UI crashes, network retries, queue redelivery, or requests from multiple devices. A client idempotency key cannot identify all duplicates because separate clients may generate different keys for the same order.

The durable invariant should therefore be attached to the business obligation, such as `order_id` or `invoice_id`, rather than to the user or an individual request:

> For one order, permit at most one active payment generation, and make every duplicate request converge on that generation's stable attempt and result.

Scoping the invariant to a user would be too broad because one user may legitimately pay multiple orders concurrently. Scoping it only to a client key would be too narrow because the same order may be submitted with different keys.

Source: [payment-idempotency design summary](../../sources/designs/payment-idempotency-design-summary.md#core-principle)

## Payment generations

Each generation is one logical attempt and should have:

- a server-created `paymentAttemptId`;
- a generation number;
- a stable provider idempotency key derived from stable business identity, for example `merchant-42:order-123:generation-1`;
- canonical amount and currency copied from trusted order data;
- provider payment ID, version, and timestamps;
- a durable workflow status.

A new generation is appropriate only after the prior generation is known to have failed and a new charge is genuinely intended. A timeout or uncertain result is not a confirmed failure and must not create a new generation. Reusing an attempt with a different amount or currency must be rejected.

Source: [suggested data model](../../sources/designs/payment-idempotency-design-summary.md#suggested-data-model) and [provider idempotency](../../sources/designs/payment-idempotency-design-summary.md#provider-idempotency)

## State machine and the ambiguity barrier

```text
requested -> submitting -> succeeded
                        -> failed
                        -> unknown
```

`unknown` is a safety state: the provider may have charged the customer even though the local system did not record a final result. While a generation is `unknown`, the order must not begin another generation. Webhooks, provider lookup, or scheduled reconciliation must first establish the outcome.

The terminal-looking label `failed` must mean confirmed failure, not merely a local timeout. Otherwise retry logic can convert an ambiguous first charge into a definite second charge.

Source: [suggested states](../../sources/designs/payment-idempotency-design-summary.md#suggested-data-model) and [recovery and reconciliation](../../sources/designs/payment-idempotency-design-summary.md#recovery-and-reconciliation)

## Where serialization belongs

Creating or claiming the active generation must be one atomic database decision. Suitable mechanisms include a conditional write, compare-and-set, transaction, or uniqueness constraint that enforces the one-active-generation-per-order invariant. A status field without atomic enforcement leaves a check-then-act race.

For example, if phone and desktop requests race:

1. Both identify the same `order_id`.
2. Only one conditional write creates the active generation.
3. The losing request reads and returns the existing attempt and current status.

Asynchronous multi-leader replication is unsafe for this decision when separate leaders can both observe “unpaid” and call the provider. A later database conflict resolution cannot undo two external charges. Payment initiation needs one serialization point per order: a logical writer, a sufficiently strong database, an owning shard leader, a strongly consistent coordination record, or equivalent ordered ownership. Under partition, delaying or rejecting the payment preserves the invariant more safely than allowing independent writers.

Source: [atomic payment claim](../../sources/designs/payment-idempotency-design-summary.md#atomic-payment-claim) and [multiple databases and leaders](../../sources/designs/payment-idempotency-design-summary.md#multiple-databases-and-leaders)

## Safe asynchronous processing

The proposed flow is:

```text
Client -> Payment API -> atomic workflow write -> Kafka -> worker -> provider
```

Messages use `order_id` as their partition key so work for one order is ordered. The worker still has to tolerate redelivery:

1. Read the recorded attempt.
2. Atomically claim it or advance its state.
3. Call the provider with the generation's unchanged provider idempotency key.
4. Durably save the provider ID and `succeeded`, `failed`, or `unknown` outcome.
5. Commit the queue offset only after the state is durable.

Ordering by order helps serialize work, but it does not itself make the provider side effect exactly-once. If the worker crashes after the provider charge but before saving success, redelivery repeats the call. Safety depends on repeating the same provider key so the provider can return the existing operation rather than create another one.

Source: [queue-based architecture](../../sources/designs/payment-idempotency-design-summary.md#queue-based-architecture) and [provider idempotency](../../sources/designs/payment-idempotency-design-summary.md#provider-idempotency)

## Closing the database-to-queue gap

Saving an attempt and publishing its message are a dual write. A crash after the database commit but before publish can strand the attempt in `requested`. The proposal recommends a transactional outbox or durable database change stream so the committed workflow record is eventually published. Publishing first and conditionally creating the record in the consumer is an alternative, but it changes the operational semantics and still requires explicit duplicate handling.

Source: [database-to-queue consistency](../../sources/designs/payment-idempotency-design-summary.md#database-to-queue-consistency)

## Recovery and responsibility boundaries

Stale `submitting` attempts need takeover rules based on timestamps, leases, versions, or fencing. A takeover must retain the same provider idempotency key. Provider webhooks and scheduled reconciliation must also be idempotent because they may arrive more than once or out of order.

| Component | Primary responsibility |
| --- | --- |
| Database | Authorize a generation and persist its state. |
| Queue | Order and deliver work, including possible redelivery. |
| Worker | Process redelivery safely and persist transitions. |
| Provider | Deduplicate calls carrying the same generation key. |
| Reconciliation | Resolve ambiguity and repair incomplete local state. |

Source: [recovery and reconciliation](../../sources/designs/payment-idempotency-design-summary.md#recovery-and-reconciliation) and [division of responsibilities](../../sources/designs/payment-idempotency-design-summary.md#division-of-responsibilities)

## What the design does and does not guarantee

This is a convergence design, not a literal distributed exactly-once transaction. Database serialization prevents competing local attempts; the outbox prevents lost work; queue partitioning orders same-order work; worker logic tolerates redelivery; provider idempotency deduplicates repeated external calls; and reconciliation resolves ambiguous outcomes. Each layer closes a different failure window.

The result still depends on provider-specific behavior that the source does not define: how long idempotency keys are retained, whether parameter mismatch is rejected, whether the same key always returns the original operation, and which provider states are authoritative. These assumptions must be confirmed before implementation. This limitation is consistent with the broader warning that [“exactly once” must name the state and effects it covers](stream-processing-fault-tolerance.md).

This page is a synthesis of an unverified design proposal, not a production readiness assessment.

Source: [final recommendation](../../sources/designs/payment-idempotency-design-summary.md#final-recommendation)

