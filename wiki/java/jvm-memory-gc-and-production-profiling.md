# JVM Memory, GC, and Production Profiling

## Memory areas and failure classification

The heap contains objects and arrays; metaspace contains class metadata; each platform thread has its own stack. Native-memory consumers also include direct buffers, native libraries, memory-mapped files, JIT code cache, and collector data structures. Static references can point to ordinary heap objects, so “static data lives in metaspace” is an unsafe simplification. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#21-main-jvm-memory-areas)

Interpret the exact `OutOfMemoryError` before selecting a diagnostic. `Java heap space`, `Metaspace`, `Direct buffer memory`, `GC overhead limit exceeded`, and `Unable to create native thread` point in different directions. A heap dump is relevant to heap retention but may not explain native-thread or direct-memory exhaustion. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#22-interpret-the-exact-outofmemoryerror)

## Allocation, promotion, and retention

- Allocation rate is bytes created per unit of time; a stable heap can coexist with high allocation when most objects die young.
- Promotion means objects survived young collections; warm caches and initialization can make this legitimate.
- Post-GC occupancy approximates the live set. A rising post-GC baseline under comparable load is stronger retention evidence than ordinary sawtooth growth.
- Retention analysis compares histograms or dumps, inspects retained size and dominators, and follows suspicious objects to GC roots.

[Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#23-important-gc-measurements) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#26-promotion-versus-retention)

## Choosing diagnostic evidence

| Evidence | Best use |
| --- | --- |
| GC logs | Collection history, frequency, occupancy change, and pause duration |
| JFR | Bounded behavior-over-time profile for CPU, allocation, GC, contention, and I/O |
| Repeated thread dumps | Persistent runnable stacks, loops, blocking, and contention clues |
| Heap dump | Reachable-object snapshot for suspected retention |

Heap dumps may pause or heavily disturb a large JVM, consume disk comparable to the live heap, and expose secrets or personal data. Treat them as sensitive and capture them only when retention evidence justifies the risk. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#27-heap-dump-safety)

## CPU incident sequence

1. Confirm that the Java process is responsible and determine whether one core or the host is saturated.
2. Separate user CPU, system CPU, GC work, and platform throttling.
3. Correlate route mix, latency, errors, retries, queues, downstream behavior, GC, and recent changes.
4. Capture several thread dumps and look for recurring `RUNNABLE` stacks.
5. Record a bounded JFR profile and preserve logs and deployment metadata.
6. If capacity must be restored, drain and restart instances gradually.

Stable total traffic does not exclude request-driven CPU: payload complexity, route mix, retries, or background work may have changed. A restart is mitigation, not proof or repair of the cause. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#3-production-cpu-profiling)
