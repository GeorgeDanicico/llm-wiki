# Kafka Consumer Progress and Durability

Kafka's end-to-end reliability depends on two distinct questions:

1. Did Kafka retain the produced record despite broker failure?
2. Did the consumer durably record its progress only after the intended effect completed?

A record can be safely replicated and still be processed more than once. Conversely, a perfectly idempotent consumer cannot recover a record that the producer considered sent before Kafka durably accepted it. Producer durability and consumer processing semantics must therefore be reasoned about separately and then combined. [Source](../../sources/articles/kafka-consumers-and-durability.md)

## Partitions, groups, and ordering

A topic is divided into ordered partitions. Each record has a monotonically increasing offset within its partition; Kafka does not define one global order across all partitions. Within a consumer group, a partition is assigned to at most one consumer at a time, while different groups read independently and keep separate progress. Records remain governed by the topic's retention policy rather than being removed when a group reads them. [Source](../../sources/articles/kafka-consumers-and-durability.md#consumer-groups)

The practical consequences are:

- Maximum active parallelism for one group is bounded by the number of assigned partitions.
- Extra consumers remain idle when the group has more consumers than partitions.
- Per-partition order is available only if the handler does not introduce unsafe concurrent reordering.
- A key selects a partition, so stable keys are how related records can share an ordering boundary.

## Current position versus committed offset

A running consumer's current position is the next record it intends to fetch. Its committed offset is the durable recovery checkpoint for the group. A commit records the *next* offset to consume: after successfully completing offsets `100` through `102`, the normal checkpoint is `103`. Kafka stores group offsets in the replicated, compacted internal topic `__consumer_offsets`. [Source](../../sources/articles/kafka-consumers-and-durability.md#how-a-consumer-reads-records)

This next-offset convention matters for batches. Committing `103` asserts that every relevant effect for earlier offsets is complete. When a handler processes records from one partition concurrently or out of order, it must not advance the committed frontier across unfinished work.

## The process–commit failure boundary

The order of processing and checkpointing determines the delivery behavior:

| Sequence | Failure window | Result |
| --- | --- | --- |
| Process succeeds, then commit succeeds | None remains for those offsets | Normal progress |
| Process succeeds, then crash occurs before commit | The next owner resumes from the older checkpoint | Some records are replayed: at least once |
| Commit succeeds, then crash occurs before processing | The next owner resumes after unprocessed records | Some records are skipped: at most once |

The usual safe order is `fetch → process successfully → commit`. It deliberately accepts replay rather than silent loss. The handler must make repeated processing converge on the same correct result—for example through a uniqueness constraint, a stable idempotency key, or a conditional state transition. [Source](../../sources/articles/kafka-consumers-and-durability.md#what-happens-when-a-consumer-fails)

Consumer auto-commit deserves special care: periodic background commits describe returned records, not necessarily completion of arbitrary downstream work. Whether it is safe depends on how processing is structured.

## Rebalancing is also a replay boundary

The group coordinator tracks membership and partition assignment. A join, departure, timeout, or failure can move partitions to another consumer. Heartbeat/session timeouts detect lost members, while `max.poll.interval.ms` limits how long a consumer can go without calling `poll()` before it is treated as stalled. Cooperative assignment can reduce partition movement, but does not remove the need for safe revocation and replay handling. [Source](../../sources/articles/kafka-consumers-and-durability.md#group-coordination-and-rebalancing)

Operationally, a consumer should:

- Keep polling within the configured progress deadline or decouple polling from long work safely.
- Stop taking new work for a revoked partition and finish, cancel, or checkpoint outstanding work according to a defined policy.
- Commit only the highest contiguous completed offset per partition.
- Expect a replacement owner to replay from the last successful commit.

Kafka 4.3 supports both classic and newer consumer group protocols; which side controls heartbeat and session settings depends on the selected protocol. Check the deployed version and protocol instead of copying timeout defaults from a generic example. [Apache Kafka 4.3 consumer configuration](https://kafka.apache.org/43/configuration/consumer-configs/)

## Broker-side durability

Each partition has a leader and may have follower replicas. Producers write to the leader; followers fetch the log. Replicas that are sufficiently caught up form the in-sync replica set (ISR). The producer's acknowledgement mode determines when a send is reported as successful. [Source](../../sources/articles/kafka-consumers-and-durability.md#kafka-durability)

| Producer acknowledgement | Success means | Main risk |
| --- | --- | --- |
| `acks=0` | The producer did not wait for broker acknowledgement | Kafka may never have accepted the record |
| `acks=1` | The leader appended the record | Leader loss before replication can lose an acknowledged record |
| `acks=all` | All replicas currently in the ISR acknowledged | Durability still depends on ISR size and leader-election policy |

`acks=all` does not by itself require two or three copies. If the ISR has shrunk to one, that one replica can satisfy “all.” `min.insync.replicas` closes this gap by rejecting `acks=all` writes when the ISR is smaller than the configured minimum. A common shape is replication factor 3, `min.insync.replicas=2`, and `acks=all`: losing too many in-sync replicas makes writes fail, trading availability for stronger durability. [Source](../../sources/articles/kafka-consumers-and-durability.md#producer-acknowledgements)

Producer idempotence addresses duplicates caused by producer retries. It does not make consumer database writes, emails, payments, or other external effects exactly once. [Apache Kafka 4.3 producer configuration](https://kafka.apache.org/43/configuration/producer-configs/)

## Replication is not the same as a synchronous disk flush

Kafka normally appends through the operating system page cache and relies primarily on replication rather than forcing an `fsync()` for every message. This favors throughput and protects against a single-machine failure because another broker has a copy. It is not identical to confirmed physical persistence: a correlated loss of all replicas' unflushed page-cache data can still lose recent acknowledged writes. Storage guarantees, flush policy, fault domains, and replication therefore belong in the durability model. [Source](../../sources/articles/kafka-consumers-and-durability.md#does-kafka-call-fsync-for-every-message)

On leader failure, Kafka normally promotes an eligible in-sync replica. Electing an out-of-sync replica may restore availability when no ISR candidate exists, but can discard acknowledged data. Leader-election policy is thus part of the same availability-versus-durability trade-off. [Source](../../sources/articles/kafka-consumers-and-durability.md#what-happens-when-a-partition-leader-fails)

## Exactly-once boundaries

For a consume–transform–produce flow entirely inside Kafka, transactions can atomically commit produced records and consumed offsets, while downstream consumers use `read_committed`. That guarantee does not automatically extend to an external database or service. [Source](../../sources/articles/kafka-consumers-and-durability.md#what-happens-when-a-consumer-fails)

At an external boundary, use a deliberate pattern:

- Make the external write idempotent using an event or business-operation identifier.
- Store an inbox/deduplication record and the domain update in one database transaction.
- Use a transactional outbox when a database update must later result in a Kafka publication.
- Reconcile ambiguous outcomes before creating a new logical attempt.

The useful question is not merely “is this exactly once?” but “which state changes are atomic, what is replayed after each crash point, and which visible effects can repeat?”

## Review checklist

- Is the record key aligned with the required ordering boundary?
- Is group parallelism limited appropriately by the partition count?
- Are commits made only after all effects below the committed offset finish?
- Can every handler tolerate redelivery after a crash or rebalance?
- Are poll, heartbeat, and session settings compatible with worst-case processing time and the selected group protocol?
- Are `acks`, replication factor, `min.insync.replicas`, and leader election configured as one durability policy?
- Is producer idempotence enabled when retries could duplicate writes?
- Are Kafka transactions being claimed only for Kafka-contained effects?
- Are consumer lag, ISR shrinkage, under-replicated partitions, rebalance frequency, and commit failures monitored?

## Source assessment

The captured article is a strong conceptual overview and correctly separates consumer replay semantics from broker replication. The main additions here are the contiguous-commit warning for out-of-order batch work, the caveat that producer idempotence does not cover consumer effects, and explicit version sensitivity around group protocols and defaults. These are synthesis and verification notes, not claims made verbatim by the source.

Primary source: [Kafka consumers, consumer groups, and durability](../../sources/articles/kafka-consumers-and-durability.md)

Verification references: [Apache Kafka 4.3 consumer configuration](https://kafka.apache.org/43/configuration/consumer-configs/), [producer configuration](https://kafka.apache.org/43/configuration/producer-configs/), [broker configuration](https://kafka.apache.org/43/configuration/broker-configs/), and [design documentation](https://kafka.apache.org/43/design/design/)
