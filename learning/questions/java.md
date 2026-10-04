# Java and JVM

Review questions for the [Java and JVM](../../wiki/java/index.md) topic.

## JAVA-CONC-001 — Why is `counter++` unsafe when `counter` is volatile?

Source: [Concurrency and the Java Memory Model](../../wiki/java/concurrency-and-the-java-memory-model.md)

Expected points:

- Volatile provides visibility and ordering but not mutual exclusion.
- Increment is a compound read-modify-write sequence.
- Two threads can read the same old value and overwrite one another's updates.
- Use an atomic operation or a shared locking protocol for the required invariant.

## JAVA-JVM-001 — What evidence separates high allocation from excessive retention?

Source: [JVM memory, GC, and production profiling](../../wiki/java/jvm-memory-gc-and-production-profiling.md)

Expected points:

- Allocation rate measures bytes created over time.
- High allocation can coexist with a stable live set when most objects die young.
- A rising post-GC occupancy baseline under comparable load suggests retention.
- Dominators and paths to GC roots help explain why retained objects remain reachable.
- Leaving lexical scope alone does not guarantee collectibility when another live reference remains; collection timing is nondeterministic.

## JAVA-CACHE-001 — How can one JVM prevent many callers from loading the same missing cache key?

Source: [Concurrent in-memory caching](../../wiki/java/concurrent-in-memory-caching.md)

Expected points:

- Atomically install one in-flight future per key.
- Later callers share the existing future instead of starting another load.
- Remove the in-flight entry conditionally after success or failure.
- This coordinates only one JVM; lifecycle bounds and cross-instance behavior remain separate concerns.

## JAVA-COL-001 — How do `HashMap` and `ConcurrentHashMap` differ under concurrent access?

Source: [Concurrent in-memory caching](../../wiki/java/concurrent-in-memory-caching.md#hashmap-and-concurrenthashmap)

Expected points:

- `HashMap` is unsynchronized; concurrent access with structural modification requires external synchronization.
- `ConcurrentHashMap` supports concurrent access, rejects `null`, and provides generally nonblocking retrievals.
- Its iterators are weakly consistent; `HashMap` iterators are best-effort fail-fast.
- Use atomic per-key methods for compound updates; separate reads and writes are not atomic.

## JAVA-JVM-002 — What does a Java thread's PC register track, and when is its value undefined?

Source: [JVM memory, GC, and production profiling](../../wiki/java/jvm-memory-gc-and-production-profiling.md#program-counter-register)

Expected points:

- Each Java thread has its own PC register.
- It identifies the current bytecode instruction while executing a Java method.
- The active stack frame identifies the method; the PC tracks execution within it.
- Its value is undefined while the thread executes a native method.

## JAVA-STR-001 — Why can two equal strings have different references, and what does `intern()` do?

Source: [String identity and interning](../../wiki/java/strings-and-interning.md)

Expected points:

- `==` compares reference identity; `String.equals()` compares content.
- Equal literals can share a canonical pooled object.
- `new String("hello")` creates a distinct object with equal content.
- `intern()` returns the canonical pooled string.

## JAVA-EXEC-001 — How do `ExecutorService` and `CompletableFuture` differ, and how can they be used together?

Source: [Task execution and fork/join](../../wiki/java/task-execution-and-fork-join.md#executorservice-and-completablefuture)

Expected points:

- `ExecutorService` runs submitted tasks and manages execution/shutdown.
- `CompletableFuture` represents a result that may arrive later and composes dependent work.
- They are commonly combined by supplying an executor to an async future stage.
- Async stages without an executor normally use the common pool; a non-async stage may run on the completing thread.

## JAVA-EXEC-002 — In fork/join, what decides whether work is split, and what is stolen?

Source: [Task execution and fork/join](../../wiki/java/task-execution-and-fork-join.md#forkjoin-and-work-stealing)

Expected points:

- The task or framework decides when to split; the pool does not automatically split every task.
- An idle worker may steal queued work from another worker or pool submission queue.
- CPU-bound recursive tasks that combine results fit the model well.
- Blocking I/O can occupy workers, and reported steal counts are estimates.
