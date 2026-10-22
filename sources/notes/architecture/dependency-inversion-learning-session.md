# Capture metadata

- Title: 003. Dependency inversion — learning session
- Captured: 2026-10-22
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/learning-sessions/2026-10-22-003-dependency-inversion.md` (20-minute software-engineering learning session, area 01. Architecture fundamentals)
- Provenance note: Generated as a learning-session summary by an AI tutor. No external documentation was fetched during the session; the hexagonal-architecture, Spring Data, Spring `@Profile`/`@ConditionalOnProperty`, Spring Data derived-query remarks, and the reading list (Robert C. Martin, Alistair Cockburn, Martin Fowler) were stated from memory and are unverified.

---

# 003. Dependency inversion
Date: 2026-10-22 · Area: 01. Architecture fundamentals · Status: done

## Lesson boundary
Make a business service depend on a port rather than a database client.

## Key ideas
- Without inversion, the business service (high level) imports the database client (low level). It cannot be compiled, tested, or changed without the detail, and the rule is buried under SQL and driver exceptions.
- With inversion, the business side declares an interface, the **port** (e.g. `OrderRepository`), and the database adapter (`JdbcOrderRepository`) implements it. The source-code dependency arrow points from the low-level module toward the high-level one. Runtime calls still flow from the service to the database.
- The port is owned by the business side, in the domain package. If it lived in the infra package, the domain would have to import infra, and nothing would be inverted. The package that holds the interface decides the direction, not the mere presence of an interface.
- The port is phrased in business vocabulary (`get(id)`, `save(order)`, `findLargeOrdersFromCountry(...)`), not storage vocabulary. A port exposing SQL strings, `SQLException`, or JPA semantics is a leaky port: the arrows point the right way, but the business code still depends on the detail in spirit.
- Dependency inversion is about who owns the abstraction. Dependency injection (topic 004) is about how the implementation is handed in. They are separate ideas.

## Worked example
Before: `OrderService` holds a `JdbcTemplate`, runs `queryForMap("SELECT ...")`, checks the total limit inline, and runs an `UPDATE`.

After:

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

Test with `new OrderService(new InMemoryOrderRepository())`, with no database. Switching from PostgreSQL to DynamoDB means adding a `DynamoOrderRepository` and changing the wiring (a `@Profile`, `@ConditionalOnProperty`, or qualifier). `OrderService`, the port, and the domain tests stay unchanged.

## Trade-off / common mistake
- Leaky port: `Order get(long id) throws SQLException`, `findBySql(String where)`, or `flushAndClear()` tie the contract to JDBC or JPA, so a DynamoDB adapter would force changes in the domain. Use domain-level exceptions that the adapter translates to.
- Scenario: a teammate proposes `List<Row> runQuery(String sql)` on `OrderRepository` "for flexibility". Reject it. Beyond the injection risk, it puts SQL in the contract. Add a business-named method (e.g. `findLargeOrdersFromCountry(Country, Money)` returning a read model) and keep the join inside the adapter. If reports keep growing, consider a separate read-only reporting port (CQRS-flavoured, topic 019).
- Vendor libraries cannot implement your interface: write an adapter (`SendGridEmailSender implements EmailSenderPort`) that wraps the vendor client.

## Flashcards
- Q: Who owns the port, and which way does the source dependency point? / A: The business (high-level) side owns it in the domain package, and the infrastructure adapter depends on it.
- Q: What makes a port "leaky"? / A: It exposes storage concepts (SQL, `SQLException`, JPA semantics), so the business code still depends on the detail.
- Q: Why does an interface placed in the infra package defeat inversion? / A: The domain must import infra to use it, so the dependency still points from business to infrastructure.
- Q: How does inversion help testing? / A: You inject an in-memory implementation and test business rules without a database.
- Q: Dependency inversion versus dependency injection? / A: Inversion decides who owns the abstraction and which way the arrows point. Injection is the mechanism that supplies the implementation.

## Your check-in answers
- Warm-up (what `OrderService` knows about an `OrderRepository` interface) → ✅ it only knows the contract, not how orders are stored
- Who owns the port → ✅ the business module, because it knows the operations it needs
- Fill-in on direction → ✅ low-level modules toward high-level modules
- Predict the DynamoDB swap → ✅ service and port unchanged, a new adapter plus wiring (qualifiers). Note: `@Profile` or conditional properties avoid keeping two beans active.
- Scenario: `runQuery(String sql)` on the port → 🟡 spotted the SQL-safety risk, but missed that SQL in the contract is a leaky port
- Q1: why an interface in the infra package defeats inversion → 🟡 described the right layout but not why: the domain would import infra, so the arrow points the wrong way
- Q2: restructure the email-sending service → ✅ port in the domain, vendor adapter in infra. Refinements: wrap the vendor client in an adapter, and phrase the port in business terms.
- Q3: spot the leaky port (`throws SQLException`) → ✅ C

## Seen in the wild
- Hexagonal architecture (ports and adapters), Alistair Cockburn: the application core defines ports and adapters implement them. This is dependency inversion applied to a whole application. Named from memory, not verified in this session.
- Spring Data repositories: a common practice is to define a domain-facing repository interface and keep the persistence-technology details in an adapter. This is the author's recollection of common usage, not a specific verified case.

## Learn more
- Robert C. Martin, "The Dependency Inversion Principle" (C++ Report, 1996) and *Clean Architecture* (Prentice Hall): the original statement and the dependency rule. From memory, not checked.
- Alistair Cockburn, "Hexagonal architecture": ports and adapters at application scale. From memory, not checked.
- Martin Fowler, "DIP in the Wild" (martinfowler.com): where the principle shows up in practice and how it differs from injection. From memory, not checked.

## Next up
- 004. Dependency injection — compare constructor injection with constructing dependencies inside a class. Requires 003, now done, so no redirect.
