# Capture metadata

- Title: Java Interview Preparation Summary
- Captured: 2026-09-27
- Source type: User-supplied chat summary
- Origin: Local ChatGPT project file `java-interview-prep-summary.md`
- Provenance note: The source includes Java SE 26 API and specification links; authorship and independent verification status were not supplied.

---

# Java Interview Preparation Summary

## 1. `HashMap` vs. `ConcurrentHashMap`

- `HashMap` is not synchronized. If multiple threads access it and at least one modifies it, synchronize externally.
- `ConcurrentHashMap` is designed for concurrent access. Reads generally do not block and can overlap updates. Updates are coordinated internally; modern OpenJDK uses fine-grained mechanisms rather than one global map lock.
- `ConcurrentHashMap` rejects `null` keys and values; `HashMap` permits them.
- `HashMap` iterators are fail-fast on a best-effort basis. `ConcurrentHashMap` iterators are weakly consistent and do not throw `ConcurrentModificationException` due to concurrent updates.
- Use atomic methods such as `putIfAbsent`, `computeIfAbsent`, and `merge` for compound per-key operations. A separate `get`/check followed by `put` is not atomic.

References: [HashMap API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/HashMap.html), [ConcurrentHashMap API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)

## 2. Java memory management and JVM memory areas

Java manages object memory automatically. The garbage collector can reclaim objects that are no longer reachable from GC roots, such as references held by live threads or JVM internals. Becoming out of lexical scope alone does not necessarily make an object collectible if another reference still reaches it. Collection timing is nondeterministic.

- **Heap:** shared between threads; holds objects and arrays and is the main target of garbage collection.
- **Thread stacks:** each thread has method frames, local variables, intermediate values, and references. A reference can be in a frame while its object is on the heap.
- **Method area / Metaspace:** the JVM specification describes a logical shared method area for class-level structures. In HotSpot, class metadata is stored in native memory called Metaspace (PermGen was removed in JDK 8). Classes and metadata can be unloaded/reclaimed when their class loaders become unloadable.
- **PC register:** one per Java thread; tracks the current bytecode instruction for the active method.
- **Native method stack:** supports native methods, such as JNI calls.

Reference: [JVM specification, runtime data areas](https://docs.oracle.com/javase/specs/jvms/se26/html/jvms-2.html)

## 3. PC register

The PC register is not a memory region and does not identify the current method; the active stack frame does that. Each Java thread has a PC register that tracks the bytecode instruction being executed in its current method. Its value is undefined while executing a native method.

**Interview answer:** “Each Java thread has a PC register that tracks the current bytecode instruction in the method it is executing.”

## 4–5. String Pool vs. heap; `new String("hello")`

The String Pool is not a separate memory area from the heap. It is the canonicalization pool/table for shared string instances; in modern JVMs, the `String` objects themselves are on the heap. String literals and compile-time string constants are interned.

```java
String a = "hello";
String b = "hello";
String c = new String("hello");

a == b          // true: same pooled object
a == c          // false: separate String object
a.equals(c)     // true: same contents
c.intern() == a // true: returns canonical pooled string
```

So `new String("hello")` uses the pooled literal as its input and creates an additional distinct `String` object.

References: [JLS, string literals and interning](https://docs.oracle.com/javase/specs/jls/se26/jls26.pdf), [String API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/lang/String.html)

## 6. `==` vs. `.equals()` for strings

- `==` compares object identity: whether the references point to the same object. It does not compare physical memory addresses directly.
- `String.equals()` compares string contents.

Use `.equals()` when comparing text.

## 7. `ExecutorService` vs. `CompletableFuture`

They serve different roles and are commonly used together.

- **`ExecutorService`** submits/runs tasks and manages execution and shutdown. A thread pool is a common implementation; threads do not necessarily all start when the application starts. `ScheduledExecutorService` is the scheduling-specific interface.
- **`CompletableFuture<T>`** represents a result that may be completed later and lets you chain, combine, and handle outcomes of dependent computations.
- Async `CompletableFuture` methods without an explicit executor normally use the shared `ForkJoinPool.commonPool()`. Supplying an executor gives control over where those stages run.
- Non-async methods such as `thenApply` may execute on the thread that completes the prior stage.

```java
ExecutorService executor = Executors.newFixedThreadPool(4);

CompletableFuture<User> user =
    CompletableFuture.supplyAsync(() -> loadUser(id), executor)
                     .thenApply(this::enrichUser);
```

References: [ExecutorService API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/ExecutorService.html), [CompletableFuture API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/CompletableFuture.html)

## 8. Fork/join and work stealing

`ForkJoinPool` is itself an `ExecutorService`. The usual comparison is with a general-purpose pool such as `ThreadPoolExecutor`.

- **Splitting** creates multiple tasks; the task or framework decides to split. The pool does not automatically divide every task.
- **Stealing** redistributes already queued work: a worker that runs out of work may take a task submitted to the pool or created by another active worker.
- Fork/join pools are especially effective for CPU-bound tasks that produce smaller subtasks and combine their results.
- A pool can also run independent `Runnable` jobs. Those jobs need not split recursively; if submitted by a pool worker, another worker may steal one from its queue. Which job is stolen is scheduler-dependent.
- Blocking I/O can occupy common-pool workers, so use an appropriate explicit executor for blocking workloads.

The recursive sum example used the common pattern: `left.fork()`, compute the right side locally, then `left.join()`. The nonrecursive example had one worker submit many independent `Runnable` jobs and logged when a different worker ran one. `ForkJoinPool.getStealCount()` is an estimate.

Reference: [ForkJoinPool API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/ForkJoinPool.html)
