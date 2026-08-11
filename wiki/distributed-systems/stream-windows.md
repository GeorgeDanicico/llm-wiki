# Stream Windows

Windows turn an unbounded stream into finite groups that can be aggregated or compared.

| Window | Shape in the source notes | Key property |
| --- | --- | --- |
| Tumbling | Consecutive fixed windows | Each event belongs to exactly one window. |
| Hopping | Fixed windows that start at a regular hop interval | Windows may overlap, so one event may contribute to more than one window. |
| Sliding | A moving time range | Events leave the range when they become older than its duration. |
| Session | Activity grouped by a key such as a user-session ID | Boundaries are driven by related activity rather than a shared fixed schedule. |

## Selection heuristic

Use tumbling windows for non-overlapping periodic summaries, hopping windows for overlapping periodic views, sliding windows for a continuously moving recent interval, and session windows when the meaningful grouping is a burst of activity associated with an entity.

The imported session-window note says “there is no time,” but that wording is ambiguous and should not be read as a general claim that session windows never use time-based inactivity gaps.

Source: [personal notes on Chapter 11 of *Designing Data-Intensive Applications*](../../sources/books/designing-data-intensive-applications.md#reasoning-about-time)

