# Java Task Execution: Executors, Futures, and Fork/Join

## `ExecutorService` and `CompletableFuture`

`ExecutorService` submits and runs tasks and provides lifecycle controls for the execution service. A thread pool is a common implementation; its worker threads need not all start when the application starts. `ScheduledExecutorService` is the scheduling-specific interface. [ExecutorService API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/ExecutorService.html) [Source](../../sources/notes/interview-preparation/java-interview-preparation-summary.md)

`CompletableFuture<T>` represents a result that may be available later and supports composing dependent computations and handling their outcomes. It is common to use the two together: the executor chooses where asynchronous work runs, while the future represents and composes its result. [ExecutorService API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/ExecutorService.html) [CompletableFuture API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/CompletableFuture.html) [Source](../../sources/notes/interview-preparation/java-interview-preparation-summary.md)

```java
ExecutorService executor = Executors.newFixedThreadPool(4);

CompletableFuture<User> user =
    CompletableFuture.supplyAsync(() -> loadUser(id), executor)
                     .thenApply(this::enrichUser);
```

Async `CompletableFuture` methods without an explicit executor normally use the shared `ForkJoinPool.commonPool()`. A non-async continuation such as `thenApply` may run on the thread that completes the previous stage. Supply an executor when the work needs a deliberate execution resource, especially for blocking I/O. [CompletableFuture API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/CompletableFuture.html) [Source](../../sources/notes/interview-preparation/java-interview-preparation-summary.md)

## Fork/join and work stealing

`ForkJoinPool` is an `ExecutorService` intended for tasks that can split work into smaller subtasks and combine their results. The task or framework decides when to split; the pool does not automatically divide every submitted task. When a worker runs out of local work, it may steal queued work submitted to the pool or created by another worker. [ForkJoinPool API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/ForkJoinPool.html) [Source](../../sources/notes/interview-preparation/java-interview-preparation-summary.md)

The model is especially effective for CPU-bound recursive work. Independent `Runnable` jobs can also run in the pool without recursive splitting; work stealing may occur when jobs are submitted by a pool worker, though which job runs on which worker is scheduler-dependent. `getStealCount()` is an estimate. Blocking I/O can occupy shared-pool workers, so use an executor suited to blocking workloads. [ForkJoinPool API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/util/concurrent/ForkJoinPool.html) [Source](../../sources/notes/interview-preparation/java-interview-preparation-summary.md)
