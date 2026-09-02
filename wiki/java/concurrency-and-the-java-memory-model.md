# Concurrency and the Java Memory Model

## Visibility, exclusion, and atomicity

`volatile` publishes a value with visibility and ordering guarantees. It does not provide mutual exclusion, so a read-modify-write expression such as `counter++` can still lose updates. Use it for simple publication such as a stop flag, not for a multi-field invariant or check-then-act workflow. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#11-volatile)

`synchronized` provides exclusive execution for code using the same monitor, establishes visibility between monitor release and later acquisition, and is reentrant. An instance synchronized method locks that instance; a static synchronized method locks the `Class` object. The resource is safe only when every relevant access follows the same locking protocol. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#12-synchronized)

Atomic classes use operations such as compare-and-set to make a single state transition atomic. They are suitable for independent counters or immutable-state replacement, but separate atomic variables do not automatically preserve a shared invariant. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#14-atomic-classes)

## Selection guide

| Requirement | Typical mechanism |
| --- | --- |
| Publish a simple state flag | `volatile` |
| Increment one counter atomically | `AtomicInteger` or `LongAdder` |
| Protect a multi-step invariant | `synchronized` or `Lock` |
| Replace immutable state conditionally | Atomic compare-and-set |
| Coordinate independent processes | Database, operating-system, or distributed coordination mechanism |

Ordinary Java mutual exclusion coordinates threads, not separate processes. A process-wide or distributed invariant needs a shared coordination boundary. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#13-mutual-exclusion)

## Interview traps

- “The field is volatile” does not make a compound update atomic.
- Two synchronized methods exclude each other only when they use the same monitor.
- A concurrent data structure does not automatically make the objects stored inside it thread-safe.
- An atomic variable does not protect an invariant involving unrelated state.
