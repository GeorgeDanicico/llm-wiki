# SAGA Pattern for Distributed Workflows

## Core contract

A SAGA coordinates one business workflow across independently committed local transactions. It does not recreate a distributed ACID transaction: when a later step fails, earlier completed steps are addressed through new compensating business operations rather than database rollback. Those earlier effects may already have been visible to other processes. [Source](../../sources/notes/distributed-systems/saga-pattern.md#overview)

The model therefore exchanges immediate consistency and transaction-level isolation for explicit recovery and eventual convergence. It fits only when temporary inconsistency is acceptable and completed actions have meaningful compensations. [Source](../../sources/notes/distributed-systems/saga-pattern.md#why-saga-is-needed) [Source](../../sources/notes/distributed-systems/saga-pattern.md#when-to-use-saga)

## Coordination styles

| Style | Where workflow knowledge lives | Strengths described by the source | Main risks described by the source |
| --- | --- | --- | --- |
| Orchestration | A durable coordinator records state and sends commands. | The flow, conditions, monitoring, and incident investigation are comparatively explicit. | The coordinator becomes important infrastructure and can accumulate too much business logic. |
| Choreography | Participating services publish and react to events. | Services remain loosely coupled and no central workflow component is required. | The end-to-end flow is spread across handlers, making dependencies, cycles, and production tracing harder as complexity grows. |

The source suggests choreography for short, simple event flows and orchestration for longer or conditional workflows. This is a rule of thumb rather than a universal boundary; team ownership, failure modes, tooling, and operational needs can change the choice. An orchestrator is logically central but need not be one process: multiple workers may share durable state and partition work by SAGA ID. [Source](../../sources/notes/distributed-systems/saga-pattern.md#coordination-styles)

## Durable state is the recovery authority

Every meaningful forward and compensating transition should be persisted. Logs and traces help explain the workflow, but they are not its source of truth. A workflow must not claim `COMPENSATED` while any required undo action remains pending; states such as `FLIGHT_CANCELLATION_PENDING` or `REFUND_PENDING` make incomplete recovery explicit. [Source](../../sources/notes/distributed-systems/saga-pattern.md#durable-saga-state) [Source](../../sources/notes/distributed-systems/saga-pattern.md#when-compensation-fails)

A practical failure decision separates three cases:

1. Retry transient technical failures with bounded exponential backoff and jitter.
2. Start compensation for definite business failures or apply an explicit escalation policy after retries are exhausted.
3. Treat an unknown outcome as unresolved: query status or retry idempotently instead of assuming failure.

A timeout is evidence of missing confirmation, not proof that the remote transaction failed. This distinction prevents a lost response from becoming a duplicate reservation, charge, or refund. [Source](../../sources/notes/distributed-systems/saga-pattern.md#retries-and-failure-classification) [Source](../../sources/notes/distributed-systems/saga-pattern.md#unknown-outcomes-and-idempotency)

## Idempotency and message delivery

Each logical forward action and compensation needs its own stable idempotency key. A workflow or order ID alone may be too broad because one workflow contains several distinct effects; keys such as `order-123:charge-payment` and `order-123:refund-payment` distinguish them. The receiver records the key and outcome so repetition returns the established result without repeating the business effect. [Source](../../sources/notes/distributed-systems/saga-pattern.md#unknown-outcomes-and-idempotency)

The transactional outbox closes the local database-to-message dual-write gap by storing business or SAGA state and an outgoing message in one local transaction. It does not make delivery globally exactly-once. If the publisher sends a message and crashes before marking it sent, it can publish again; consumers therefore still need deduplication through an inbox, processed-message record, or equivalent idempotent effect. [Source](../../sources/notes/distributed-systems/saga-pattern.md#at-least-once-delivery-and-the-outbox-pattern)

For the payment-specific application of stable attempt keys, uncertain provider outcomes, and reconciliation, see [Payment idempotency and double-charge prevention](payment-idempotency-and-double-charge-prevention.md).

## Compensation is business semantics

Compensations often run in reverse order, but their sequence is a domain decision. They can be delayed, costly, visible, or impossible: a refund can settle later, a cancellation can incur a fee, and an email cannot be unsent. The source recommends placing reversible or provisional actions early and irreversible actions late—for example, authorizing before capturing payment. [Source](../../sources/notes/distributed-systems/saga-pattern.md#compensation-semantics)

A failed compensation remains durable work. The system should retain the request, retry asynchronously, pause calls while a dependency is known unhealthy, resume after recovery, and escalate when risk or time thresholds are crossed. A circuit breaker may protect the dependency, but it must not erase the obligation. Some cases legitimately remain pending while an external process, such as refund settlement, completes. [Source](../../sources/notes/distributed-systems/saga-pattern.md#when-compensation-fails)

## Isolation remains limited

Convergence does not prevent observers from acting on intermediate states. A final item can appear unavailable during a reservation that is later compensated, leaving the data ultimately consistent but unable to undo the other customer's decision. Suggested mitigations include expiring reservations, semantic `PENDING` locks, version checks, waitlists, commutative operations, and safer step ordering. These techniques reduce particular anomalies; they do not restore full ACID isolation across services. [Source](../../sources/notes/distributed-systems/saga-pattern.md#isolation-limitation)

## Operational completeness

A shared SAGA or correlation ID should connect commands, events, logs, and traces. Operators need to see the active step, completed work, pending compensation, time in state, operation-specific idempotency keys, and whether human intervention is required. The implementation should test crashes around every state change and publication boundary, not only the happy path. [Source](../../sources/notes/distributed-systems/saga-pattern.md#observability) [Source](../../sources/notes/distributed-systems/saga-pattern.md#implementation-checklist)

## Source assessment

The captured note is a coherent design overview, not evidence that a particular implementation is correct. It supplies no implementation, load model, incident data, or primary references. Its broad statement about exactly-once delivery should always be interpreted relative to a named boundary, and its coordination-style guidance should be treated as a situational heuristic. Product-specific idempotency retention, broker delivery behavior, storage isolation, circuit-breaker semantics, and irreversible-action policy require separate verification.

Primary source: [SAGA Pattern in Distributed Systems](../../sources/notes/distributed-systems/saga-pattern.md)
