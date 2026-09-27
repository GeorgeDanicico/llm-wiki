# Java Interview Preparation Summary

## Coverage

The summary compares `HashMap` and `ConcurrentHashMap`, reviews heap reachability and selected JVM runtime areas, explains string pooling and equality, and distinguishes executor services, completable futures, and fork/join work stealing.

## Ideas contributed to the wiki

- [Concurrent in-memory caching](../../java/concurrent-in-memory-caching.md) — map synchronization, null support, iterator consistency, and compound per-key operations.
- [JVM memory, GC, and production profiling](../../java/jvm-memory-gc-and-production-profiling.md) — object reachability, nondeterministic collection timing, and the per-thread PC register.
- [String identity and interning](../../java/strings-and-interning.md) — string literals, `new String`, `==`, `equals()`, and `intern()`.
- [Task execution and fork/join](../../java/task-execution-and-fork-join.md) — executor/future responsibilities, common-pool behavior, splitting, and stealing.
- [Senior Java and Spring interview guide](../../interview-preparation/senior-java-spring-interview-guide.md) — added the new subjects to the category map and review distinctions.

## Source status

The captured file links to Java SE 26 API pages and the Java Language and Virtual Machine specifications. The principal map, future scheduling, fork/join, string interning, and PC-register claims were checked against the linked primary documentation while compiling the wiki pages. Details about modern OpenJDK map internals and work scheduling are implementation-dependent; asynchronous execution defaults should be checked against the target Java release.

Source: [captured chat summary](../../../sources/notes/interview-preparation/java-interview-preparation-summary.md)
