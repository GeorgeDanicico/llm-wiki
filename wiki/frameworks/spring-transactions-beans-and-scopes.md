# Spring Transactions, Beans, and Scopes

## Transaction proxy boundary

Spring normally implements declarative transactions through an AOP proxy around a managed bean. An intercepted call lets the transaction interceptor inspect metadata, select the transaction manager, apply propagation, execute the target, and commit or roll back. `REQUIRED` joins an existing transaction or creates one. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#51-how-transactional-works)

A call from one method directly to another method on the same object does not pass through the proxy, so advice declared only on the inner method is not applied. Prefer a transaction on the externally invoked service method or move the operation to another bean. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#52-self-invocation)

## Rollback and asynchronous boundaries

- Runtime exceptions and errors cause rollback by default; checked exceptions do not unless configured.
- Catching an exception and returning normally can let the interceptor commit.
- A participating inner call may mark the shared transaction rollback-only, producing `UnexpectedRollbackException` when the outer call attempts to commit.
- Imperative transactions are usually thread-bound and do not propagate into executor or `@Async` work.
- Work that must happen after commit needs an after-commit mechanism, transactional event listener, or transactional outbox.

[Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#53-rollback-rules) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#54-asynchronous-boundaries)

A local Spring transaction does not automatically include an external HTTP call, an already-published message, another service, or a resource managed by a different transaction manager. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#55-proxy-and-resource-boundaries)

## Discovery and lifecycle

Component scanning registers bean definitions containing type, name, scope, dependency, qualifier, and initialization metadata. Discovery does not necessarily instantiate the bean immediately. During creation, Spring resolves dependencies, runs initialization callbacks and bean post-processors, and may return a proxy instead of the original instance. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#61-component-scanning-and-bean-definitions) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#63-simplified-bean-lifecycle)

Constructor injection makes required dependencies explicit and exposes cycles. Multiple candidates can be resolved using `@Qualifier`, `@Primary`, an injection-point name, or collection injection. [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#62-dependency-resolution)

## Scope traps

- A Spring singleton is one instance per bean definition per container, not a JVM-wide singleton.
- A prototype injected into a singleton is created once at singleton construction and retained; it is not recreated on every method call.
- Use `ObjectProvider`, method injection, or an appropriate scoped proxy for per-operation or contextual instances.
- Spring creates prototype objects but does not manage their full destruction lifecycle automatically.
- Constructor circular dependencies are not constructible; `@Lazy` may break the creation cycle but can hide a responsibility problem.
- Lazy initialization improves startup but delays failures and adds first-use latency.

[Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#64-scopes) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#65-prototype-injected-into-singleton) [Source](../../sources/notes/interview-preparation/java-spring-senior-interview-knowledge.md#66-circular-dependencies)
