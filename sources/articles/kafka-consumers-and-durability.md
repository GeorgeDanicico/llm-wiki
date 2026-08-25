# Kafka Consumers, Consumer Groups, and Durability

Kafka consumers are pull-based: they repeatedly ask brokers for the next batch of records. Consumer groups coordinate multiple consumers so partitions can be processed in parallel, while each partition is owned by only one consumer in a group at a time.

## How a Consumer Reads Records

Each record in a partition has a monotonically increasing offset:

```text
Partition 0

offset:   100       101       102       103
record:    A         B         C         D
```

A consumer maintains two related positions:

- **Current position:** The next offset it plans to fetch during its running session.
- **Committed offset:** The persisted checkpoint from which it can resume after a failure.

Conceptually, the consumer performs this cycle:

```text
poll()
  ↓
Fetch records from partition leaders
  ↓
Process records
  ↓
Commit the next offset
```

If it successfully processes offsets `100` through `102`, it normally commits offset `103`. This means that everything before offset `103` has been processed and the consumer should resume from `103`.

Committed offsets are stored by Kafka in an internal, replicated, compacted topic named `__consumer_offsets`.

Consumers generally fetch batches rather than individual records. Batching is one of the reasons Kafka can achieve high throughput.

## Consumer Groups

A consumer group represents one logical subscriber and is identified by its `group.id`.

Within one consumer group, a partition is assigned to at most one consumer at a time:

```text
Topic: orders
Partitions: P0, P1, P2, P3

Consumer group: billing

Consumer A → P0, P1
Consumer B → P2, P3
```

This allows the group to process partitions concurrently while preserving the order within each partition.

If the group has more consumers than partitions, some consumers remain idle:

```text
3 partitions + 5 consumers
        ↓
3 active consumers + 2 idle consumers
```

Different consumer groups read independently:

```text
orders topic
    ├── billing group
    ├── analytics group
    └── notifications group
```

Each group has its own committed offsets. Reading a record in one group does not consume or remove it for another group.

Kafka retains records according to the topic's retention policy, not according to whether consumers have read them.

## Group Coordination and Rebalancing

A broker acts as the group coordinator. It tracks:

- The consumers that belong to the group.
- Consumer heartbeats.
- Partition assignments.
- Committed offsets.

When a consumer joins, leaves, or is considered dead, the group may rebalance:

```text
Before failure:

Consumer A → P0, P1
Consumer B → P2, P3

Consumer B fails:

Consumer A → P0, P1, P2, P3
```

During a rebalance, affected consumers temporarily stop processing while partitions are reassigned. Cooperative rebalancing can reduce how much work needs to stop and move.

Consumers send heartbeats to show that they are alive. Kafka can consider a consumer failed when:

- Its process crashes.
- Its machine or network fails.
- Heartbeats stop for too long.
- It takes too long between calls to `poll()`.
- It leaves the group normally.

The distinction between the heartbeat timeout and the poll timeout is important. A consumer might still be alive but spend so long processing a batch that Kafka decides it is no longer making progress.

## What Happens When a Consumer Fails?

Suppose a consumer processes records `100` through `105`, but its last committed offset is `103`:

```text
Processed:       100 101 102 103 104 105
Committed next:  103
```

After the failure, another consumer receives the partition and resumes from offset `103`. Records `103` through `105` may therefore be processed again.

This is normal **at-least-once processing**:

```text
Process record
    ↓
Crash before commit
    ↓
Record is processed again
```

Consumers should usually make their handlers idempotent so that processing the same record more than once does not create an incorrect result.

If the consumer commits before processing, the opposite can happen:

```text
Commit offset
    ↓
Crash before processing
    ↓
Record may be skipped
```

This produces **at-most-once processing**.

The typical safe order is:

```text
Fetch → process successfully → commit
```

For an atomic consume-process-produce workflow entirely inside Kafka, transactions can provide exactly-once semantics. Atomic coordination with an external database requires additional patterns, such as idempotent database writes or an inbox/outbox design.

### If the Entire Consumer Group Stops

If every consumer in the group fails:

- Records remain in the topic.
- Consumer lag increases.
- No processing happens.
- When a consumer restarts, it resumes from the group's committed offsets.

If a group remains inactive for sufficiently long, its committed offsets can eventually expire according to broker configuration. The records themselves follow the topic's separate retention settings.

## Kafka Durability

Kafka stores partitions as append-only log files, but its primary durability mechanism is replication rather than calling `fsync()` for every record.

A partition has one leader and zero or more followers:

```text
Partition P0, replication factor 3

Broker 1: leader
Broker 2: follower
Broker 3: follower
```

The write flow is approximately:

```text
Producer
   ↓
Partition leader appends the batch
   ↓
Followers fetch and append the batch
   ↓
Leader acknowledges according to producer configuration
```

Followers that are sufficiently caught up belong to the **in-sync replica set**, or ISR.

## Producer Acknowledgements

The producer's `acks` setting controls when a send is considered successful.

### `acks=0`

```text
Producer sends → does not wait
```

This is fast, but the producer does not know whether Kafka accepted the record.

### `acks=1`

```text
Leader appends → leader acknowledges
```

If the leader fails before followers replicate the record, the acknowledged record may be lost.

### `acks=all`

```text
Leader appends
Followers in the ISR replicate
Leader acknowledges
```

This provides the strongest normal durability, especially when combined with settings such as:

```properties
replication.factor=3
min.insync.replicas=2
acks=all
enable.idempotence=true
```

With `min.insync.replicas=2`, Kafka refuses an `acks=all` write when fewer than two replicas are in sync. This trades availability for durability:

```text
Not enough healthy replicas
        ↓
Reject the write instead of accepting a poorly replicated record
```

`min.insync.replicas` is not the number of replicas that may exist. It is the minimum ISR size required to accept an `acks=all` write.

## Does Kafka Call `fsync()` for Every Message?

Normally, it does not.

Kafka appends records to files through the operating system's filesystem cache, called the page cache. A write can therefore be acknowledged before those bytes are physically persisted to disk:

```text
Kafka append
    ↓
OS page cache
    ↓
Later writeback to physical storage
```

Kafka has configuration for periodic log flushing, but forcing `fsync()` for every record or batch would substantially reduce throughput. Kafka normally gains durability by copying the record to multiple brokers:

```text
One machine loses power
        ↓
Other replicas still have the record
```

This differs from many traditional database write-ahead logs, where a transaction commit may wait for a synchronous disk flush.

Replication is not identical to physical disk persistence. If all replicas simultaneously lose unflushed page-cache data—for example, during a broad power failure—recent acknowledged records could potentially be lost. Stronger storage and flush guarantees can reduce that risk, but have performance costs.

## What Happens When a Partition Leader Fails?

When a partition leader fails:

1. Kafka detects the failed broker.
2. An eligible in-sync follower becomes the new leader.
3. Producers and consumers refresh their metadata.
4. They continue using the new leader.

Kafka normally elects a leader from the ISR so that acknowledged records are preserved. Allowing an out-of-sync replica to become leader can restore availability faster in extreme circumstances, but may lose acknowledged data. Unclean leader election is therefore an important durability trade-off.

## Complete Flow

```text
Producer
  │
  │ key chooses partition
  │ acks=all
  ▼
Partition leader
  │
  │ replicates append-only log
  ▼
In-sync followers
  │
  │ record becomes safely replicated
  ▼
Consumer group
  │
  │ one consumer per partition
  │ poll → process → commit
  ▼
Committed group offset
```

Kafka durability depends primarily on:

- The replication factor.
- ISR health.
- `acks=all`.
- `min.insync.replicas`.
- Clean leader election.
- Producer retry and idempotence settings.

Disk-backed append-only logs are fundamental, but per-message `fsync()` is generally not Kafka's central durability mechanism.
