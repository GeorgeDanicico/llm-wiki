# Event Time and Processing Time

Event time is when an event says it occurred; processing time is when a processing system observes or handles it. In a distributed system, network failures, slow consumers, queues, and partition behavior can separate these moments and alter arrival order.

Confusing event time with processing time can produce incorrect results and misleading observability. Any computation whose meaning depends on sequence or time boundaries should state which clock it uses and what it does with late or out-of-order events.

## Practical questions

- Does the event carry a trustworthy occurrence timestamp?
- Is the computation ordered by occurrence or arrival?
- How late may an event arrive before the result is considered final?
- Can a delayed event revise an already emitted result?

Source: [personal notes on Chapter 11 of *Designing Data-Intensive Applications*](../../sources/books/designing-data-intensive-applications.md#reasoning-about-time)

