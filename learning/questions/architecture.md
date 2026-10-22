# Architecture

Review questions for the [Architecture](../../wiki/architecture/index.md) topic.

## ARCH-DI-001 — In dependency inversion, which side owns the port, and which way does the source-code dependency point?

Source: [Dependency inversion](../../wiki/architecture/dependency-inversion.md#the-inversion-the-business-side-owns-the-port)

Expected points:

- The business (high-level) side declares the port, for example an `OrderRepository` interface in the domain package.
- The infrastructure adapter, such as `JdbcOrderRepository`, implements it, so the source dependency points from the low-level module toward the high-level one.
- Runtime calls still flow from the service to the database; only the compile-time dependency is inverted.

## ARCH-DI-002 — Why does placing `OrderRepository` in the infra package defeat dependency inversion even though `OrderService` still uses an interface?

Source: [Dependency inversion](../../wiki/architecture/dependency-inversion.md#the-inversion-the-business-side-owns-the-port)

Expected points:

- `OrderService` would have to import the interface from the infra package, so the domain depends on infrastructure.
- The domain could not be compiled, tested, or reused without the infra module.
- The package that holds the interface decides the direction; having an interface is not enough.

## ARCH-DI-003 — What is a leaky port, and why is `Order get(long id) throws SQLException` an example?

Source: [Dependency inversion](../../wiki/architecture/dependency-inversion.md#leaky-ports)

Expected points:

- A leaky port exposes storage concepts such as SQL, JDBC types, or JPA semantics in the business contract.
- `SQLException` ties the domain to JDBC, so a DynamoDB adapter could not honour the contract without changing the domain.
- Prefer business vocabulary and domain-level exceptions that the adapter translates to.

## ARCH-DI-004 — A teammate proposes adding `List<Row> runQuery(String sql)` to the repository port "for flexibility". How do you respond?

Source: [Dependency inversion](../../wiki/architecture/dependency-inversion.md#leaky-ports)

Expected points:

- Reject it: beyond the injection risk, it puts SQL in the contract and ties the business code to a relational store.
- Add a business-named method, such as `findLargeOrdersFromCountry(Country, Money)`, returning a read model, and keep the join inside the adapter.
- If reporting keeps growing, a separate read-only reporting port is an option; the session linked this to CQRS but did not develop it.

## ARCH-INJ-001 — What is the difference between dependency inversion and dependency injection?

Source: [Dependency injection](../../wiki/architecture/dependency-injection.md#inversion-versus-injection)

Expected points:

- Inversion is a design rule about who owns the abstraction and which way source dependencies point.
- Injection is a technique about who creates and supplies the collaborator: the caller passes it in instead of the class constructing it.
- Either can exist without the other; `new JdbcOrderRepository()` inside a class holding the port type is inversion without injection.

## ARCH-INJ-002 — What is wrong with `private final OrderRepository orders = new JdbcOrderRepository();` inside `OrderService`, and what does constructor injection change?

Source: [Dependency injection](../../wiki/architecture/dependency-injection.md#injection-versus-construction-inside-the-class)

Expected points:

- The class fixes which implementation it uses, how it is built, and how long it lives, and must import the infrastructure class.
- That undoes the dependency inversion, and a test cannot swap in a fake or in-memory repository.
- With constructor injection the class only declares what it needs and the caller supplies the implementation.

## ARCH-INJ-003 — Give reasons constructor injection is usually preferred over field injection.

Source: [Dependency injection](../../wiki/architecture/dependency-injection.md#why-constructor-injection-is-usually-preferred)

Expected points:

- The object cannot be half-built, and dependencies can be `final`.
- The constructor signature shows every dependency the class needs.
- Tests use plain `new` with no framework or reflection; with a field-injected class a plain `new` leaves the field `null`, so using it throws a `NullPointerException`.

## ARCH-INJ-004 — A constructor takes nine collaborators and a teammate proposes `@Autowired` fields or a builder to shorten it. How do you respond?

Source: [Dependency injection](../../wiki/architecture/dependency-injection.md#trade-offs-and-common-mistakes)

Expected points:

- A long constructor is a symptom that the class has too many reasons to change; the fix is splitting it or grouping related collaborators behind a smaller abstraction.
- Field injection hides the symptom, prevents `final` fields, allows half-built objects, and needs a container or reflection in tests.
- A builder only repackages the same arguments; builders suit value objects with many optional fields, not services.
