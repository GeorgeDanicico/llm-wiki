# System Design Fundamentals

This page clarifies core reliability and distributed-data terms in the [captured system-design note](../../sources/notes/distributed-systems/system-design-fundamentals.md). The distinctions below are supported by the cited standards and system documentation; the examples are explanatory synthesis.

## Reliability, resilience, and availability

**Reliability** describes the ability or probability of a system or component to perform its specified function under stated conditions over a specified time. “Continue to function despite failures” more directly describes **fault tolerance** or **resilience**: the system contains failures, degrades gracefully, or recovers while preserving its required service. These qualities are related, but not interchangeable. [NIST reliability glossary](https://csrc.nist.gov/glossary/term/reliability)

**Availability** means that a service or information is accessible when needed, often expressed as a proportion of time or successful requests. It does not require every component to be operational: redundancy and degraded modes can keep a service available while a component is failing. “All systems are operational” is therefore too strong as a definition. [NIST availability glossary](https://csrc.nist.gov/glossary/term/availability)

## CAP, consistency, availability, and partitions

The sentence “all nodes see the same data” is too broad to define consistency. In the CAP theorem, consistency refers to an atomic, linearizable view of operations: each operation behaves as though it took effect at one point between its invocation and response, in a single order that respects real-time ordering. Other consistency models make weaker promises and may permit replicas to differ temporarily.

CAP availability is also a specific theoretical guarantee: requests to non-failing nodes receive responses. It is not identical to an uptime target or to NIST’s general availability definition. A **network partition** is a communication failure between parts of a distributed system. When a partition occurs, a system cannot guarantee both CAP consistency and CAP availability for every request: it may reject or delay some operations to preserve consistency, or answer more requests while allowing stale or divergent results. Partition tolerance describes behavior under this network condition; it does not mean every operation can continue successfully. [Gilbert and Lynch, “Brewer’s Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services”](https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer2.pdf)

## Stateless and stateful services

A **stateless service** does not depend on a particular application process retaining client-specific session state between requests. Each request carries the context needed to handle it, or the service reads state from an external store; any suitable instance can then handle the request. This does not mean the overall application has no state: accounts, orders, media position, and other data can still be persisted elsewhere. A **stateful service** uses remembered session, workflow, connection, or stream state across interactions. A video session is a useful example if playback position or session context is retained. HTTP’s stateless request semantics are distinct from application state. [RFC 9110, HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)

## Data partitioning (sharding)

Partitioning divides a dataset among storage nodes. It can spread storage and work to support scale, and a query routed to the relevant partition may avoid scanning unrelated data. It does not automatically make every query faster. Queries that need data from several shards, including some joins or scatter-gather reads, add network work and coordination.

- **Horizontal partitioning** stores different rows or records on different shards.
- **Vertical partitioning** stores different columns or groups of columns separately.
- **Range-based partitioning** assigns key ranges to partitions. It can preserve locality for range queries, but uneven key distributions or hot ranges can create skew.
- **Hash-based partitioning** applies a hash to a key to distribute records. It can spread keys more evenly, but usually loses the natural ordering needed for efficient range locality.

Range-based and hash-based are key-placement strategies generally used for horizontal partitions; they are not additional axes beside horizontal and vertical partitioning. The key and query patterns determine routing, locality, and skew trade-offs. [MongoDB sharding overview](https://www.mongodb.com/docs/manual/sharding/), [MongoDB range and hashed sharding](https://www.mongodb.com/docs/manual/core/sharding-distribute-collection-data/)

## Replication and acknowledgement strategies

**Replication** keeps copies of data on multiple nodes. It can improve availability, durability, or read capacity, depending on the system and configuration. Copying data alone does not ensure fault tolerance or strong consistency; write acknowledgment, failover, repair, conflict handling, and read-routing rules matter.

- **Asynchronous replication:** a primary can acknowledge a write before followers have applied it. A follower read may therefore be stale, and failover can lose acknowledged writes under some configurations. Asynchronous copying creates replication lag; eventual convergence additionally depends on repair and conflict-resolution behavior.
- **Synchronous replication:** the primary waits for acknowledgements from a configured set of replicas before reporting commit. “Synchronous” does not mean every replica changes at the same instant. Which replicas must acknowledge, and whether acknowledgment means durable receipt or application/visibility, are implementation-specific. Waiting can raise write latency or reduce write availability when required replicas are unreachable. It does not by itself promise linearizable reads. [PostgreSQL synchronous replication](https://www.postgresql.org/docs/current/warm-standby.html)
- **Quorum-based replication:** reads and writes may require acknowledgements from configured numbers of replicas. A majority is one common policy, but “majority agrees before updating” is not a complete definition. For a replicated register, configurations with read quorum `R` and write quorum `W` often rely on intersection (`R + W > N`) to make reads overlap writes; the exact guarantee also depends on versioning, ordering, repair, and failure assumptions. A quorum alone is not a universal guarantee of consensus or linearizability. [MongoDB write concern](https://www.mongodb.com/docs/manual/reference/write-concern/)

## Consistency models

“Strong consistency” is often used informally. When a precise single-object guarantee is intended, **linearizability** is a useful term: operations appear instantaneous between call and response, and real-time order is preserved. It does not mean that the physical contents of all replicas are literally identical at every instant.

**Eventual consistency** permits reads to differ temporarily. If updates stop and replicas continue communicating and repairing, they are expected to converge to a common resolved value. The model alone gives no fixed convergence time, and concurrent conflicting updates require a resolution policy. “The latest data” is ambiguous if there are concurrent writes or conflict resolution can discard a value.

**Causal consistency** preserves cause-and-effect order. If comment B depends on post A, a client that observes B must also observe A first; replicas must preserve that causal order for observers. Unrelated concurrent changes need not have one globally agreed order. The example captures the dependency idea, but “all users should see A then B” is stronger than necessary if it implies every user sees all updates at the same time. [COPS: Consistent Wide-area Storage](https://www.cs.princeton.edu/~wlloyd/papers/cops-sosp11.pdf)

## Source and scope

The [captured note](../../sources/notes/distributed-systems/system-design-fundamentals.md) is preserved verbatim, including its final empty bullet. The terminology corrections above are independently grounded in the linked standards, research paper, and product documentation. Replica behavior, quorum guarantees, and availability targets remain configuration- and system-specific; check the selected database’s versioned documentation before applying these descriptions to a concrete deployment.
