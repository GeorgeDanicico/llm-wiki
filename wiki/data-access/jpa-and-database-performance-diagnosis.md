# JPA and Database Performance Diagnosis

## Start with one request

Trace a representative slow request and separate connection acquisition, SQL execution, Hibernate hydration, application mapping, and serialization. Use realistic parameters and result sizes; a query that is fast for ten rows may behave differently at production cardinality. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#71-start-with-a-trace-of-one-slow-request)

## Evidence table

| Evidence | Likely direction |
| --- | --- |
| Repeated normalized child queries with different IDs | N+1 |
| Few queries but very large row or entity count | Over-fetching or join multiplication |
| Slow connection acquisition | Pool saturation, long-held connections, or a leak |
| Fast acquisition and slow SQL span | Query plan, lock wait, I/O, or database CPU |
| Database identifies a blocker and waiter | Lock contention |
| Plan examines many rows to return few | Missing or ineffective index |
| Serialization dominates | API shape or object-graph problem |

[Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#77-diagnostic-decision-table)

## N+1 and over-fetching

An entity relationship reveals N+1 risk but does not prove the executed pattern. Confirm it by counting SQL statements for one request, grouping normalized query shapes, and measuring database time and loaded entities. Lazy traversal during DTO mapping or serialization can trigger it; eager mapping can still issue secondary selects. Fetch joins, entity graphs, batch fetching, and DTO projections are possible corrections, each with query-shape trade-offs. Collection fetch joins can multiply rows and conflict with pagination. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#72-n1-queries)

Database over-fetching includes unnecessary columns, associations, rows, duplicate join rows, and excessive entity hydration. API over-fetching means producing response fields or deeply serialized graphs that the client does not use. Compare selected columns, returned rows, hydrated objects, mapping work, payload size, and serialization cost. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#73-over-fetching)

## Locks, indexes, and pools

High p99 latency is a clue, not lock proof. Confirm contention with waiter and blocker sessions, wait types, transaction ages, statements, and deadlock reports. Because lock evidence can disappear after a commit, prepare historical wait sampling and long-transaction telemetry before the incident. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#74-database-locking)

Confirm an index problem with an execution plan using representative parameters. Examine scans, rows read versus returned, joins, sorts, filters, estimates, and composite-key order. Adding indexes blindly increases storage and write-maintenance cost. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#75-missing-indexes)

Pool exhaustion is supported by active connections near the maximum, no idle connections, pending acquisition, rising acquisition duration, and timeouts. Increasing pool size can intensify database overload when slow queries or long transactions are the cause. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#76-connection-pool-exhaustion)
