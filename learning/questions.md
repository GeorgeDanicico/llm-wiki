# Review Questions

Questions are grouped by topic and include recall, explanation, comparison, application, and diagnosis prompts.

## Distributed Systems

### What is the difference between event time and processing time?

Source: [Event time and processing time](../wiki/distributed-systems/event-time-and-processing-time.md)

Expected points:

- Event time describes when an event occurred.
- Processing time describes when the system observed or handled it.
- Network delays, queues, partitions, and slow processing can make them diverge.
- Choosing the wrong one can corrupt ordering, windows, and observability.

### Compare tumbling, hopping, sliding, and session windows.

Source: [Stream windows](../wiki/distributed-systems/stream-windows.md)

Expected points:

- Tumbling windows are fixed and non-overlapping.
- Hopping windows start periodically and may overlap.
- Sliding windows represent a continuously moving recent range.
- Session windows group related activity by key and activity boundaries.

### A dashboard needs a five-minute total recalculated every minute. Which window shape fits, and why?

Source: [Stream windows](../wiki/distributed-systems/stream-windows.md)

Expected points:

- A hopping window fits a fixed five-minute range emitted on one-minute hops.
- Adjacent calculations overlap.
- A sliding implementation might also express a moving range, depending on engine semantics, so the exact system API matters.

### Why might a stream processor keep a local snapshot of reference data?

Source: [Stream joins](../wiki/distributed-systems/stream-joins.md)

Expected points:

- It avoids a remote database call for every event.
- It can reduce network latency and dependency on database availability.
- The trade-off is memory or disk use plus potentially stale data.

### Diagnose why replaying the same events could produce different join results.

Source: [Time-dependent stream joins](../wiki/distributed-systems/time-dependent-stream-joins.md)

Expected points:

- Events may be observed in a different order.
- The reference table may have changed between runs.
- Event-time versus processing-time semantics may be unspecified.
- Versioned dimensions, stable identifiers, and validity intervals can make historical intent explicit.

### Why is “exactly once” an incomplete fault-tolerance claim?

Source: [Stream-processing fault tolerance](../wiki/distributed-systems/stream-processing-fault-tolerance.md)

Expected points:

- The claim must identify whether it covers processing, state, output, or end-to-end effects.
- Retries can duplicate external side effects even if internal state is restored consistently.
- Progress, restored state, replay, and output commit behavior all affect the guarantee.

### Why does a Kafka consumer commit offset `103` after completing records `100` through `102`?

Source: [Kafka consumer progress and durability](../wiki/distributed-systems/kafka-consumer-progress-and-durability.md#current-position-versus-committed-offset)

Expected points:

- A committed offset identifies the next record to consume, not the last completed record.
- Committing `103` asserts that all relevant effects for earlier offsets are complete.
- Recovery resumes at `103`.
- Concurrent processing must not commit past an unfinished lower offset.

### A Kafka handler finishes its database update and crashes before committing its offset. What happens next?

Source: [Kafka consumer progress and durability](../wiki/distributed-systems/kafka-consumer-progress-and-durability.md#the-processcommit-failure-boundary)

Expected points:

- The replacement consumer resumes from the older committed offset.
- The record can be delivered and processed again.
- This is the normal at-least-once failure window.
- The database effect needs an idempotency key, uniqueness rule, inbox record, or equivalent deduplication mechanism.

### Why is `acks=all` insufficient without considering `min.insync.replicas`?

Source: [Kafka consumer progress and durability](../wiki/distributed-systems/kafka-consumer-progress-and-durability.md#broker-side-durability)

Expected points:

- “All” means all replicas currently in the ISR, not the configured replication factor.
- A shrunken ISR can contain only the leader.
- `min.insync.replicas` rejects the write when too few in-sync copies are available.
- The rejection exchanges write availability for stronger durability.

### What does Kafka producer idempotence protect, and what does it not protect?

Source: [Kafka consumer progress and durability](../wiki/distributed-systems/kafka-consumer-progress-and-durability.md#broker-side-durability)

Expected points:

- It prevents producer retries from appending duplicate copies within its supported scope.
- It works with producer acknowledgement and retry constraints.
- It does not deduplicate a consumer's database writes or external API calls.
- External effects still require their own idempotency or atomic inbox/outbox pattern.

### Why can a healthy Kafka consumer be removed from its group during a long computation?

Source: [Kafka consumer progress and durability](../wiki/distributed-systems/kafka-consumer-progress-and-durability.md#rebalancing-is-also-a-replay-boundary)

Expected points:

- Liveness heartbeats and application progress are related but distinct.
- Exceeding `max.poll.interval.ms` can mark the consumer as stalled even if its process is alive.
- The partition can move to another consumer, creating a replay boundary.
- Processing time, poll structure, and timeout settings must be designed together and checked against the selected group protocol.

## Infrastructure

### INFRA-TB-001 — How do refill rate and bucket capacity affect a token bucket?

Source: [Token buckets and network bandwidth shaping](../wiki/infrastructure/token-buckets-and-network-bandwidth-shaping.md)

Expected points:

- Refill rate sets the sustainable long-term throughput.
- Capacity bounds how many unused tokens can accumulate.
- Accumulated tokens permit a bounded burst.
- An operation without enough tokens is rejected, delayed, or queued according to policy.

### INFRA-TB-002 — How does network bandwidth shaping differ from traffic policing?

Source: [Token buckets and network bandwidth shaping](../wiki/infrastructure/token-buckets-and-network-bandwidth-shaping.md)

Expected points:

- Shaping normally queues and delays excess traffic to smooth its transmission rate.
- Policing typically drops or marks traffic that exceeds the configured policy.
- A token bucket can measure whether traffic conforms to an average rate while allowing bounded bursts.

### What roles do recursive, root, TLD, and authoritative DNS servers play?

Source: [Domain Name System](../wiki/infrastructure/dns.md)

Expected points:

- The recursive resolver coordinates resolution for the client.
- Root servers direct it to the relevant TLD namespace.
- TLD servers direct it to authoritative service for the domain.
- Authoritative servers supply records for zones they serve.

### Compare `A`, `AAAA`, and `CNAME` records.

Source: [Domain Name System](../wiki/infrastructure/dns.md)

Expected points:

- `A` contains an IPv4 address.
- `AAAA` contains an IPv6 address.
- `CNAME` aliases a name to another name.

### Why can changing a DNS record fail to affect every client immediately?

Source: [Domain Name System](../wiki/infrastructure/dns.md)

Expected points:

- Browsers, operating systems, and resolvers may have cached an earlier answer.
- TTL controls how long a cached record may be retained.
- Clients can therefore observe the change at different times.

### Explain the purpose of a multi-stage Dockerfile.

Source: [Dockerfile multi-stage builds](../wiki/infrastructure/dockerfile-multi-stage-builds.md)

Expected points:

- Each `FROM` starts a stage.
- Build dependencies can remain in an earlier stage.
- Explicitly selected artifacts are copied into the runtime stage.
- The final image contains only intentional runtime necessities.

### A binary exists in the build stage but not in the final image. What should you inspect first?

Source: [Dockerfile multi-stage builds](../wiki/infrastructure/dockerfile-multi-stage-builds.md)

Expected points:

- Confirm which `FROM` stage produced the binary.
- Check that the final stage explicitly copies it from the correct earlier stage.
- Verify source and destination paths in the copy instruction.

