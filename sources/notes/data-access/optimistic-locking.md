# Capture metadata

- Title: Optimistic locking
- Captured: 2026-09-08
- Source type: User-supplied learning note
- Origin: Local ChatGPT project file `optimistic-locking.md`
- Provenance note: The note is dated September 8, 2026; authorship and independent verification status were not supplied.

---

# Optimistic locking

Learning notes · September 8, 2026

## Core idea

Optimistic locking prevents a save based on stale data from silently overwriting a newer change. Read the record with its version, then update only if that version still matches. A successful update advances the version.

It is useful when conflicts are uncommon, especially when users may keep editing forms open for minutes. The trade-off is that the application must handle rejected saves.

## The lost-update problem

Stock starts at `10`, version `7`:

- Alice receives five units and calculates `15`.
- Bob records two damaged units and calculates `8`.
- Both calculations use the same original stock.
- If Alice saves and then Bob blindly replaces the value, stock becomes `8`. The correct result after both adjustments is `13`.

Wrapping each operation in a transaction does not necessarily prevent this. Under common isolation settings, ordinary reads do not reserve the row against concurrent updates. Actual behavior depends on the database and isolation level.

## Atomic version checking

Alice's save conceptually executes:

```sql
UPDATE product
SET stock = 15, version = version + 1
WHERE product_id = 42 AND version = 7;
```

Alice updates one row, advancing its version to `8`. Bob's update using version `7` then affects zero rows, indicating that his expected state no longer matches.

The version check and write must occur in the same atomic statement. A separate check followed by an unconditional update leaves a race between them.

Optimistic locking does not mean the database uses no locks: writes still take the locks required by the database.

## Retry the intent, not the stale value

Bob's intent is **subtract two**, not **set stock to eight**.

A safe retry should:

1. Start a fresh transaction and reload the current state.
2. Reapply the intended operation to that state.
3. Recheck business rules, such as sufficient stock.
4. Save with the current version and bound the number of retries.

The server may retry internally; a new client request is not always necessary. Do not blindly retry operations with side effects that could be duplicated.

Automatic retries are unsuitable when the application cannot safely reinterpret the user's intent—for example, conflicting edits to the same description. Ask the user to resolve those conflicts.

For a simple stock adjustment, an atomic update can be more direct:

```sql
UPDATE product
SET stock = stock - 2, version = version + 1
WHERE product_id = 42 AND stock >= 2;
```

This subtracts from the current database value and enforces the stock condition in the same statement. Check the affected-row count: zero means the adjustment did not succeed. Version-based optimistic locking is useful when a decision depends on previously read state.

## Optimistic versus pessimistic locking

| Approach | Behavior | Good fit | Main cost |
| --- | --- | --- | --- |
| Optimistic | Allows concurrent work; rejects stale saves | Uncommon conflicts; long-open editing forms | Conflict handling and potentially repeated work |
| Pessimistic | Locks the row during a transaction; competing operations wait | Short transactions where contention makes retries costly | Blocking, resource use, and possible deadlocks |

Do not hold a database transaction and row lock open while a person edits a form for minutes.

## Java / JPA implementation

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

JPA checks the version during an entity update and reports an optimistic-locking failure if it no longer matches. Relevant writers must consistently participate in version management; direct updates that bypass it can undermine protection.

### Common mistake: losing the form's original version

If the server reloads the latest entity, copies all fields from an old form, and saves, `@Version` alone does not detect that the form was stale. JPA knows the version the server just loaded.

Include the original version in the form request and compare it with the loaded entity before applying changes. JPA's atomic version check then protects against another update occurring between the server's load and save.

## Resolving edits to different fields

Two agents open customer version `12`. One changes the address and saves version `13`; the other submits a phone-number change along with the old address.

Reject the second save as stale and preserve the agent's edits. To reconcile intelligently, compare:

- The original form values.
- The submitted edits.
- The current database values.

This three-way comparison can identify non-overlapping edits. Merge only if business rules allow it, then save against the current version again. A version number detects a conflict; it does not identify changed fields or provide historical values by itself.

## Review questions

1. **What does optimistic locking prevent?** Silent overwrites based on stale state, when relevant writers participate in version checking.
2. **Why must the check and update be atomic?** Another writer could otherwise change the row between the check and the write.
3. **Does `@Version` alone protect a long-open form?** No. Carry and validate the version originally shown to the user.
4. **When can an operation be retried automatically?** When its intent can safely be reapplied to fresh state, business rules are rechecked, and retries are bounded.
5. **When might pessimistic locking be appropriate?** In short transactions where waiting is preferable to frequent conflicts and retries.

## Main takeaway

Preserve the user's intent, detect stale state, and choose a conflict response appropriate to the operation.

Optional next topic: **Idempotency keys—preventing duplicate effects when requests are retried.**
