---
source_id: codex-interview-preparation-java-spring-20260829
source_type: synthesized-interview-notes
title: Senior Java and Spring Boot Interview Knowledge
captured_at: 2026-08-29T00:00:00+03:00
author: George and Codex
topics:
  - java
  - jvm
  - concurrency
  - garbage-collection
  - profiling
  - spring-boot
  - transactions
  - dependency-injection
  - caching
  - jpa
  - database-performance
  - resilience
  - observability
  - kafka
  - distributed-systems
  - payments
  - interview-preparation
---

# Senior Java and Spring Boot Interview Knowledge

## Purpose

This document consolidates a senior-level Java and Spring Boot interview discussion.
It is designed as source material for a local LLM wiki. It contains corrected
technical explanations, production diagnostic playbooks, code examples, design
tradeoffs, common mistakes, and interview questions.

The central senior-engineering theme is to distinguish:

- a useful clue from proof of a root cause;
- an individual operation from a compound operation;
- an in-process guarantee from a distributed guarantee;
- a mitigation from a permanent correction;
- framework behavior from business correctness.

---

# 1. Java concurrency and the Java Memory Model

## 1.1 `volatile`

A write to a `volatile` variable is visible to threads that subsequently read that
variable. Volatile access also creates ordering guarantees: operations before a
volatile write cannot be freely reordered after it, and operations after a volatile
read cannot be freely reordered before it.

This makes `volatile` appropriate for simple state publication, such as a stop flag:

```java
final class Worker implements Runnable {
    private volatile boolean running = true;

    public void stop() {
        running = false;
    }

    @Override
    public void run() {
        while (running) {
            doWork();
        }
    }
}
```

Volatile does **not** provide mutual exclusion, and it does not make compound
read-modify-write operations atomic:

```java
private volatile int counter;

counter++; // read, add, write: not atomic
```

Two threads can read the same old value and overwrite one another's increments.

Volatile is insufficient for:

- counters updated by multiple threads;
- check-then-act logic;
- maintaining an invariant across multiple fields;
- compound state transitions that depend on the previous value.

## 1.2 `synchronized`

`synchronized` provides:

- mutual exclusion for code using the same monitor;
- memory visibility when a monitor is released and later acquired;
- reentrancy, meaning a thread holding a monitor may acquire it again.

It can protect a block:

```java
synchronized (accountLock) {
    account.debit(amount);
}
```

Or a method:

```java
public synchronized void increment() {
    counter++;
}
```

A synchronized instance method locks `this`. Two synchronized instance methods
exclude one another only when invoked on the same object instance.

A static synchronized method locks the corresponding `Class` object:

```java
public static synchronized void updateGlobalState() {
    // Locks MyClass.class
}
```

Synchronization does not magically protect a resource. Every access that relies on
the invariant must follow the same locking protocol. Code that ignores the lock may
still read or mutate the resource.

## 1.3 Mutual exclusion

In ordinary Java concurrency, mutual exclusion applies to threads, not operating
system processes. It means that only one thread at a time may execute the critical
section guarded by a particular lock.

Cross-process mutual exclusion requires a different mechanism, such as:

- an operating-system mutex or file lock;
- a database row or advisory lock;
- a distributed lock service;
- a compare-and-set operation in a shared datastore.

## 1.4 Atomic classes

Classes such as `AtomicInteger` provide atomic single-variable operations:

```java
AtomicInteger counter = new AtomicInteger();
counter.incrementAndGet();
```

They typically use compare-and-set (CAS), not a traditional blocking lock. A thread
attempts to replace an observed value only if it has not changed. Under contention,
the thread may retry.

Atomic classes are useful for independent state transitions, but they do not
automatically maintain an invariant spanning multiple unrelated values.

## 1.5 Choosing between the mechanisms

| Requirement | Typical mechanism |
|---|---|
| Publish a simple flag | `volatile` |
| Atomically increment one counter | `AtomicInteger` or `LongAdder` |
| Protect a multi-step invariant | `synchronized` or `Lock` |
| Coordinate state transitions | Atomic compare-and-set, lock, or immutable replacement |
| Coordinate processes | Database, OS, or distributed coordination mechanism |

## Interview questions

1. What are the differences between `volatile`, `synchronized`, and
   `AtomicInteger`?
2. Why is `counter++` unsafe even if `counter` is volatile?
3. What does it mean for synchronized code to use the same monitor?
4. Do two synchronized methods on two different instances exclude one another?
5. How would you maintain an invariant involving two fields?
6. How is mutual exclusion between threads different from mutual exclusion between
   processes?

---

# 2. JVM memory, garbage collection, and memory diagnostics

## 2.1 Main JVM memory areas

### Heap

The heap contains object instances and arrays and is shared by application threads.
Garbage collectors reclaim heap objects that are no longer reachable.

### Metaspace

Metaspace contains class metadata and uses native memory. It replaced PermGen in
modern HotSpot JVMs.

It is inaccurate to say that every static field value is stored in metaspace. Class
metadata belongs in metaspace, while reference-valued static fields ultimately refer
to ordinary heap objects. JIT-compiled machine code is stored in the code cache.

### Thread stacks

Each Java thread has its own stack containing stack frames, local variables, operand
stacks, and execution state. A very high number of platform threads may consume
substantial native memory through their stacks.

### Additional areas and native memory

- program-counter state and native method stacks;
- JIT code cache;
- direct byte buffers;
- JNI allocations and native libraries;
- memory-mapped files;
- garbage-collector data structures.

An `OutOfMemoryError` is therefore not always a Java-heap problem.

## 2.2 Interpret the exact `OutOfMemoryError`

Examples include:

- `Java heap space`;
- `Metaspace`;
- `Direct buffer memory`;
- `GC overhead limit exceeded`;
- `Unable to create native thread`.

The exact message changes the investigation. A heap dump may help for heap retention,
but not necessarily for native-thread exhaustion or direct-memory exhaustion.

## 2.3 Important GC measurements

### Allocation rate

Allocation rate is normally measured in bytes per unit of time, such as MB/s. It is
not merely the number of objects created. A stable heap can coexist with a very high
allocation rate if most objects die young.

### Heap occupancy

Heap occupancy is the amount of used heap. The most informative trend is often the
post-GC occupancy, which approximates the live set.

### Pause duration

Pause duration is the time application threads were stopped for a GC phase. With a
concurrent collector, total collector work and CPU consumption may be much larger
than the stop-the-world pause time.

### GC frequency

Measure how often different collection types occur. Terminology depends on the
collector. With G1, relevant events include:

- young evacuation pauses;
- concurrent marking cycles;
- mixed collections, which include selected old regions;
- full collections.

### Example GC log line

```text
GC(42) Pause Young (G1 Evacuation Pause) 800M->120M(2048M) 12.3ms
```

This means:

- it was a young collection;
- used heap went from 800 MB to 120 MB;
- configured/committed capacity shown was 2048 MB;
- the pause lasted 12.3 ms.

## 2.4 GC logging

For modern HotSpot JVMs, configure unified GC logging at startup to retain the
history that led to an incident:

```text
-Xlog:gc*:file=gc.log:time,uptime,level,tags
```

Logging can also be configured dynamically on supported JVMs:

```text
jcmd <pid> VM.log output=/path/to/gc.log what='gc*=info'
```

Dynamic activation cannot recover events that happened before it was enabled.

Age information can help investigate object survival and promotion:

```text
-Xlog:gc+age=trace
```

## 2.5 Java Flight Recorder

JFR is appropriate for collecting a bounded, relatively low-overhead production
profile:

```text
jcmd <pid> JFR.start \
  name=incident \
  settings=profile \
  duration=5m \
  filename=/path/to/incident.jfr
```

Open the recording with JDK Mission Control and inspect:

- allocation rate and allocation sites;
- execution samples and hot methods;
- GC events and pauses;
- thread contention and thread states;
- file and socket operations;
- old-object samples when specifically configured.

A JFR recording explains behavior over time. A heap dump is a snapshot of reachable
objects at one moment.

## 2.6 Promotion versus retention

### Rapid promotion

Promotion means that objects survive young collections and become part of the old
generation or long-lived region set.

Evidence includes:

- old-generation occupancy rising after young collections;
- large survivor populations;
- age distributions reaching the tenuring threshold;
- increasingly frequent mixed or old-generation collections.

Promotion is not automatically a leak. Warm caches and application initialization
can legitimately create long-lived objects and then stabilize.

### Excessive retention

Normal heap usage often forms a sawtooth:

```text
allocation → heap rises → GC → heap drops → repeat
```

The warning sign is a rising post-GC baseline under comparable workload:

```text
After GC 1: 300 MB
After GC 2: 325 MB
After GC 3: 370 MB
After GC 4: 430 MB
```

Possible causes include:

- an unbounded cache;
- queued work;
- session data;
- listener registrations never removed;
- `ThreadLocal` values;
- static collections;
- legitimate business growth.

To investigate retention:

1. Compare class histograms or dumps over time.
2. Inspect instance counts and retained sizes.
3. Use the dominator tree.
4. Follow paths from suspicious objects to GC roots.
5. Determine why the root continues to retain the objects.

## 2.7 Heap-dump safety

Heap dumps can pause or heavily disturb a large production JVM and require enough
disk space for a file comparable to the live heap. They may also contain secrets and
personal data.

Prefer automatic capture on heap failure when appropriate:

```text
-XX:+HeapDumpOnOutOfMemoryError
```

Treat the resulting file as sensitive. A heap dump is not the first diagnostic for
a pure CPU incident.

## Interview questions

1. Walk through the JVM's main memory areas.
2. How would you investigate long GC pauses?
3. What is the difference between allocation rate, promotion rate, and retention?
4. Why can heap usage increase without a memory leak?
5. What does a rising post-GC baseline suggest?
6. When is a heap dump appropriate, and what production risks does it create?
7. How would you distinguish Java heap exhaustion from native-memory exhaustion?

---

# 3. Production CPU profiling

## 3.1 Incident scenario

The application suddenly consumes 100% CPU even though total request traffic has
not increased.

The absence of a traffic increase does not rule out request-driven CPU consumption.
The request mix may have changed, one unusual payload may be expensive, or retries
and background work may have increased.

## 3.2 Investigation sequence

### Confirm the location and meaning of CPU saturation

- Is the Java process consuming the CPU?
- Is one core saturated or the entire host?
- Is it user CPU, kernel/system CPU, or CPU throttling?
- Is every instance affected or only one?
- Did it begin after a deployment, configuration change, or scheduled job?

### Correlate metrics

Check:

- request rate by normalized endpoint;
- p95 and p99 latency;
- errors and timeouts;
- retries and circuit-breaker activity;
- queue sizes and executor saturation;
- allocation rate and GC CPU;
- downstream latency;
- scheduled or background jobs.

### Collect repeated thread dumps

Capture a small number several seconds apart:

```text
jcmd <pid> Thread.print -l
```

Look for the same threads repeatedly in `RUNNABLE` state with similar stacks.
Possible hot paths include:

- an infinite loop;
- expensive regular expressions;
- JSON serialization;
- compression or encryption;
- retry loops;
- logging or string formatting;
- application-level spin waiting.

### Collect a bounded JFR recording

Use execution samples to identify hot methods. Also inspect allocation and GC because
high allocation may cause GC to consume CPU.

### Use more invasive artifacts only when justified

A heap dump is useful if evidence suggests retention. It is not a direct CPU profile.
Remote GUI attachment can introduce overhead and security concerns; existing
telemetry, JFR, and thread dumps are generally safer first steps.

## 3.3 Mitigation versus diagnosis

A rolling restart may restore capacity but is a mitigation, not a root-cause fix.
Before restarting, preserve bounded diagnostic evidence:

- JFR recording;
- repeated thread dumps;
- GC and application logs;
- relevant metrics and traces;
- deployment and configuration version.

For a rolling restart:

1. Ensure remaining instances have capacity.
2. Drain one instance from traffic.
3. Restart it.
4. Verify readiness and recovery.
5. Proceed one instance at a time.

Avoid restart storms and remember that warm-up may temporarily increase CPU.

## Interview questions

1. A Spring Boot service reaches 100% CPU without more traffic. How do you diagnose
   it safely?
2. Why are repeated thread dumps more informative than a single dump?
3. When would you use JFR instead of a heap dump?
4. What evidence would make you suspect GC rather than application code?
5. What should be captured before restarting an affected instance?

---

# 4. Concurrent in-memory caches

## 4.1 What `ConcurrentHashMap` guarantees

`ConcurrentHashMap` supports concurrent reads and updates. It does not allow only one
thread to update the whole map. Updates to different keys can generally proceed
concurrently.

Individual operations such as these are thread-safe:

- `get`;
- `put`;
- `putIfAbsent`;
- `compute`;
- `merge`;
- conditional `replace`.

A sequence of individually safe calls is not automatically atomic:

```java
if (!cache.containsKey(key)) {
    cache.put(key, loadValue(key));
}
```

Two threads may both observe the missing key and both perform the load.

## 4.2 Atomic map operations

| Operation | Use |
|---|---|
| `putIfAbsent(k, v)` | Install a value only when absent |
| `compute(k, fn)` | Atomically recalculate one mapping from its current value |
| `merge(k, v, fn)` | Insert or combine a new value with the current value |
| `replace(k, old, new)` | Compare-and-replace one mapping |

Example counter:

```java
counts.merge(key, 1, Integer::sum);
```

Keep computation functions short and avoid broad locks around slow database or
network calls.

## 4.3 Cached mutable values

The concurrent map protects its own structure, not the thread safety of stored
objects:

```java
ConcurrentHashMap<String, ArrayList<String>> roles =
        new ConcurrentHashMap<>();

roles.get("user-1").add("ADMIN"); // ArrayList mutation is not protected
```

Prefer immutable values and replace the complete value:

```java
record CachedUser(String name, List<String> roles) {
    CachedUser {
        roles = List.copyOf(roles);
    }
}
```

## 4.4 Preventing a cache stampede in one JVM

Suppose many requests miss the same key and loading it takes five seconds. Use one
map for cached values and another for loads currently in progress:

```java
final class AsyncCache {
    private final ConcurrentHashMap<String, Value> cache =
            new ConcurrentHashMap<>();

    private final ConcurrentHashMap<String, CompletableFuture<Value>> inFlight =
            new ConcurrentHashMap<>();

    private final Executor executor = Executors.newFixedThreadPool(10);

    CompletableFuture<Value> get(String key) {
        Value cached = cache.get(key);
        if (cached != null) {
            return CompletableFuture.completedFuture(cached);
        }

        CompletableFuture<Value> created = new CompletableFuture<>();
        CompletableFuture<Value> existing = inFlight.putIfAbsent(key, created);

        if (existing != null) {
            return existing;
        }

        executor.execute(() -> {
            try {
                Value loaded = loadFromDatabase(key);
                cache.put(key, loaded);
                created.complete(loaded);
            } catch (Throwable error) {
                created.completeExceptionally(error);
            } finally {
                inFlight.remove(key, created);
            }
        });

        return created;
    }

    private Value loadFromDatabase(String key) {
        throw new UnsupportedOperationException("Example only");
    }
}
```

The `inFlight` map is not the actual cache. It temporarily shares one future between
callers waiting for the same key.

The future is removed after completion because:

- it is no longer in progress;
- keeping completed futures would grow the map;
- failures must be removable so later calls can retry;
- successful values now live in the actual cache.

Conditional removal avoids deleting a different, newer future:

```java
inFlight.remove(key, created);
```

Production code also needs bounded load concurrency, timeouts, cancellation rules,
negative caching, and observability.

## 4.5 Cross-instance coordination

An in-memory mechanism coalesces loads only inside one JVM. Multiple application
instances may still load the same key concurrently.

A database or distributed lock can coordinate instances, but a row lock usually
waits rather than rejects. A `NOWAIT` mode or lock timeout is needed for immediate
failure. After acquiring a distributed lock, a caller must recheck a shared cache or
stored result; otherwise it may repeat the load anyway.

Locking a nonexistent row can also be difficult. For many applications, duplicate
reads are preferable to introducing a distributed lock. Measure the actual cost.

## 4.6 Cache consistency choices

Concurrent updates to the same key require an explicit policy:

- last write wins;
- optimistic version checking;
- per-key serialization;
- invalidate after database update;
- update the cache only from ordered events;
- treat the database as authoritative and tolerate staleness.

Conditional replacement supports optimistic updates:

```java
boolean replaced = cache.replace(key, expectedValue, newValue);
```

## 4.7 Cache lifecycle

An unbounded concurrent map can exhaust the heap. Production caches need:

- a maximum size or memory weight;
- expiration after write or access;
- refresh behavior;
- eviction policy;
- failure caching rules;
- negative caching rules;
- stale-value policy;
- hit, miss, load, failure, and eviction metrics.

Caffeine is often preferable for a single-JVM production cache because it provides
bounded eviction, expiration, refresh, asynchronous loading, statistics, and
well-tested concurrency behavior. It is not a distributed cache.

## Interview questions

1. How would you design a fast concurrent in-memory cache?
2. Why is a `ConcurrentHashMap` not enough for compound operations?
3. How would you prevent two callers from loading the same missing key?
4. Why should cached values often be immutable?
5. What happens when a cache has no maximum size?
6. When would a distributed lock be justified?
7. How would you define correctness for two updates to the same key?

---

# 5. Spring transaction management

## 5.1 How `@Transactional` works

Spring typically creates an AOP proxy around a Spring-managed bean, not around one
individual method. Depending on configuration, it may use a JDK interface proxy or
a class-based proxy.

For an intercepted method call:

1. The caller invokes the proxy.
2. `TransactionInterceptor` reads transactional metadata.
3. The selected transaction manager joins, creates, suspends, or rejects a
   transaction according to propagation rules.
4. For imperative transactions, resources are normally associated with the current
   thread.
5. The target method executes.
6. Spring applies rollback rules and commits or rolls back.

The default propagation is `REQUIRED`: join the existing transaction or start a new
one.

## 5.2 Self-invocation

```java
public void createOrder() {
    saveOrder(); // Direct call on this object
}

@Transactional
public void saveOrder() {
    // ...
}
```

`saveOrder()` executes, but the call does not pass through the proxy, so its
transactional advice is not applied.

Common solutions:

- place the transaction on the externally called service method;
- move the transactional operation to another Spring bean;
- use AspectJ weaving when it is truly justified;
- avoid self-injection or `AopContext` unless there is a compelling reason.

## 5.3 Rollback rules

By default:

- `RuntimeException` and `Error` cause rollback;
- checked exceptions do not cause rollback.

```java
@Transactional(rollbackFor = IOException.class)
public void importFile() throws IOException {
    // ...
}
```

If a method catches an exception and returns normally, the interceptor may commit
because it did not observe the failure:

```java
@Transactional
public void save() {
    try {
        repository.save(entity);
    } catch (RuntimeException error) {
        log.error("Save failed", error);
    }
}
```

An inner participating transaction may mark the shared transaction rollback-only.
Even if an outer method catches the exception, final commit may result in an
`UnexpectedRollbackException`.

## 5.4 Asynchronous boundaries

An imperative transaction does not automatically propagate to a newly created
thread:

```java
@Transactional
public void process() {
    executor.submit(() -> repository.save(entity));
}
```

The executor operation is not part of the caller's transaction.

If asynchronous work needs a transaction, invoke an asynchronous worker through a
Spring proxy and give the worker method its own transaction. It will be a separate
transaction on the worker thread.

Work started asynchronously inside a transaction may run before the original
transaction commits. When it must happen only after commit, consider:

- an after-commit callback;
- `@TransactionalEventListener` with the appropriate phase;
- a transactional outbox.

## 5.5 Proxy and resource boundaries

Transactional behavior may be absent or different when:

- an object is created with `new` instead of by Spring;
- the class is not a Spring bean;
- a call is a self-invocation;
- a method is private or cannot be overridden by the selected proxy mechanism;
- code runs during initialization before the proxy is fully usable;
- the wrong transaction manager is chosen in a multi-database application;
- work runs in another thread;
- a remote HTTP call or message publication is assumed to roll back with the DB.

A Spring database transaction does not automatically roll back an external HTTP
call, a message already published, or state in another service.

## Interview questions

1. How does `@Transactional` work internally?
2. Why does self-invocation bypass transactional advice?
3. Which exceptions cause rollback by default?
4. What happens if a runtime exception is caught and not rethrown?
5. Does a caller's transaction propagate into `@Async` work?
6. What does `REQUIRED` mean?
7. Can one local transaction atomically cover a database and a remote HTTP service?

---

# 6. Spring bean discovery, lifecycle, and scopes

## 6.1 Component scanning and bean definitions

Spring scans configured packages for candidate components such as:

- `@Component`;
- `@Service`;
- `@Repository`;
- `@Controller`;
- configuration classes and `@Bean` factory methods.

It registers bean definitions containing metadata such as:

- bean type and name;
- scope;
- qualifiers and primary status;
- dependencies;
- lazy/eager behavior;
- initialization configuration.

Finding a class during scanning does not necessarily mean creating its instance
immediately. Eager singleton creation commonly happens during context refresh.

## 6.2 Dependency resolution

When Spring creates a bean, it chooses a constructor and resolves dependencies
primarily by type. If multiple candidates exist, resolution may use:

- `@Qualifier`;
- `@Primary`;
- injection-point name;
- collection injection when all implementations are desired.

Typical failures include:

- no matching bean;
- multiple ambiguous beans;
- an unresolvable circular dependency;
- a dependency that fails during its own construction.

Constructor injection makes mandatory dependencies and cycles visible and supports
immutable fields.

## 6.3 Simplified bean lifecycle

1. Read and register bean definitions.
2. Instantiate the bean.
3. Resolve and inject dependencies.
4. Run aware callbacks where applicable.
5. Run bean post-processors before initialization.
6. Run `@PostConstruct`, `InitializingBean`, or configured initialization methods.
7. Run bean post-processors after initialization; this is where proxies may be
   returned.
8. Make the bean available for use.
9. On context shutdown, invoke destruction callbacks for managed scopes.

## 6.4 Scopes

| Scope | Meaning |
|---|---|
| Singleton | One instance per bean definition per Spring container |
| Prototype | New instance for each container lookup/injection request |
| Request | One instance per HTTP request |
| Session | One instance per HTTP session |
| Application | One instance per `ServletContext` |
| WebSocket | One instance per WebSocket lifecycle |

Spring singleton scope is not the same as a JVM-wide GoF singleton.

For prototype beans, Spring creates and injects the object but does not automatically
manage its complete destruction lifecycle.

## 6.5 Prototype injected into singleton

```java
@Component
@Scope("prototype")
class Task {
}

@Component
class TaskService {
    private final Task task;

    TaskService(Task task) {
        this.task = task;
    }
}
```

`TaskService` is constructed once, and one new `Task` is injected at that time. The
singleton then retains that same task. A new prototype is not created on every method
call.

Use an `ObjectProvider` when a new instance is required per operation:

```java
@Component
class TaskService {
    private final ObjectProvider<Task> tasks;

    TaskService(ObjectProvider<Task> tasks) {
        this.tasks = tasks;
    }

    void execute() {
        Task task = tasks.getObject();
        // use this new instance
    }
}
```

`Provider`, method injection, or an appropriate scoped proxy are alternatives.

Request- and session-scoped dependencies injected into a singleton normally require
a proxy that resolves the real object for the current request or session.

## 6.6 Circular dependencies

A constructor cycle is unresolvable:

```text
A constructor requires B
B constructor requires A
```

Some setter or field cycles between singletons have historically been resolvable
through early references when circular references are permitted. This is fragile:

- one object may observe another before complete initialization;
- AOP proxies complicate the reference identity;
- the design often indicates mixed responsibilities.

Prefer redesigning the services. `@Lazy` or `ObjectProvider` can break the
construction cycle, but may only hide the architectural issue.

## 6.7 Lazy initialization

Advantages:

- faster startup;
- lower initial memory consumption;
- unused beans may never be created.

Disadvantages:

- misconfiguration is found on first use rather than startup;
- the first request may be slower;
- several concurrent first requests may create an initialization spike;
- production may encounter a creation failure that eager validation would reveal.

Lazy initialization does not necessarily harm steady-state performance; its largest
cost is usually on first access.

## Interview questions

1. How does component scanning differ from bean instantiation?
2. How does Spring disambiguate two beans of the same type?
3. What are the major bean lifecycle callbacks?
4. Is a Spring singleton global to the entire JVM?
5. What happens when a prototype bean is constructor-injected into a singleton?
6. Why do constructor circular dependencies fail?
7. What are the tradeoffs of lazy initialization?

---

# 7. JPA and database performance diagnosis

## 7.1 Start with a trace of one slow request

Before changing mappings or indexes, determine where the request spends time:

```text
HTTP request
├── connection-pool acquisition
├── SQL execution
├── Hibernate entity hydration
├── application mapping
└── JSON serialization
```

Use representative data sizes and parameters. A query that is fast with ten rows
may fail at production cardinality.

## 7.2 N+1 queries

An N+1 pattern looks like:

```text
SELECT * FROM orders;
SELECT * FROM order_items WHERE order_id = 1;
SELECT * FROM order_items WHERE order_id = 2;
SELECT * FROM order_items WHERE order_id = 3;
...
```

Inspecting entity relationships identifies risk but does not prove N+1. Confirm it by
observing one request and measuring:

- total SQL statement count;
- repeated normalized query shapes with different IDs;
- database time;
- entities and collections loaded.

N+1 can arise from lazy traversal during DTO mapping or serialization. Eager mapping
does not necessarily guarantee one joined query; it can still cause secondary
selects.

Possible solutions:

- fetch joins;
- entity graphs;
- batch fetching;
- explicit DTO projections;
- restructuring the query or API.

Fetch joins over collections require care with pagination and multiple collections
because they may multiply result rows or make in-memory pagination necessary.

N+1 is not always the dominant performance problem when N is tiny, but it scales
poorly and should be measured with realistic cardinality.

## 7.3 Over-fetching

There are two layers:

### Database over-fetching

- unnecessary columns;
- unnecessary associations;
- too many entities;
- duplicate rows from collection joins;
- excessive entity hydration and persistence-context growth.

### API over-fetching

- returning fields the client does not use;
- deeply serializing entity graphs;
- performing work to populate unused response fields.

Compare:

- frontend/API contract;
- selected SQL columns;
- rows returned;
- entities hydrated;
- response payload size;
- mapping and serialization CPU and allocation.

DTO projections are often useful for read endpoints because they fetch only the
required representation.

## 7.4 Database locking

High p99 latency is a clue, not proof of lock contention. p99 is a percentile over a
time window, not an average.

Confirm locking using database evidence:

- waiting session and blocking session identifiers;
- wait type and duration;
- transaction age;
- current statement and transaction state;
- deadlock reports;
- sessions idle in a transaction.

Locks are normal. Harmful contention may be caused by:

- a transaction kept open during an HTTP call;
- hot-row updates;
- an unnecessarily strict isolation level;
- a large update;
- a missing index causing wider scans and locking;
- inconsistent lock ordering.

### Why lock incidents are hard to reconstruct

Live lock information may disappear when the blocker commits:

```text
Transaction A updates row and holds lock
Transaction B waits
Transaction A commits
Transaction B continues
Current lock view is now clean
```

Prepare historical evidence before an incident:

- database wait-event monitoring;
- periodic sampling of active and blocking sessions;
- lock-wait thresholds and automatic capture;
- transaction-duration metrics;
- structured application traces with transaction and SQL spans;
- safe correlation identifiers in database session metadata.

A slow-query log may show that a query was slow without showing that most of its
time was spent waiting for a lock.

## 7.5 Missing indexes

Latency increasing with table size is a clue, not proof. Confirm using the database's
execution-plan tooling with representative parameter values.

Look for:

- large sequential/table scans;
- many rows examined compared with rows returned;
- inefficient joins;
- expensive sorts;
- filters not supported by an appropriate index;
- inaccurate cardinality estimates;
- composite-index column order that does not match access patterns.

Do not add indexes blindly. Every index consumes storage and adds write, vacuuming,
and maintenance cost.

## 7.6 Connection-pool exhaustion

Typical evidence:

```text
active connections ≈ maximum
idle connections = 0
pending threads > 0
connection acquisition latency rises
connection timeouts occur
```

Separate:

- time waiting to acquire a connection;
- time executing the query after acquisition.

Common causes include:

- slow or blocked queries;
- long transactions;
- connection leaks;
- network calls performed inside transactions;
- a pool larger than the database can efficiently serve;
- database connection limits.

Increasing the pool size may intensify database overload rather than solve it.

## 7.7 Diagnostic decision table

| Evidence | Likely direction |
|---|---|
| Many repeated child queries | N+1 |
| Few queries but huge row/entity count | Over-fetching or join explosion |
| Pool acquisition is slow | Pool saturation or connection leak |
| Acquisition is fast, SQL span is slow | Query, lock, I/O, or database CPU |
| Database reports blocker/waiter | Lock contention |
| Plan scans many rows for few results | Missing/ineffective index |
| Serialization dominates | API shape or object graph problem |

## Interview questions

1. How do you prove an N+1 problem rather than infer it from mappings?
2. What is the difference between database and API over-fetching?
3. How do you distinguish pool wait time from SQL execution time?
4. Why does high p99 latency not prove database locking?
5. How do you capture a lock problem that disappears before manual inspection?
6. What execution-plan evidence suggests a missing index?
7. Why can increasing the connection pool make the system slower?

---

# 8. Resilience patterns for downstream calls

Use one scenario throughout: `OrderService` calls `PaymentService`, which sometimes
becomes slow or unavailable.

## 8.1 Timeouts and deadlines

A timeout should derive from the end-to-end latency budget and observed dependency
latency, not an arbitrary round number.

Example:

```text
Overall request budget:       1,000 ms
Payment attempt timeout:        250 ms
Retry plus backoff allowance:   300 ms
Remaining application work:     450 ms
```

Configure distinct limits where supported:

- connection-pool acquisition timeout;
- TCP connection timeout;
- TLS handshake timeout;
- response/read timeout;
- total operation deadline.

A long timeout under load retains threads, connections, and memory. Downstream
timeouts should leave the caller enough time to return a controlled response.

## 8.2 Retries

Two retries plus the initial call means as many as three downstream requests.
Retries can multiply load during an outage.

Retry only likely transient failures:

- selected connection failures;
- selected timeouts;
- some server errors;
- throttling responses while respecting `Retry-After`.

Do not retry ordinary validation errors. Avoid retrying non-idempotent mutations
unless an idempotency mechanism makes them safe.

Use bounded exponential backoff with jitter:

```text
first retry:  around 100 ms plus randomness
second retry: around 200 ms plus randomness
```

Also define:

- maximum attempts;
- maximum elapsed retry time;
- a retry budget;
- one responsible retry layer in a service chain.

Retries at every layer can grow multiplicatively.

## 8.3 Circuit breaker

A circuit breaker tracks recent outcomes across calls.

```text
CLOSED
  ↓ failure/slow-call threshold reached
OPEN
  ↓ cooldown expires
HALF_OPEN
  ├── probes succeed → CLOSED
  └── probes fail    → OPEN
```

Example configuration:

```text
minimum calls: 10
failure threshold: 50%
open duration: 20 seconds
half-open probes: 3
```

While open, calls fail fast instead of waiting for a timeout or adding work to the
unhealthy dependency. The breaker does not physically disconnect the service; it is
a caller-side decision.

Possible open-state behavior:

- return `503`;
- use a safe fallback;
- serve stale data;
- queue work when business semantics permit it.

## 8.4 Bulkhead

A bulkhead isolates resources so one dependency cannot exhaust the whole service.

Without a bulkhead:

```text
100 request threads
PaymentService hangs
100 threads wait for payment
unrelated endpoints also stop
```

With a payment bulkhead:

```text
PaymentService: maximum 10 concurrent calls
InventoryService: maximum 20 concurrent calls
EmailService: maximum 5 concurrent calls
```

Implementations include:

- semaphores;
- dedicated bounded executors;
- bounded queues;
- separate HTTP or DB connection pools;
- per-dependency concurrency limits.

Multiple service instances and autoscaling improve capacity and availability but are
not, by themselves, the bulkhead pattern. Autoscaling callers during a downstream
outage can increase pressure on the failing dependency.

## 8.5 Load shedding

Load shedding rejects excess work before the service collapses.

```text
maximum active requests: 100
maximum queued requests: 20
```

Once safe capacity is exhausted, new requests fail quickly with a suitable response,
such as `429` or `503`, possibly including `Retry-After`.

Without shedding:

```text
queues grow
→ latency grows
→ clients time out and retry
→ more load arrives
→ system collapses
```

With shedding, some callers fail quickly so admitted work still completes and the
system remains recoverable.

Difference:

- bulkhead isolates capacity between operations;
- load shedding rejects work when safe capacity is exhausted;
- a bulkhead limit may cause localized shedding at one dependency boundary.

## 8.6 Idempotency

Idempotency means that repeated attempts have the same intended business effect as
one attempt. It does not necessarily mean the service executes the request only once.

Example failure:

```text
1. Payment request reaches provider.
2. Provider charges successfully.
3. Response is lost.
4. Caller times out and retries.
```

Use one stable key for all attempts:

```http
POST /payments
Idempotency-Key: payment-order-123
```

Store something equivalent to:

| Key | Request hash | Status | Result |
|---|---|---|---|
| `payment-order-123` | `abc123` | `COMPLETED` | `payment-789` |

Behavior:

- new key: claim and execute;
- completed same request: return the original result;
- in-progress request: wait, return `202`, or report in progress;
- same key with different payload: reject.

The claim must be atomic. This is unsafe:

```java
if (!repository.exists(key)) {
    executeSideEffect();
    repository.save(key);
}
```

Two callers can both see the key as absent. Use a unique constraint, conditional
insert, or transactional state transition.

If the idempotency record is in DynamoDB and the business operation is in an
unrelated SQL database, there is a dual-write problem. One write may succeed while
the other fails. Prefer atomic storage with the business change where possible, or
use a durable state machine and reconciliation process.

## 8.7 Combined request flow

```text
Request arrives
    ↓
Load shedding: does this service have safe capacity?
    ├── no → reject quickly
    └── yes
         ↓
Circuit breaker: is the dependency currently considered unhealthy?
    ├── open → fail fast or use fallback
    └── closed/half-open
         ↓
Bulkhead: is a dependency slot available?
    ├── no → reject or briefly wait
    └── yes
         ↓
Call with a per-attempt timeout
         ↓
Transient failure and retry budget remains?
    ├── yes → backoff + jitter + same idempotency key
    └── no → return controlled outcome
```

## Interview questions

1. How should an end-to-end deadline influence a downstream timeout?
2. Why can two retries triple downstream load?
3. Which errors should not be retried?
4. What is the difference between a circuit breaker and load shedding?
5. Why are multiple instances not the same as a bulkhead?
6. What failure makes idempotency necessary even if a request timed out?
7. How do you atomically claim an idempotency key?

---

# 9. Observability for a Spring Boot service

## 9.1 The three primary signals

- **Metrics** identify trends, saturation, and alerts.
- **Traces** show where an individual request spent time.
- **Logs** explain particular failures and state transitions.

Correlate them using trace and span identifiers.

## 9.2 HTTP metrics

For each normalized route:

- request rate;
- error rate by status class;
- p50, p95, and p99 duration;
- active requests;
- cancellations and timeouts.

Avoid high-cardinality labels. Use `/orders/{id}`, not `/orders/123`, and do not use
user IDs, raw URLs, or exception messages as unrestricted metric tags.

## 9.3 JVM and executor metrics

- process and system CPU;
- heap and non-heap memory;
- allocation rate;
- GC frequency, pause time, and CPU;
- thread count and states;
- executor active threads, current size, maximum size;
- executor queue depth, task duration, completed tasks, and rejected tasks.

If active threads reach the maximum and the queue rises, time may be spent waiting
for execution rather than doing business work.

## 9.4 Database and pool metrics

- active, idle, maximum, and pending connections;
- acquisition duration and timeout count;
- query duration and error count;
- transaction duration;
- database lock waits and wait types where available.

Key distinction:

```text
slow acquisition → application connection-pool problem
fast acquisition + slow SQL → database/query/wait problem
```

## 9.5 Downstream metrics

For each normalized dependency and operation:

- request rate;
- latency percentiles;
- errors by category;
- connect and response timeouts;
- retry attempts;
- circuit-breaker state and transitions;
- bulkhead utilization and rejections;
- client connection-pool utilization.

## 9.6 Trace interpretation

Example downstream problem:

```text
POST /orders                         920 ms
├── validation                        20 ms
├── acquire DB connection             10 ms
├── INSERT order                      40 ms
├── call PaymentService              800 ms
└── serialize response                15 ms
```

Example pool exhaustion:

```text
POST /orders                         920 ms
├── acquire DB connection            700 ms
├── INSERT order                      40 ms
└── other work                        30 ms
```

Example slow database operation:

```text
POST /orders                         920 ms
├── acquire DB connection              5 ms
├── SELECT inventory                 850 ms
└── other work                        30 ms
```

If the root span lasts 900 ms but child spans explain only 100 ms, investigate
unaccounted self time:

- application CPU;
- internal queueing;
- lock contention;
- serialization;
- missing instrumentation.

A long SQL span shows where time was spent, not necessarily why. Database wait
events and plans are still needed to distinguish locking, I/O, CPU, and query-plan
problems.

## 9.7 Structured logs

Useful fields include:

- timestamp, service, instance, environment, and deployment version;
- trace ID and span ID;
- normalized operation;
- duration and outcome;
- exception type and stack trace;
- timeout category;
- retry attempt;
- circuit-breaker transition;
- transaction rollback or timeout.

Avoid logging authentication tokens, secrets, personal data, full request bodies, or
SQL parameter values by default.

## 9.8 Do not infer “network issue” from temporary recovery

A brief health-check failure followed by recovery suggests transient availability,
but it does not prove the network was responsible. Other causes include:

- a service restart;
- DNS failure;
- load-balancer behavior;
- TLS negotiation failure;
- downstream CPU or GC pause;
- connection-pool exhaustion;
- deployment/readiness transition.

Use specific evidence:

| Evidence | Direction |
|---|---|
| DNS resolution exception | DNS/configuration |
| Connect timeout | Network, firewall, listener, or overloaded destination |
| TLS handshake failure | Certificate or negotiation problem |
| Connection reset | Established connection was terminated |
| Read timeout | Connection succeeded but response was too slow |
| Client span long, server span equally long | Downstream processing likely slow |
| Client span long, no server span | Pre-server network path or missing tracing |

## 9.9 Health probes

Liveness should indicate whether restarting this process could help. It should not
normally depend on external databases, APIs, or caches. Otherwise one dependency
failure may cause all application instances to restart and intensify the outage.

Readiness indicates whether an instance should receive traffic. Include external
dependency checks only after evaluating whether removing every instance from traffic
would be safer than serving degraded responses.

## Interview questions

1. Which metrics would you expose for a production Spring Boot service?
2. How do metrics, traces, and logs complement one another?
3. How do you distinguish connection-pool waiting from query execution?
4. What does unexplained trace self time suggest?
5. Why does a recovered health check not prove a network incident?
6. Why should liveness usually exclude external dependencies?
7. What metric labels create dangerous cardinality?

---

# 10. Payment-like operations with Spring Boot and Kafka

## 10.1 Clarify the API semantics first

An asynchronous design usually means:

```http
POST /payments
Idempotency-Key: payment-order-123
```

Response:

```http
HTTP/1.1 202 Accepted
Location: /payments/payment-789
```

The client can:

- poll the status endpoint;
- receive a webhook;
- subscribe through SSE or WebSocket where appropriate.

Kafka is useful for durable asynchronous processing, but it does not by itself make
external side effects exactly once.

Amazon MSK is a managed Apache Kafka service, not an alternative messaging system.

## 10.2 Idempotent API acceptance

Prefer a caller-supplied stable idempotency key. A deterministic key derived from a
business identifier can work when the business operation is unambiguous, but an
explicit key better distinguishes capture, refund, retry, or a legitimately new
operation.

Within one database transaction:

```text
BEGIN

Insert payment:
  payment_id = payment-789
  idempotency_key = payment-order-123
  request_hash = abc123
  status = PENDING

Insert outbox event:
  event_id = event-456
  event_type = PaymentRequested
  aggregate_id = payment-789

COMMIT
```

Enforce a unique constraint on the idempotency key and compare a request hash when
the key already exists.

## 10.3 Transaction boundaries and the outbox

These database writes can be atomic together:

```text
save payment
save outbox event
```

These operations do not naturally share one local atomic transaction:

```text
update SQL database
publish Kafka message
call external payment provider
```

Publishing directly after committing creates a dual-write window:

```java
paymentRepository.save(payment);
kafkaTemplate.send("payments", event);
```

The database may commit while the Kafka publication fails.

With a transactional outbox:

1. The application atomically writes business state and an outbox row.
2. An outbox relay publishes unpublished rows to Kafka.
3. The relay marks them published.
4. If the relay crashes between steps 2 and 3, it may publish again.
5. Consumers must therefore be idempotent.

Transaction synchronization between Kafka and a database still normally commits
one resource and then the other. A secondary commit can fail, requiring compensation
or repair. The outbox makes this failure recoverable through durable database state.

## 10.4 Partition keys and ordering

Kafka orders records within a partition, not globally.

For a payment aggregate, key records by `paymentId` or sometimes `orderId`:

```text
PaymentRequested
PaymentAuthorized
PaymentCaptured
PaymentRefunded
```

Using `customerId` serializes all operations for one customer and may reduce
parallelism or create a hot partition. Choose the smallest business aggregate that
requires ordering.

Partition ordering is not the only concurrency control because:

- messages may be delivered again;
- consumer groups rebalance;
- APIs or jobs may update the same row outside Kafka;
- different keys may still affect one shared business invariant.

Use database constraints and conditional transitions:

```sql
UPDATE payment
SET status = 'SUCCEEDED',
    version = version + 1
WHERE id = :id
  AND status = 'PROCESSING'
  AND version = :expectedVersion;
```

Zero updated rows means the expected state no longer holds.

## 10.5 Kafka durability configuration

Durability depends on configuration, not only on one broker writing a local log.
For important events, evaluate settings such as:

```text
replication.factor = 3
acks = all
min.insync.replicas = 2
enable.idempotence = true
```

Also monitor under-replicated partitions, producer errors, consumer lag, and disk
capacity.

Kafka producer idempotence prevents duplicate records caused by the producer's own
retries under the supported configuration. It does not deduplicate two separate
business requests and does not make an external provider call exactly once.

Kafka transactions provide exactly-once behavior for the supported Kafka
read-process-write boundary. Always inspect the scope of an “exactly once” claim.

## 10.6 Consumer processing and payment-provider calls

Use a state machine:

```text
PENDING
   ↓
PROCESSING
   ├── confirmed success → SUCCEEDED
   ├── confirmed failure → FAILED
   └── uncertain result  → UNKNOWN → reconciliation
```

The provider call should use the same stable provider idempotency key. If the call
times out, the service must not assume failure because the provider may have
completed the charge.

Recovery options:

- retry using the same provider idempotency key;
- query the provider's status API;
- store `UNKNOWN` and reconcile later;
- alert when reconciliation exceeds an operational deadline.

Do not hold a database transaction open during a slow network call. A common design
uses short state-transition transactions around the external call and a lease or
attempt token so abandoned `PROCESSING` records can be recovered.

After success, one DB transaction should:

```text
update payment to SUCCEEDED
insert PaymentCompleted outbox event
```

## 10.7 Consumer acknowledgments and duplicates

For at-least-once processing:

```text
process record safely
persist result
commit/acknowledge the next Kafka offset
```

If the consumer commits the DB result and crashes before committing the offset, the
record is redelivered. Make it safe using:

- event IDs with a unique processed-event constraint;
- idempotency keys;
- conditional state changes;
- provider-side idempotency.

Committing the Kafka offset before safely persisting the result risks losing the
operation entirely.

Repeatedly failing records require bounded retries, a dead-letter topic, alerts, and
safe replay tooling.

## 10.8 Consumer failure and group rebalancing

Initial assignment:

```text
Consumer A: partitions 0, 1
Consumer B: partitions 2, 3
```

Consumer B fails:

```text
Consumer A: partitions 0, 1, 2, 3
```

Consumer B returns and rejoins. Kafka performs another assignment, for example:

```text
Consumer A: partitions 0, 1
Consumer B: partitions 2, 3
```

The exact assignment is not guaranteed. The returning consumer must not reclaim old
partitions itself. It accepts its new assignment and resumes from the consumer
group's committed offsets.

The committed offset means the next record to consume. If records through offset
125 were safely processed, commit offset 126.

### Rebalance callbacks

`onPartitionsRevoked`:

- stop accepting new work for revoked partitions;
- finish or cancel in-flight work;
- commit only safely completed offsets;
- flush partition-local state.

`onPartitionsAssigned`:

- initialize or restore partition state;
- begin from committed positions.

`onPartitionsLost`:

- assume another consumer may already own the partition;
- cancel old work and release resources;
- do not commit a stale offset.

If a consumer dies abruptly, it may not receive a revocation callback. The new owner
starts from the last committed offset, so some records may be repeated.

### Zombie consumer risk

A long GC pause or network partition may make a consumer appear dead. Kafka can move
its partitions while an old asynchronous task continues running.

Kafka rejects obsolete offset commits, but it cannot prevent the old task from
calling an external provider. Protect external side effects using idempotency keys,
conditional DB transitions, leases, and fencing tokens.

### Preventing accidental rebalances

If processing prevents `poll()` from being called within `max.poll.interval.ms`, the
consumer can be considered failed even while the process is alive.

Mitigations include:

- reducing `max.poll.records`;
- keeping the poll loop responsive;
- pausing partitions appropriately;
- tracking asynchronous in-flight records per partition;
- preserving per-partition ordering;
- tuning the poll interval to realistic processing duration.

Cooperative/incremental rebalancing reduces partition movement. Static membership
using a unique `group.instance.id` can avoid rebalances during brief restarts, but a
longer session timeout also delays failover after a real failure.

## 10.9 Eventual consistency

Eventual consistency exists whenever different durable components update at
different times:

```text
API accepts payment
→ payment remains PENDING until consumed
```

```text
provider completes charge
→ local DB may still say PROCESSING after a crash
```

```text
payment becomes SUCCEEDED
→ order, inventory, notifications, and reporting update later
```

The system converges through durable events, retries, idempotency, and
reconciliation. The client-visible status must honestly represent intermediate
states.

## 10.10 Inventory concurrency

A simple atomic reservation can prevent overselling:

```sql
UPDATE inventory
SET available = available - :quantity
WHERE product_id = :productId
  AND available >= :quantity;
```

- one updated row: reservation succeeded;
- zero updated rows: insufficient stock or concurrent change.

For a longer workflow, use expiring reservations:

```text
AVAILABLE → RESERVED → SOLD
                    ↘ EXPIRED → AVAILABLE
```

Serializing all inventory work may become a bottleneck. Token/bucket or preallocated
inventory designs can reduce contention but introduce another count that must be
refilled and reconciled. Use them only after measuring the simpler design.

## 10.11 Partial-failure recovery table

| Failure | Recovery |
|---|---|
| DB commits but Kafka publication fails | Outbox relay retries |
| Outbox event publishes twice | Consumer deduplicates by event ID/state |
| Consumer dies | Group reassigns partitions |
| DB commits but offset commit fails | Kafka redelivers; consumer is idempotent |
| Provider succeeds but response is lost | Same provider key plus reconciliation |
| Payment succeeds but inventory fails | Saga policy: refund, void, or backorder |
| Notification fails | Retry notification independently; do not undo payment |
| Poison event repeatedly fails | Dead-letter topic, alert, inspect, replay |
| Consumer marked dead while old task runs | Fencing/idempotency/conditional update |

## Interview questions

1. Design a payment-like API using Spring Boot and Kafka.
2. Why is a database update followed by Kafka publication a dual write?
3. How does the transactional outbox close the lost-event window?
4. Why must an outbox consumer still be idempotent?
5. What ordering does a Kafka partition guarantee?
6. How do `acks`, replication, and `min.insync.replicas` affect durability?
7. Does Kafka exactly-once processing make a payment-provider call exactly once?
8. What should happen when the provider succeeds but its response is lost?
9. Where does eventual consistency appear in the payment workflow?
10. How do you recover a payment stuck in `PROCESSING` or `UNKNOWN`?
11. What happens when a failed Kafka consumer returns to the group?
12. How do you protect against an old consumer continuing an external side effect?

---

# 11. Consolidated senior interview set

## Question 1: Java concurrency

What are the differences between `volatile`, `synchronized`, and atomic classes?
When is volatile insufficient? Explain mutual exclusion and the relevant visibility
guarantees.

## Question 2: JVM memory and garbage collection

Walk through the JVM's main memory areas. How would you investigate long GC pauses
or an `OutOfMemoryError`? Explain allocation rate, promotion, post-GC occupancy, and
retention.

## Question 3: Concurrent caching

Multiple threads update an in-memory cache while reads must remain fast. How would
you design it? How would you handle compound updates, mutable values, cache stampede,
expiration, eviction, failures, and multiple service instances?

## Question 4: Production profiling

A Spring Boot service suddenly reaches 100% CPU without an increase in total traffic.
How would you diagnose it safely? What would you capture before mitigation?

## Question 5: Spring transactions

How does `@Transactional` work internally? Explain proxy boundaries,
self-invocation, checked exceptions, caught exceptions, async execution, propagation,
and resources outside the transaction manager.

## Question 6: Spring beans and scopes

How does Spring discover, resolve, create, initialize, proxy, and destroy beans?
Explain circular dependencies, singleton/prototype/request/session scopes, prototype
injection into a singleton, and lazy initialization.

## Question 7: JPA and database performance

A REST endpoint is slow while loading related JPA entities. How would you prove or
reject N+1, over-fetching, lock contention, connection-pool exhaustion, and a missing
index?

## Question 8: Resilience

A downstream service becomes slow or unavailable. How would you combine deadlines,
timeouts, retries, backoff, jitter, circuit breakers, bulkheads, load shedding,
fallbacks, and idempotency without worsening the outage?

## Question 9: Observability

Which metrics, traces, logs, and health signals should a production Spring Boot
application expose? How would you distinguish application CPU, executor queueing,
connection-pool waiting, SQL execution, network problems, and downstream latency?

## Question 10: Distributed payment processing

Design a payment-like operation with Spring Boot and Kafka. Address duplicate
requests, concurrent state transitions, transaction boundaries, outbox publication,
partitioning, durability, consumer failure, rebalancing, eventual consistency,
external side effects, compensation, and recovery.

---

# 12. Rapid-review distinctions

| Often confused concepts | Important distinction |
|---|---|
| Volatile vs atomic | Visibility/order versus atomic state transition |
| Atomic operation vs atomic sequence | Safe method calls do not make a multi-call workflow atomic |
| Mutual exclusion vs visibility | Locking prevents concurrent entry and also establishes visibility |
| Allocation vs retention | Creating bytes quickly versus keeping them reachable |
| Heap growth vs leak | Growth between GCs is normal; rising post-GC live set is suspicious |
| Heap dump vs JFR | Object snapshot versus behavior over time |
| Concurrent map vs safe cached object | Map structure safety does not protect mutable values |
| Mitigation vs root fix | Restarting restores capacity but does not explain the incident |
| Self-invocation vs proxy call | Same-object call bypasses proxy advice |
| Prototype definition vs per-use instance | New instance occurs per container request, not every ordinary method call |
| N+1 risk vs proof | A relationship mapping is a clue; executed SQL count is evidence |
| p99 latency vs lock proof | A percentile shows tail delay, not its cause |
| Pool wait vs query time | Waiting for a connection is not SQL execution |
| Circuit breaker vs load shedding | Dependency health protection versus local capacity protection |
| Bulkhead vs autoscaling | Resource isolation versus adding capacity |
| Retry success vs safe retry | Mutation retries require idempotency |
| Kafka ordering vs global ordering | Ordering exists only within a partition |
| Kafka producer idempotence vs business idempotence | Broker retry dedupe does not dedupe user operations |
| Kafka exactly once vs external side effect | Kafka EOS does not make an HTTP payment charge exactly once |
| Consumer ownership vs business fencing | Kafka can reject stale commits but cannot undo external calls |
| Synchronous transaction vs eventual consistency | One atomic resource boundary versus later convergence across systems |

---

# 13. Production checklists

## CPU incident

- Confirm the Java process and affected instances.
- Check user/system CPU and throttling.
- Correlate route mix, latency, errors, retries, queues, GC, and deployments.
- Capture repeated thread dumps.
- Capture a short JFR recording.
- Preserve logs and configuration before restart.
- Roll instances safely if mitigation is required.

## Memory/GC incident

- Read the exact error or symptom.
- Check allocation rate, post-GC occupancy, GC types, frequency, and pauses.
- Inspect GC logs and JFR.
- Distinguish heap, metaspace, direct memory, and native threads.
- Capture a heap dump only when justified and safe.
- Analyze dominators and paths to GC roots for retention.

## Slow database endpoint

- Trace one representative slow request.
- Separate connection acquisition from SQL execution.
- Count normalized queries.
- Measure rows, entities, mapping time, and response size.
- Inspect database waits and blockers.
- Inspect the execution plan with representative parameters.
- Correlate pool active/idle/pending/timeouts.

## Failing downstream dependency

- Enforce an overall deadline and bounded per-attempt timeout.
- Retry only transient, safe operations.
- Use backoff and jitter.
- Limit retry amplification.
- Isolate resources with a bulkhead.
- Fail fast with a circuit breaker when thresholds are crossed.
- Shed load before local collapse.
- Preserve idempotency across every retry.

## Kafka payment consumer

- Use a stable event ID and business idempotency key.
- Enforce DB constraints and valid state transitions.
- Use provider-side idempotency.
- Commit offsets after durable processing.
- Expect duplicate delivery.
- Handle partition revoke, assign, and lost callbacks.
- Keep polling within the configured interval.
- Reconcile `UNKNOWN` and abandoned `PROCESSING` records.
- Use bounded retries and a dead-letter workflow.
- Monitor lag, rebalances, failures, and under-replicated partitions.

---

# 14. Primary references

- [Java unified JVM logging](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [Java diagnostic command reference](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [Oracle JFR troubleshooting guide](https://docs.oracle.com/en/java/javase/11/troubleshoot/troubleshoot-performance-issues-using-jfr.html)
- [Oracle memory-leak troubleshooting](https://docs.oracle.com/en/java/javase/25/troubleshoot/troubleshooting-memory-leaks.html)
- [Spring declarative transaction implementation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-decl-explained.html)
- [Spring transactional rollback rules](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html)
- [Spring bean scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html)
- [Spring dependency injection](https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html)
- [Spring Boot metrics](https://docs.spring.io/spring-boot/reference/actuator/metrics.html)
- [Spring Boot health probes](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [Hibernate Query Language and fetching](https://docs.hibernate.org/orm/7.3/querylanguage/)
- [HikariCP configuration](https://github.com/brettwooldridge/HikariCP)
- [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/)
- [OpenTelemetry context propagation](https://opentelemetry.io/docs/concepts/context-propagation/)
- [AWS guidance on idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- [AWS guidance on limiting retries](https://docs.aws.amazon.com/wellarchitected/2023-04-10/framework/rel_mitigate_interaction_failure_limit_retries.html)
- [Apache Kafka design and delivery guarantees](https://kafka.apache.org/design/)
- [Apache Kafka consumer configuration](https://kafka.apache.org/42/configuration/consumer-configs/)
- [Apache Kafka rebalance listener API](https://kafka.apache.org/42/javadoc/org/apache/kafka/clients/consumer/ConsumerRebalanceListener.html)
- [Spring Kafka transactions](https://docs.spring.io/spring-kafka/reference/kafka/transactions.html)
- [Spring Kafka rebalance listeners](https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages/rebalance-listeners.html)
- [Amazon MSK overview](https://docs.aws.amazon.com/msk/latest/developerguide/what-is-msk.html)

