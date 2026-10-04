# Data access

Review questions for the [Data access](../../wiki/data-access/index.md) topic.

## DATA-OL-001 — What does optimistic locking prevent, and why must the version check and update be atomic?

Source: [Optimistic locking](../../wiki/data-access/optimistic-locking.md)

Expected points:

- It prevents silent overwrites based on stale state when relevant writers participate in version management.
- The write checks the expected version and advances it on success.
- A separate check and unconditional write leave a race; a stale version affects zero rows.
- Database write locks still exist.

## DATA-OL-002 — Why does JPA @Version alone not protect a long-open form?

Source: [Optimistic locking](../../wiki/data-access/optimistic-locking.md)

Expected points:

- Reloading the latest entity gives JPA the current version even when submitted form values are stale.
- Carry the original form version and compare it before applying changes.
- The atomic JPA version check protects against changes between the server load and save.

## DATA-OL-003 — After a stock-update conflict, what should be retried and when is automatic retry unsuitable?

Source: [Optimistic locking](../../wiki/data-access/optimistic-locking.md)

Expected points:

- Reload current state in a fresh transaction and reapply subtract two rather than the stale value eight.
- Recheck business rules, use the current version, and bound retries.
- Avoid duplicate side effects; the server can retry internally.
- Use user conflict resolution when intent cannot be safely reapplied.

## DATA-OL-004 — When might pessimistic locking or a direct atomic adjustment be preferable?

Source: [Optimistic locking](../../wiki/data-access/optimistic-locking.md)

Expected points:

- Pessimistic locking can suit short transactions when contention makes optimistic retries costly.
- Its costs include blocking, resource use, and possible deadlocks; do not hold locks during human editing.
- A conditional atomic stock decrement operates on current state and checks sufficient stock.
- Check the affected-row count; version checking suits decisions based on previously read state.

## DATA-OL-005 — What information is needed to reconcile non-overlapping form edits?

Source: [Optimistic locking](../../wiki/data-access/optimistic-locking.md)

Expected points:

- Original form values, submitted edits, and current database values enable a three-way comparison.
- Reject the stale save and preserve edits; merge only if business rules allow it.
- Save against the current version again.
- A version number alone does not identify changed fields or preserve historical values.

## DATA-JPA-001 — How do you prove N+1 instead of inferring it from entity mappings?

Source: [JPA and database performance diagnosis](../../wiki/data-access/jpa-and-database-performance-diagnosis.md)

Expected points:

- Trace one representative request.
- Count executed SQL statements and group normalized query shapes.
- Look for repeated child queries with varying identifiers.
- Measure database time, entity loading, mapping, and serialization before choosing a correction.
