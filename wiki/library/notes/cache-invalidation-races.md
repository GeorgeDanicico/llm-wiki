# 106. Cache invalidation races — learning session

## Coverage

A user-supplied learning-session summary on cache invalidation races in cache-aside: a reader's non-atomic database read and cache fill, a writer's delete landing in that gap, how long the stale value lives, a Spring and Redis example, reading interleaved timelines, why delete-first widens the window, the learner's check-in answers, and a remark about modelling the safe ordering.

## Ideas contributed to the wiki

- [Cache invalidation races](../../reliability/cache-invalidation-races.md)

## Source status

Captured on 2026-11-25 from a local learning-session file (topic 106, area 06. Caching). The ingestion preserves the summary's wording. Its TTL values and timelines are illustrative. The mitigations (short TTL, delayed second delete, versioned writes) were named from memory and not taught, so they are unverified. The tutor and the learner framed Timeline B differently (ordering between separate systems versus a serial-units teaching model); both framings are preserved. The "Next steps" plan is study planning and was not synthesized. No conflicting wiki claims were identified.

Source: [captured cache invalidation races learning session](../../../sources/notes/reliability/cache-invalidation-races-learning-session.md)
