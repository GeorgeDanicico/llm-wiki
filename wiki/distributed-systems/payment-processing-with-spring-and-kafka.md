# Payment Processing with Spring and Kafka

## API and idempotent acceptance

An asynchronous payment-like API can return `202 Accepted` with a status resource, then expose completion through polling, a webhook, or another suitable channel. The client-visible model should represent intermediate states honestly. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#101-clarify-the-api-semantics-first)

Use a caller-supplied stable idempotency key. In one database transaction, insert the payment state and an outbox event; enforce uniqueness on the key and compare a request hash when it already exists. A reused key with a different payload should be rejected. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#102-idempotent-api-acceptance)

## Transactional outbox and ordering

A local SQL transaction cannot atomically update the database, publish to Kafka, and call an external provider. Direct publication after a database commit creates a dual-write window. The outbox stores business state and an event in one transaction, then a relay publishes it. Because a crash between publication and marking the row published can duplicate the event, consumers must remain idempotent. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#103-transaction-boundaries-and-the-outbox)

Kafka orders records only within a partition. Key records by the smallest aggregate that requires ordering, such as a payment ID. Partition order does not replace database constraints or conditional transitions because records can be delivered again and other APIs or jobs can update the same state. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#104-partition-keys-and-ordering)

For the underlying offset, acknowledgement, replication, ISR, and exactly-once boundaries, see [Kafka consumer progress and durability](kafka-consumer-progress-and-durability.md).

## External-provider ambiguity

Use a state machine that distinguishes confirmed success, confirmed failure, and an uncertain result. If a provider call times out, do not assume failure: the provider may have completed the side effect. Retry with the same provider idempotency key, query provider status, or record `UNKNOWN` and reconcile later. Avoid holding a database transaction open during the network call. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#106-consumer-processing-and-payment-provider-calls)

After durable processing, commit the next Kafka offset. If the database commits and the consumer crashes before the offset commit, Kafka redelivers the record; unique event IDs, business idempotency, conditional state changes, and provider idempotency make that replay safe. Committing the offset first risks silent loss. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#107-consumer-acknowledgments-and-duplicates)

## Rebalancing and stale workers

On reassignment, the returning consumer accepts its new assignment and resumes from committed offsets; it does not reclaim previous partitions itself. Revocation handling must stop new work and commit only safely completed offsets. A dead consumer may receive no callback, so replay remains expected. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#108-consumer-failure-and-group-rebalancing)

A long pause or network partition can leave an old asynchronous task running after Kafka assigns the partition elsewhere. Kafka can reject an obsolete offset commit but cannot undo an external provider call. Use stable idempotency keys, conditional transitions, leases, and fencing tokens around external effects. Keep `poll()` responsive and align `max.poll.interval.ms` and record-batch size with realistic processing time. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#zombie-consumer-risk)

## Convergence and compensation

Eventual consistency appears between API acceptance and consumption, provider completion and local persistence, and payment completion and downstream order, inventory, notification, or reporting updates. Durable events, retries, idempotency, reconciliation, and compensation drive convergence. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#109-eventual-consistency)

Inventory can use an atomic conditional decrement to prevent overselling. Longer workflows may require expiring reservations and a saga policy such as refund, void, or backorder when payment and inventory outcomes diverge. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#1010-inventory-concurrency) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#1011-partial-failure-recovery-table)

## Source assessment

The captured source gives a coherent at-least-once design and explicitly limits Kafka's exactly-once claims at external boundaries. Configuration examples such as replication factor, acknowledgements, ISR minimums, consumer timing, and rebalance behavior are version- and deployment-sensitive. This page preserves that uncertainty and links the existing Kafka durability page for separately verified broker and consumer details.

Primary source: [Senior Java and Spring Boot Interview Knowledge](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md)
