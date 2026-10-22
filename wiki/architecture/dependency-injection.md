# Dependency Injection

## Injection versus construction inside the class

Dependency injection (DI) means a class receives its collaborators from outside instead of creating them. The caller (a test, `main`, or a framework such as Spring) decides which implementation is passed. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#key-ideas)

```java
// A. Constructed inside
class OrderService {
    private final OrderRepository orders = new JdbcOrderRepository();
}

// B. Constructor injection
class OrderService {
    private final OrderRepository orders;
    OrderService(OrderRepository orders) { this.orders = orders; }
}
```

In version A the class fixes which implementation it gets, how it is built, and how long it lives. It must import the infrastructure class, which undoes the inversion described in [Dependency inversion](dependency-inversion.md), and a test cannot swap in a fake. In version B the class only declares what it needs and the caller decides the rest. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#key-ideas) [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#your-check-in-answers)

## Inversion versus injection

Dependency inversion is a design rule about who owns the abstraction and which way source dependencies point. Dependency injection is a technique about who creates and supplies the collaborator. Either can exist without the other: `new JdbcOrderRepository()` inside a class that holds the port type is inversion without injection, and injecting a concrete class from outside is injection without inversion. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#key-ideas)

## Why constructor injection is usually preferred

The session compared three styles. Constructor injection passes dependencies as constructor parameters, setter injection through setters, and field injection through an annotated private field such as `@Autowired`. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#key-ideas)

| Reason | Effect |
| --- | --- |
| Cannot be half-built | The object never exists without its dependencies |
| Dependencies can be `final` | The object is immutable after construction |
| Honest signature | The constructor lists everything the class needs |
| Plain-Java tests | `new OrderService(fake)` needs no framework or reflection |

Setter injection suits optional or replaceable dependencies. With field injection a plain `new` leaves the field `null`, because only the container populates it, so using it throws a `NullPointerException`. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#key-ideas) [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#your-check-in-answers)

## Worked example

A `CheckoutService` receives a `PaymentClient` and an `OrderRepository` through its constructor. In production Spring creates the beans and passes them in; in the session a lone constructor needs no `@Autowired` from Spring 4.3 onward (from memory, unverified). [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#worked-example)

```java
var orders = new InMemoryOrderRepository(new Order("o1", 5_000));
PaymentClient alwaysDeclines = (id, cents) -> false;
var svc = new CheckoutService(alwaysDeclines, orders);
System.out.println(svc.checkout("o1"));   // DECLINED
```

The test needs no Spring and no database. Changing the stub to return `true` covers the `PAID` path. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#worked-example)

## Trade-offs and common mistakes

A long constructor is a symptom, not the problem. Nine collaborators usually mean the class has too many reasons to change. The session's advice was to group related collaborators behind a smaller abstraction and split the class, not to hide the list with field injection or a builder, which only repackages the same arguments. Builders suit value objects with many optional fields, not services. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#trade-off--common-mistake)

Circular constructor dependencies (`A(B)` and `B(A)`) cannot be built. Constructor injection surfaces the cycle at startup, where field injection tends to hide it. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#trade-off--common-mistake)

Annotating a class with `@Service` does not make it injected: a constructor that does `this.repo = new JdbcRepo()` is still hard-wired. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#your-check-in-answers)

Anything a class obtains from outside its own logic, such as ids, randomness, network clients, or files, can be a dependency. A static call like `UUID.randomUUID()` inside a method cannot be controlled in a test without a static-mocking library; injecting the source (for example a `Supplier<String>`) makes the result deterministic. [Source](../../sources/notes/architecture/dependency-injection-learning-session.md#trade-off--common-mistake)

## Source status and related knowledge

This page synthesizes one learning-session summary written by an AI tutor. The session fetched no documentation. Its Spring remarks, the static-mocking remark, and the reading list are from memory and **unverified**. No conflicting wiki claims were found. Related pages: [Dependency inversion](dependency-inversion.md) and [Spring transactions, beans, and scopes](../frameworks/spring-transactions-beans-and-scopes.md), which covers how Spring resolves and scopes the beans it injects.

Sources: [captured dependency-injection learning session](../../sources/notes/architecture/dependency-injection-learning-session.md), library entry [004. Dependency injection — learning session](../library/notes/dependency-injection.md)
