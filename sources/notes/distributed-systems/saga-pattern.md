# Capture metadata

- Captured: 2026-09-05
- Source type: User-supplied technical note
- Origin: Local ChatGPT project file `SAGA-pattern.md`
- Provenance note: Authorship and independent verification status were not supplied.

---

# SAGA Pattern in Distributed Systems

## Overview

The **SAGA pattern** coordinates a business operation that spans multiple services and databases without relying on one distributed ACID transaction.

A SAGA divides the workflow into a sequence of **local transactions**. Each service commits its own transaction and then advances the workflow. If a later step fails, the system executes **compensating transactions** for the earlier completed steps.

```text
Forward flow:
Reserve flight -> Reserve hotel -> Charge payment

If payment fails:
Cancel hotel -> Cancel flight
```

A compensation is a new business operation, not a database rollback. The original operation happened and may have been visible to other processes.

## Why SAGA Is Needed

In a monolithic system with one database, a transaction can usually guarantee that either every change commits or none does. In a distributed system:

- Services often own separate databases.
- Local transactions may already be committed before another service fails.
- Network failures can make an operation's outcome unknown.
- Holding locks across multiple services is slow and fragile.

SAGA trades immediate consistency and isolation for **eventual consistency and recoverability**.

## Coordination Styles

### Orchestration

A central orchestrator stores the SAGA state and sends commands to participating services.

```text
Trip orchestrator
  -> Reserve flight
  <- Flight reserved
  -> Reserve hotel
  <- Hotel failed
  -> Cancel flight
```

Advantages:

- The business flow is explicit and easier to understand.
- Monitoring, tracing, and incident investigation are simpler.
- Complex workflows and conditional steps are easier to manage.

Tradeoffs:

- The orchestrator is an important infrastructure component.
- It can accumulate too much business logic.
- It must be durable and horizontally scalable.

The orchestrator does not need to be a single process. Multiple workers can share durable state and partition work by SAGA ID.

### Choreography

Services publish events and react to events from other services, without a central coordinator.

```text
TripRequested
  -> FlightReserved
  -> HotelReservationFailed
  -> FlightCancellationRequested
```

Advantages:

- Loose coupling between services.
- No central workflow component.
- Suitable for short, simple event flows.

Tradeoffs:

- The complete business flow is distributed across handlers.
- Adding services can make dependencies difficult to understand.
- Tracing production failures across many services is harder.
- Event cycles and unintended interactions become more likely.

As a rule of thumb, choreography works well for simple flows; orchestration is often clearer for long or complex workflows.

## Durable SAGA State

The orchestrator should persist every meaningful transition. Logs and traces improve observability, but they are not the source of truth for the workflow.

Example successful path:

```text
STARTED
-> FLIGHT_RESERVED
-> HOTEL_RESERVED
-> PAYMENT_CAPTURED
-> COMPLETED
```

Example failed path:

```text
HOTEL_FAILED
-> FLIGHT_CANCELLATION_PENDING
-> FLIGHT_CANCELLED
-> COMPENSATED
```

Do not mark a SAGA as `COMPENSATED` until every required compensation is confirmed.

## Retries and Failure Classification

Different failures require different responses:

```text
Transient technical error  -> Retry with exponential backoff and jitter
Definite business failure  -> Begin compensation
Retries exhausted          -> Begin compensation or escalate
Unknown outcome            -> Query status or retry idempotently
```

Retries are appropriate for temporary failures such as timeouts or brief service unavailability. Permanent business failures, such as no hotel availability, should not be retried repeatedly.

## Unknown Outcomes and Idempotency

A timeout does not prove that an operation failed. A service may have completed its transaction while its response was lost.

For example, blindly retrying a successful hotel reservation could book two rooms. Every operation should therefore use a stable **idempotency key**.

```text
order-123:reserve-inventory
order-123:charge-payment
order-123:refund-payment
order-123:release-inventory
```

The receiving service stores the key and its result. When the same request arrives again, it returns the original result without repeating the business effect.

An order ID is useful for correlation, but it is often too broad as an idempotency key because one order has several distinct operations.

Compensations must also be idempotent. A repeated `CancelReservation` or `RefundPayment` command must not cancel or refund twice.

## At-Least-Once Delivery and the Outbox Pattern

Exactly-once message delivery is generally difficult across network boundaries. A practical design uses:

- At-least-once delivery
- Idempotent consumers
- Durable message records

The **transactional outbox pattern** prevents a service from updating its database but failing to publish the corresponding message.

In one local database transaction, the service writes:

1. Its new business or SAGA state.
2. The outgoing message to an outbox table.

A separate publisher sends unsent outbox messages. If it crashes after publishing but before marking a message as sent, it may publish the message again. Consumers must therefore deduplicate messages, often through an inbox or processed-message table.

## Compensation Semantics

Compensations usually run in reverse order, but the exact sequence is a business decision.

```text
Forward:
Reserve inventory -> Charge payment -> Arrange shipment

Shipment failure:
Refund payment -> Release inventory
```

Compensation is imperfect:

- A refund may take several days.
- A cancellation may incur a fee.
- A confirmation email cannot be unsent.
- Another user may have observed an intermediate reservation.
- Some operations may be legally or physically irreversible.

Prefer reversible or provisional actions early in the workflow and irreversible actions late. For example, authorize a payment before capturing it, and send confirmation only after critical steps succeed.

## When Compensation Fails

A failed compensation must remain visible and durable.

If flight cancellation cannot be completed, use a state such as:

```text
BOOKING_FAILED -> FLIGHT_CANCELLATION_PENDING
```

The system should:

- Report that the original workflow failed and resolution is pending.
- Persist the compensation request.
- Retry asynchronously with backoff.
- Use a circuit breaker while the dependency is unhealthy.
- Resume queued work when the dependency recovers.
- Alert operators when an SLA, retry, time, or financial-risk threshold is crossed.
- Escalate ambiguous or long-running cases for manual intervention.

A circuit breaker pauses calls to an unhealthy service; it must not discard the outstanding compensation. In the half-open state, limited probe calls determine whether normal processing can resume.

If a payment provider has accepted a refund but settlement takes two days, the SAGA may remain `REFUND_PENDING`. This is normal asynchronous processing rather than necessarily a technical failure.

## Isolation Limitation

SAGA provides eventual consistency but does not provide the isolation of a single database transaction.

Example:

1. A SAGA reserves the final item in stock.
2. Another customer sees the item as unavailable and leaves.
3. The SAGA later fails and releases the item.

The final data is consistent, but another user observed and acted on an intermediate state.

Possible mitigations include:

- Short-lived reservations with expiration.
- Semantic locks, such as a `PENDING` status with restricted operations.
- Version checks to reject stale updates.
- Waitlists and back-in-stock notifications.
- Designing operations to be commutative where possible.
- Reordering steps to reduce risky intermediate states.

## Observability

Use one SAGA or correlation ID across commands, events, logs, and traces. Operators should be able to answer:

- Which step is currently active?
- Which steps completed?
- Which compensation is pending?
- How long has the SAGA been in its current state?
- Which idempotency key belongs to each operation?
- Does the case require human intervention?

Observability helps diagnose a workflow, but durable SAGA state remains the source of truth.

## When to Use SAGA

SAGA is a good fit when:

- A business workflow spans independent services or databases.
- Temporary inconsistency is acceptable.
- Completed actions have meaningful compensations.
- The workflow may need to continue after the original request ends.

SAGA is a poor fit when:

- Strict atomicity and isolation are mandatory.
- Intermediate states must never be visible.
- Important actions cannot be compensated.
- A simpler local transaction or service boundary would solve the problem.

## Implementation Checklist

- Define every forward operation and its compensation.
- Persist SAGA state before relying on it for recovery.
- Give each logical operation a stable idempotency key.
- Make forward actions and compensations idempotent.
- Distinguish transient, permanent, and unknown failures.
- Use bounded retries with exponential backoff and jitter.
- Use transactional outbox and consumer deduplication where needed.
- Add timeouts, circuit breakers, and recovery policies.
- Define pending-compensation and manual-intervention states.
- Design for isolation anomalies and intermediate-state visibility.
- Carry a correlation ID through logs and distributed traces.
- Test crashes before and after every state change and message publication.

## Mental Model

```text
Persist state
-> Execute a local transaction
-> Advance the workflow
-> On failure, execute compensating transactions
-> Retry idempotently
-> Keep unresolved compensation visible
```

The SAGA pattern does not make a distributed workflow atomic. It makes partial failure explicit, durable, recoverable, and operationally manageable.
