# Connection Versus Request Timeouts

## Separate waits, separate settings

An outbound HTTP call is made of several separate waits, and each timeout setting bounds only one of them. A wait that no setting covers can last indefinitely. In the JDK client, leaving `HttpRequest.timeout` unset is documented as equivalent to an infinite duration, so the call can block forever. [Source](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md#key-ideas)

```text
 Thread                                   Server
   │ ① wait for a free pooled connection
   │ ② connect: DNS → TCP handshake (+TLS) ►│
   │ send request ────────────────────────►│
   │ ③ wait for bytes … (reset per arrival) │
   │◄──────── headers / body chunks ───────│
   ▼ done
 ④ ═══════════ total time for the whole call ═══════════
```

| Wait | Typical setting | What it bounds |
| --- | --- | --- |
| ① Pool acquisition | `connectionRequestTimeout` (Apache HttpClient) | Waiting for the caller's own pool to hand out a connection |
| ② Connect | `connectTimeout` | Establishing the connection: TCP handshake, and TLS on clients that include it |
| ③ Read / socket | `readTimeout`, `SO_TIMEOUT` | The silence between two reads; the clock resets whenever data arrives |
| ④ Request / overall | JDK `HttpRequest.timeout(...)`, a response or call timeout | The response as a whole, measured from the start of the call |

[Source](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md#key-ideas)

Once the connection is open, the connect timeout has done its job and never fires again for that call. A server that accepts the connection and then goes silent is therefore a read or overall-timeout problem, not a connect-timeout problem. [Source](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md#your-check-in-answers)

## Read timeouts are not total caps

A read timeout bounds the gap between bytes, not the total response time. With a 5 s read timeout, a server that sends one byte every 4 s keeps the call alive indefinitely; only an overall timeout caps the elapsed time. The danger is a slow trickle, not a large response that streams quickly. [Source](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md#key-ideas) [Source](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md#your-check-in-answers)

The session's rule of thumb:

- **Connect:** "can I reach it at all?" Keep it short, a few hundred milliseconds to about one second within one region.
- **Read:** "has it gone silent?"
- **Overall:** "how long am I willing to wait in total?" This is the setting that protects caller threads.

## Worked example

With the JDK `java.net.http.HttpClient` (Java 11+; semantics checked against the Java 21 API documentation): [Source](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md#worked-example)

```java
HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(2))      // bounds ②
        .build();

HttpRequest req = HttpRequest.newBuilder(URI.create("https://payments/api/42"))
        .timeout(Duration.ofSeconds(3))             // bounds the wait for the response
        .build();
```

| Situation | Outcome |
| --- | --- |
| Firewall silently drops SYN packets | Fails after about 2 s with `HttpConnectTimeoutException` |
| Connection opens in 50 ms, then the server is silent for 10 s | Fails about 3 s after the call starts with `HttpTimeoutException` |

Without a connect timeout, dropped SYNs are governed by the operating system's retries; the source states roughly two minutes on default Linux from memory, which is **unverified** here.

## Pool acquisition: the forgotten wait

With a bounded connection pool and a slow downstream service, extra requests queue for the caller's own pool before touching the network. Connect and read timeouts have not started for them, so threads pile up without any timeout errors in the logs. A pool-acquisition timeout such as Apache HttpClient's `connectionRequestTimeout` bounds that queue. [Source](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md#trade-off--common-mistake)

Scenario from the session: a pool of 20 connections, `connectionRequestTimeout` unset, a 2 s read timeout, and an inventory dependency whose p99 rose to 1.8 s. Twenty connections each held for about 1.8 s give roughly 11 requests per second of capacity; the slow calls stay under the read timeout, so nothing fires while all 200 Tomcat threads wait on the pool. Setting the pool-acquisition timeout to about 1 s, or a few hundred milliseconds, makes the overload fail visibly instead. [Source](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md#trade-off--common-mistake)

## Trade-off: too tight versus too loose

Tight timeouts free threads quickly but turn slow-but-valid responses into errors. Loose timeouts tolerate slow dependencies but cost threads and memory while waiting. A 30 s connect timeout to a same-region dependency holds a thread for 30 s on every call to a dead host, which can exhaust the thread pool. A connect timeout of 100 ms or less fails on ordinary SYN loss and can trigger retry storms; the source's figure of about 1 s for the first SYN retransmission on Linux is from memory and **unverified**. [Source](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md#trade-off--common-mistake)

## Source status and related knowledge

This page synthesizes one learning-session summary. The JDK `HttpRequest.Builder.timeout` semantics were fetched and confirmed during the session; the Linux SYN-retry timings and Apache HttpClient setting names were not verified against a specific version. No conflicting wiki claims were found: [Service resilience and observability](service-resilience-and-observability.md#timeouts-and-deadlines) already recommends bounded per-stage timeouts plus an end-to-end deadline, and this page details which stage each setting covers. Allocating a caller's remaining time across downstream calls (deadline propagation) is outside this page. Related pages: [Latency averages and percentiles](latency-averages-and-percentiles.md) and [JPA and database performance diagnosis](../data-access/jpa-and-database-performance-diagnosis.md) (database pool-acquisition signals).

Sources: [captured connection-versus-request-timeouts learning session](../../sources/notes/reliability/connection-vs-request-timeouts-learning-session.md), library entry [121. Connection versus request timeouts — learning session](../library/notes/connection-vs-request-timeouts.md)
