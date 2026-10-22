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
