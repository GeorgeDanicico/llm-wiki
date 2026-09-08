# Optimistic Locking

## Core idea and lost updates

Optimistic locking rejects a save based on an outdated version instead of silently overwriting newer state. Read the record and version together, then update only if that version still matches; a successful write advances the version. Every relevant writer must participate in version management. [Source](../../sources/notes/data-access/optimistic-locking.md#core-idea) [Writer participation](../../sources/notes/data-access/optimistic-locking.md#java--jpa-implementation)

For example, stock is `10` at version `7`. Alice adds five and calculates `15`; Bob subtracts two from the same original state and calculates `8`. If both blindly replace the value, Bob's later save leaves `8` instead of `13`. Separate transactions do not necessarily prevent this: ordinary reads under common isolation settings do not reserve the row, and actual behavior depends on the database and isolation level. [Source](../../sources/notes/data-access/optimistic-locking.md#the-lost-update-problem)

## Atomic version checking

Alice's save can be expressed as:

```sql
UPDATE product
SET stock = 15, version = version + 1
WHERE product_id = 42 AND version = 7;
```

One affected row means Alice advanced the version to `8`. Bob's subsequent update with version `7` affects zero rows because his expected state no longer matches. The check and write must be one atomic statement: checking first and then writing unconditionally leaves a race. Optimistic locking still uses the database's required write locks. [Source](../../sources/notes/data-access/optimistic-locking.md#atomic-version-checking)

## Retry the operation's intent

Bob intends to **subtract two**, not **set stock to eight**. A safe retry starts a fresh transaction, reloads current state, reapplies that intent, rechecks business rules, and saves with the current version. Bound retries and avoid duplicating side effects. The server can perform this retry internally; a new client request is not always needed. If intent cannot be safely reapplied, as with competing description edits, ask the user to resolve the conflict. [Source](../../sources/notes/data-access/optimistic-locking.md#retry-the-intent-not-the-stale-value)

For a simple adjustment, the source offers a direct atomic update:

```sql
UPDATE product
SET stock = stock - 2, version = version + 1
WHERE product_id = 42 AND stock >= 2;
```

This operates on current database state and enforces sufficient stock in the same statement. Check the affected-row count; zero means the adjustment failed. Version-based checking is useful when a decision depends on previously read state. [Source](../../sources/notes/data-access/optimistic-locking.md#retry-the-intent-not-the-stale-value)

## Choosing optimistic or pessimistic locking

| Approach | Behavior | Suitable circumstances | Cost |
| --- | --- | --- | --- |
| Optimistic | Allows concurrent work and rejects stale saves | Uncommon conflicts or long-open forms | Conflict handling and repeated work |
| Pessimistic | Holds a row lock during a transaction; competitors wait | Short transactions where contention makes retries costly | Blocking, resource use, possible deadlocks |

Do not keep a database transaction and row lock open while a person edits a form for minutes. These choices are guidance from the captured note, not measured contention thresholds. [Source](../../sources/notes/data-access/optimistic-locking.md#optimistic-versus-pessimistic-locking)

## JPA and long-open forms

The note illustrates entity version management with:

```java
@Entity
class Customer {
    @Id
    private Long id;

    @Version
    private Long version;

    private String shippingAddress;
    private String phoneNumber;
}
```

JPA checks the version during an entity update and reports an optimistic-locking failure on a mismatch. Direct writes that bypass version management can undermine this protection. [Source](../../sources/notes/data-access/optimistic-locking.md#java--jpa-implementation)

A common mistake is reloading the latest entity and copying every field from an old form onto it. JPA then knows the freshly loaded version, so `@Version` alone does not detect that the submitted form was stale. Carry the original form version in the request and compare it with the loaded entity before applying changes. JPA's atomic check still protects against a concurrent update between that load and save. [Source](../../sources/notes/data-access/optimistic-locking.md#common-mistake-losing-the-forms-original-version)

## Reconciling different field edits

If two agents open customer version `12`, an address change saved as version `13` makes the other agent's form stale even when they intended only a phone-number edit. Reject the stale save and preserve their edits. Compare the original form values, submitted edits, and current database values to identify non-overlapping changes. Merge only when business rules permit, then save against the current version again. A version number detects a conflict; it does not supply changed-field information or historical values. [Source](../../sources/notes/data-access/optimistic-locking.md#resolving-edits-to-different-fields)

## Source status and related knowledge

This page synthesizes the supplied learning note without independent external verification. Database isolation behavior and concrete JPA behavior require confirmation for the chosen implementation. The source does not specify an implementation-specific exception/retry recipe or provide measurements for choosing a locking strategy. No conflicting claim was found in the related wiki material during ingestion.

Related pages: [JPA and database performance diagnosis](jpa-and-database-performance-diagnosis.md), [Spring transactions, beans, and scopes](../frameworks/spring-transactions-beans-and-scopes.md), and [Payment idempotency and double-charge prevention](../distributed-systems/payment-idempotency-and-double-charge-prevention.md).
