# Stream-Processing Fault Tolerance

Bounded batch processing has a recovery advantage: its input can remain unchanged while a failed computation is restarted. Even if work is attempted more than once, a successful run can still produce an output that appears as though each input was incorporated once.

Continuous stream processing cannot simply wait for all input to arrive. The imported notes propose dividing a stream into batches so bounded units can be recovered, but the note ends before describing the mechanism or its guarantees.

## Questions a concrete design must answer

- Where is processing progress recorded?
- Which state and outputs are restored after failure?
- Can replay duplicate external side effects?
- Does “exactly once” describe processing, state updates, emitted output, or end-to-end observable effects?

## Source limitation

This topic is incomplete in the source collection. Treat the page as a framing note, not as an implementation recipe.

Source: [personal notes on Chapter 11 of *Designing Data-Intensive Applications*](../../sources/books/designing-data-intensive-applications.md#fault-tolerance)

