# Time-Dependent Stream Joins

Correlating a sequence of events becomes non-deterministic when relevant events arrive in different orders across runs. Queues, partitions, network delays, and slow processing can all reorder observation without changing when the underlying events occurred.

Changing reference data introduces another temporal question: should an event join against the reference value that existed at event time or the value present at processing time? Stable identifiers and versioned dimension records can help a job recover the intended historical relationship.

## Uncertainty in the source

The original note associates this problem with slowly changing dimensions and says to add a unique identifier for the changing dimension. That points toward versioned dimension history, but it is too compressed to define a complete solution. The exact identifier, validity interval, and join semantics need to be specified for a real system.

Related: [Event time and processing time](event-time-and-processing-time.md), [Stream joins](stream-joins.md)

Source: [personal notes on Chapter 11 of *Designing Data-Intensive Applications*](../../sources/books/designing-data-intensive-applications.md#time-dependence-of-joins)

