# Frameworks

Review questions for the [Frameworks](../../wiki/frameworks/index.md) topic.

## SPRING-TX-001 — Why can a transactional method fail to start a transaction during self-invocation?

Source: [Spring transactions, beans, and scopes](../../wiki/frameworks/spring-transactions-beans-and-scopes.md)

Expected points:

- Declarative transactions normally depend on calls passing through a Spring proxy.
- A direct same-object call bypasses that proxy.
- The method body still executes, but its proxy advice is not applied.
- Put the boundary on an externally invoked method or move the operation to another bean.

## SPRING-SCOPE-001 — What happens when a prototype bean is injected into a singleton?

Source: [Spring transactions, beans, and scopes](../../wiki/frameworks/spring-transactions-beans-and-scopes.md#scope-traps)

Expected points:

- The prototype is created when the singleton is constructed.
- The singleton retains that same instance.
- Ordinary method calls do not trigger another container lookup.
- Use `ObjectProvider`, method injection, or an appropriate scoped proxy when a fresh instance is required.
