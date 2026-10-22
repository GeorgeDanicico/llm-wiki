# Capture metadata

- Title: 004. Dependency injection — learning session
- Captured: 2026-10-22
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/learning-sessions/2026-10-22-004-dependency-injection.md` (20-minute software-engineering learning session, area 01. Architecture fundamentals)
- Provenance note: Generated as a learning-session summary by an AI tutor. No external documentation was fetched during the session; the Spring remarks (lone-constructor injection without `@Autowired` since Spring 4.3, the documentation's constructor-injection recommendation, container behaviour), the Mockito static-mocking remark, and the reading list (Martin Fowler, the Spring reference documentation, Seemann and van Deursen) were stated from memory and are unverified.

---

# 004. Dependency injection
Date: 2026-10-22 · Area: 01. Architecture fundamentals · Status: done

## Lesson boundary
Compare constructor injection with constructing dependencies inside a class.

## Key ideas
- Dependency injection (DI) means a class receives its collaborators from outside instead of creating them. The caller (a test, `main`, or a framework such as Spring) decides which implementation to pass.
- Inversion versus injection: inversion is a design rule about who owns the abstraction and which way source dependencies point. Injection is a technique about who creates and supplies the collaborator. You can have either without the other: `new JdbcOrderRepository()` inside a class that holds the port type is inversion without injection; injecting a concrete class from outside is injection without inversion.
- Constructing inside (`private final OrderRepository orders = new JdbcOrderRepository();`) hard-wires which implementation, how it is built, and how long it lives. The domain class must import the infra class, which undoes the inversion from topic 003, and a test cannot swap in a fake.
- Constructor injection is usually preferred: the object cannot be half-built, dependencies can be `final`, the signature shows everything the class needs, and tests use plain `new` with no framework or reflection. Setter injection fits optional or replaceable dependencies. Field injection (`@Autowired private ...`) needs a container or reflection to populate the field, so a plain `new` leaves it `null`.
- A long constructor is a symptom, not the problem. Nine parameters usually mean the class has too many reasons to change; split it rather than hide the list with field injection or a builder.
- Anything a class obtains from outside its own logic (ids, randomness, network clients, files) can be a dependency. Injecting it makes tests deterministic, whereas static calls inside the class force static-mocking workarounds.

## Worked example
```java
interface PaymentClient { boolean charge(String orderId, long cents); }

class CheckoutService {
    private final PaymentClient payments;
    private final OrderRepository orders;

    CheckoutService(PaymentClient payments, OrderRepository orders) {  // a lone constructor needs
        this.payments = payments;                                       // no @Autowired in Spring 4.3+
        this.orders = orders;
    }

    String checkout(String orderId) {
        Order o = orders.get(orderId);
        return payments.charge(orderId, o.totalCents()) ? "PAID" : "DECLINED";
    }
}
```

Production: Spring creates `StripePaymentClient` and `JdbcOrderRepository` beans and passes them in. Plain unit test, with no Spring and no database:

```java
var orders = new InMemoryOrderRepository(new Order("o1", 5_000));
PaymentClient alwaysDeclines = (id, cents) -> false;
var svc = new CheckoutService(alwaysDeclines, orders);
System.out.println(svc.checkout("o1"));   // DECLINED
```

Changing the stub to `(id, cents) -> true` covers the `PAID` path.

## Trade-off / common mistake
- A constructor with many parameters (e.g. nine collaborators) signals low cohesion. Group related collaborators behind a smaller abstraction (e.g. pricing and tax behind `OrderPricing`, email and audit behind `OrderNotifier`) and split the class.
- Circular constructor dependencies (`A(B)` and `B(A)`) cannot be built; constructor injection surfaces the cycle at startup, where field injection tends to hide it.
- Scenario: a teammate proposes switching every dependency to `@Autowired` fields so the constructor "looks cleaner". Disagree: fields cannot be `final`, objects can exist half-built, and tests need a Spring context or reflection. A builder only repackages the same nine arguments; builders suit value objects with many optional fields, not services.
- `@Service` on a class does not make it injected: `B() { this.repo = new JdbcRepo(); }` is still hard-wired.
- Static calls such as `UUID.randomUUID()` inside a method cannot be controlled in a test without a static-mocking library. Inject the source instead: `OrderFactory(Supplier<String> ids)`, with `() -> UUID.randomUUID().toString()` in production and `() -> "id-1"` in a test.

## Flashcards
- Q: Inversion versus injection? / A: Inversion: the business side owns the abstraction, so source dependencies point toward it. Injection: the caller supplies the collaborator instead of the class creating it.
- Q: Name two advantages of constructor injection over field injection. / A: The object cannot be half-built and dependencies can be `final`; tests use plain `new`, and the signature shows every dependency.
- Q: What does a constructor with nine parameters tell you? / A: The class probably does too much. Split it rather than hiding the list with field injection or a builder.
- Q: What happens with `@Autowired private PaymentClient payments;` when a plain unit test calls `new CheckoutService()`? / A: Nothing populates the field, so it stays `null` and using it throws a `NullPointerException`.
- Q: How do you make a method that calls `UUID.randomUUID()` testable? / A: Inject the id source (e.g. a `Supplier<String>`) rather than calling the static method inside the class.

## Your check-in answers
- Warm-up (inversion versus injection) → ✅ both halves right; sharpened to "who owns the abstraction" versus "who supplies the collaborator"
- Can a test swap the repository when it is constructed inside? → ✅ no, the class initialises the JDBC repository itself
- `@Autowired` field in a plain unit test → ✅ it fails because the field is never initialised (specifically a `NullPointerException`)
- Predict the `CheckoutService` test → ✅ prints `DECLINED`; flip the stub to return `true` for `PAID`
- Scenario: switch to field injection to shorten a nine-argument constructor → 🟡 right about testability, but suggested a builder, which only hides the symptom; the fix is splitting the class
- Q1: what is wrong with `new JdbcOrderRepository()` inside `OrderService` → ✅ depends on the JDBC implementation; injection lets you supply any implementation and test with others (addition: the domain imports infra)
- Q3: which class still has a problem → ✅ B, because it initialises the repo itself instead of receiving it (`@Service` does not change that)
- Follow-up: testing a method that calls `UUID.randomUUID()` → 🟡 right goal (a fixed id), but "make `randomUUID` return the same value" needs static mocking; the DI answer is to inject an id supplier

## Seen in the wild
- Spring Framework's IoC container wires beans through constructors, setters, or fields, and its documentation recommends constructor injection for mandatory dependencies. Stated from memory, not verified in this session.

## Learn more
- Martin Fowler, "Inversion of Control Containers and the Dependency Injection pattern" (martinfowler.com): the classic article on constructor, setter, and interface injection. From memory, not checked.
- Spring Framework reference documentation, "Dependency Injection": constructor-based versus setter-based injection. From memory, not checked.
- Mark Seemann and Steven van Deursen, *Dependency Injection Principles, Practices, and Patterns* (Manning): a book-length treatment, including constructor over-injection. From memory, not checked.

## Next up
- 005. Hexagonal architecture — trace one use case through an inbound adapter, port, and outbound adapter. It builds on 003 and 004, both done, so no redirect.
