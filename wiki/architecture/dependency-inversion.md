# Dependency Inversion

## The problem: policy depends on detail

When a business service holds a database client directly, such as an `OrderService` that runs SQL through `JdbcTemplate`, the high-level policy depends on a low-level detail. The service cannot be compiled, tested, or changed without the detail, and the business rule sits under SQL and driver exceptions. [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#key-ideas)

```text
 OrderService  ──depends on──▶  JdbcOrderClient  ──▶  PostgreSQL
 (business policy)              (detail)
```

## The inversion: the business side owns the port

Dependency inversion has the business side declare an interface, the **port** (for example `OrderRepository`). The infrastructure adapter (`JdbcOrderRepository`) implements it. The source-code dependency then points from the low-level module toward the high-level one, while runtime calls still flow from the service to the database. [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#key-ideas)

```text
 OrderService ──uses──▶ «interface» OrderRepository ◀──implements── JdbcOrderRepository ──▶ PostgreSQL
 (domain)               (the PORT, owned by the domain)             (infra adapter)
```

Which package holds the interface decides the direction, not the mere presence of an interface. If `OrderRepository` lived in the infra package, the domain would import infra and the dependency would still point from business to infrastructure. The session's package layout was a `domain` package (service, entity, port) that imports nothing from `infra`, and an `infra` package that imports `domain`. [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#key-ideas) [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#your-check-in-answers)

## Worked example

Before the change, `OrderService` held a `JdbcTemplate`, queried rows, checked the total limit inline, and ran an `UPDATE`. After it, the service depends only on the port and the rule lives in the entity. [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#worked-example)

```java
// domain package
interface OrderRepository { Order get(long id); void save(Order order); }

class OrderService {
    private final OrderRepository orders;
    OrderService(OrderRepository orders) { this.orders = orders; }
    Order approve(long id) {
        Order o = orders.get(id);
        o.approve();               // the rule lives in Order
        orders.save(o);
        return o;
    }
}

// infra package
class JdbcOrderRepository implements OrderRepository { /* SQL here */ }
```

A test can build `new OrderService(new InMemoryOrderRepository())` with no database. Moving from PostgreSQL to DynamoDB means adding a `DynamoOrderRepository` and changing the wiring (the session named a `@Profile`, a `@ConditionalOnProperty`, or a qualifier). `OrderService`, the port, and the domain tests stay unchanged. [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#worked-example)

Vendor libraries cannot implement your interface. For an email provider, the pattern is a port in the domain and an adapter in infra (for example `SendGridEmailSender implements EmailSenderPort`) that wraps the vendor client. The port is best phrased in business terms, such as `orderApproved(Order)`, rather than `send(to, subject, html)`. [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#your-check-in-answers)

## Leaky ports

A port is leaky when it exposes storage concepts, so the arrows point the right way but the business code still depends on the detail. The session's examples were `Order get(long id) throws SQLException`, `findBySql(String where)`, and `flushAndClear()`. A DynamoDB adapter could not honour such a contract without forcing changes in the domain. A better contract uses business vocabulary and domain-level exceptions that the adapter translates to. [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#trade-off--common-mistake)

Scenario from the session: a teammate proposes `List<Row> runQuery(String sql)` on the repository "for flexibility". The session's answer was to reject it. Besides the injection risk, it puts SQL in the contract. Instead, add a business-named method such as `findLargeOrdersFromCountry(Country, Money)` that returns a read model, and keep the join inside the adapter. If reporting keeps growing, a separate read-only reporting port is an option; the session linked this to CQRS (a later catalog topic) and did not develop it. [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#trade-off--common-mistake)

## Inversion versus injection

Dependency inversion decides who owns the abstraction and which way the source dependencies point. Dependency injection is a separate idea about how an implementation is supplied to the class; the session deferred it to a later topic. In the example, the constructor parameter is where the implementation arrives, and the configuration or `main` picks `JdbcOrderRepository`. [Source](../../sources/notes/architecture/dependency-inversion-learning-session.md#key-ideas)

## Source status and related knowledge

This page synthesizes one learning-session summary written by an AI tutor. The session fetched no documentation. Its references to hexagonal architecture (ports and adapters), Spring Data repository practice, Spring `@Profile` and conditional properties, Spring Data derived queries, and the reading list are from memory and **unverified**. No conflicting wiki claims were found. Related page: [Spring transactions, beans, and scopes](../frameworks/spring-transactions-beans-and-scopes.md) covers how Spring resolves and scopes the beans that supply such implementations.

Sources: [captured dependency-inversion learning session](../../sources/notes/architecture/dependency-inversion-learning-session.md), library entry [003. Dependency inversion — learning session](../library/notes/dependency-inversion.md)
