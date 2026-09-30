# Capture metadata

- Title: System design fundamentals
- Captured: 2026-09-30
- Source type: User-supplied technical note
- Origin: User conversation
- Provenance note: The submitted wording is preserved below, including spelling errors and the final empty bullet. Corrected explanations and verification are recorded in the wiki synthesis.

---

Here are multiple things regarding the system desgin questions:

- reliability: the ability of a system to function despite failures (such as outages, or hardware crash)
- Consistency: The system is in a consistent state, meaning that all nodes see the same data.
- Availability: All systems are operational and accessible.
- partition tolerance: the system continues to work even though the communication between nodes is broken.
- state management, which can be stateless (each request is idependent) or stateful (there is information remembered from the previous request e.g. video streaming session)
- data partitiong: this one helps with the scalability and performance of the application. however partitioning can also affect the performance of the queries because there might be join conditions in which there is data that needs to be fetched from multiple shards. There are multiple types of data partitioning:
  - horizontal - certain rows are stored in different servers/shards
  - vertical.   - certain columns are stored in different servers/shards
  - hash based - uses a hash function
  - range-based - data is stored based on a range.
- replication strategies - copying data in order to make the systems fault tolerant
  - async -> primary node is updated and then the replicas are updates async, which creates eventual consistency
  - sync -> primary updates and all the replicas update at the same time -> strong consistency, but affects performance.
  - Quorum based: majority of replicas agree before updating.
- Conssitency models
  - strong - always all the servers see the latest data
  - eventual - there might be a short delay in which some servers see old data, but in the end all end up seeing the same latest data.
  - causal - if there is dependency, lets say post A causes comment b to show, for all users they should see A -> B
-
