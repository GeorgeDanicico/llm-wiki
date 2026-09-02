# Payment Idempotency and Double-Charge Prevention

## Problem

Payment requests can be repeated because of UI crashes, network failures, retries, multiple devices, concurrent application instances, database replication, and queue redelivery. The system must make all requests for one logical payment converge on the same payment attempt and customer-visible result.

An idempotency key helps, but a client-generated key by itself is insufficient. For example, a desktop and a phone can generate different keys for the same order and accidentally initiate two charges.

## Core principle

The invariant belongs to the business obligation—normally an `order_id` or `invoice_id`—not to the user. A user can legitimately pay several different orders at once.

For every order, the system should permit only one active payment generation at a time. Each generation represents one logical attempt and has a stable server-side identifier and provider idempotency key.

## Suggested data model

Store a payment workflow record containing at least:

```json
{
  "orderId": "order-123",
  "paymentGeneration": 1,
  "paymentAttemptId": "pay-789",
  "status": "requested",
  "amount": 4999,
  "currency": "EUR",
  "providerPaymentId": null,
  "version": 1,
  "createdAt": "...",
  "updatedAt": "..."
}
```

Recommended states:

```text
requested -> submitting -> succeeded
                        -> failed
                        -> unknown
```

`unknown` means that the provider might have completed the charge, but the local system has not confirmed the result. A new generation must not be created until this state is reconciled.

Store canonical amount and currency with the attempt, and reject reuse when payment parameters do not match. Do not trust a client or queue message to redefine the order amount.

## Atomic payment claim

When payment is requested, use a database conditional write, compare-and-set, transaction, or uniqueness constraint to create or claim the active payment generation atomically.

Conceptually:

```text
Create generation 1 only if the order has no active payment generation.
```

If desktop and phone request payment concurrently, only one request creates the attempt. The other receives the existing attempt and its current status. A short database row lock is acceptable, but a broad distributed lock based on the user is unnecessary.

A status column alone is not sufficient unless the database atomically enforces the one-active-payment-per-order invariant.

## Multiple databases and leaders

With asynchronously replicated multi-leader databases, two leaders can independently observe an order as unpaid and both initiate a provider call. Resolving the database conflict later is too late because both external charges may already exist.

Payment initiation therefore needs a single serialization point, such as:

- One logical database writer with replicas and automatic failover.
- A strongly consistent or serializable consensus-based database.
- Sharding by `order_id`, with one owning leader for each order.
- A strongly consistent coordination record.
- A queue partitioned by `order_id`.

During a network partition, rejecting or delaying payment is generally safer than allowing independent regions to charge concurrently.

## Queue-based architecture

A robust asynchronous design is:

```text
Client
  -> Payment API
  -> conditional payment-workflow write
  -> Kafka
  -> payment worker
  -> payment provider
```

Kafka messages should use `order_id` as their key so all events for one order enter the same partition and are processed sequentially.

Kafka does not make the external charge exactly-once. Consumers can receive a message again after a crash, retry, or rebalance. Workers must therefore be idempotent:

1. Read the payment attempt.
2. Atomically claim or transition its state.
3. Call the provider with the stable provider idempotency key.
4. Persist `succeeded`, `failed`, or `unknown` and the provider payment ID.
5. Commit the queue offset only after durable state is saved.

## Provider idempotency

The provider idempotency key should be stable for the entire logical payment generation, for example:

```text
merchant-42:order-123:generation-1
```

If a worker crashes after the provider charges the customer but before saving success, message redelivery must call the provider with the same key. The provider can then return the existing result instead of creating a new charge.

The generation number permits a genuinely new attempt after a confirmed failure. Never create a new generation merely because the previous result timed out or is uncertain.

## Database-to-queue consistency

Writing the payment record and publishing a Kafka message are two separate operations. A crash between them can leave a requested payment with no queued work.

Avoid this unsafe dual write with a transactional outbox or a durable database change stream that eventually publishes each workflow record to Kafka. Another possible design is to publish first and let the consumer conditionally create or claim the record, though the operational semantics differ.

## Recovery and reconciliation

The design must handle attempts stuck in `submitting` because of worker failure. Use timestamps, leases or versions, and fencing where appropriate, but a takeover must reuse the same provider idempotency key.

Provider webhooks and scheduled reconciliation should:

- Resolve `unknown` and long-running attempts.
- Store the provider payment ID and final status.
- Handle duplicate and out-of-order webhook delivery idempotently.
- Prevent a new payment generation while an older one may have succeeded.

## Division of responsibilities

```text
Database:
  Decides whether a payment generation is allowed and records durable state.

Kafka:
  Orders and reliably delivers work, while permitting redelivery.

Worker:
  Processes messages idempotently and persists state transitions.

Payment provider:
  Deduplicates repeated calls for the same payment generation.

Reconciliation:
  Resolves ambiguous outcomes and repairs state after failures.
```

## Final recommendation

Use a server-created payment attempt tied to an order, enforce one active generation with a conditional strongly consistent database write, publish work through an outbox or change stream, partition Kafka messages by `order_id`, and pass a stable generation-specific idempotency key to the payment provider. This does not create a literal distributed exactly-once transaction, but it makes retries converge safely and substantially reduces the risk of duplicate charges.
