# Capture metadata

- Title: 121. Connection versus request timeouts — learning session
- Captured: 2026-10-08
- Source type: User-supplied learning-session summary
- Origin: Local file `~/Documents/learning-sessions/2026-10-08-121-connection-vs-request-timeouts.md` (20-minute software-engineering learning session, area 07. Resilience and overload control)
- Provenance note: Generated as a learning-session summary. During the session, the Java SE 21 `HttpRequest.Builder.timeout(Duration)` documentation was fetched and confirmed (throws `HttpTimeoutException`; unset equals an infinite duration). The Linux SYN-retry figures (~2 minutes total, ~1 s first retransmission) and the Google SRE reference were stated from memory and not verified; Apache HttpClient setting names were not checked against a specific version.

---

# 121. Connection versus request timeouts
Date: 2026-10-08 · Area: 07. Resilience and overload control · Status: done

## Lesson boundary
Identify which wait each setting bounds.

## Key ideas
- An outbound HTTP call is made of **several separate waits**, and each timeout setting bounds only one of them. A wait with no setting can last forever: in the JDK client, not setting `HttpRequest.timeout` "is the same as setting an infinite Duration, i.e. block forever."
- **① Pool acquisition** (`connectionRequestTimeout` in Apache HttpClient): waiting for your *own* pool to hand out a connection. **② Connect** (`connectTimeout`): establishing the connection (DNS → TCP handshake → TLS for HTTPS; whether TLS counts depends on the client). **③ Read / socket** (`readTimeout`, `SO_TIMEOUT`): the **gap between bytes**, reset every time data arrives. **④ Request / overall** (`HttpRequest.timeout(...)`, response or call timeout): the response as a whole, measured from the start.
- Once the connection is open, the connect timeout has done its job and never fires again. A server that accepts the connection and then goes silent is a **read/overall** problem.
- A read timeout is **not a total cap**. A slow trickle (one byte every 4 s with a 5 s read timeout) keeps a call alive indefinitely. Only an overall timeout caps the total time.
- Rule of thumb: **connect** → "can I reach it?" (short, a few hundred ms to ~1 s in one region); **read** → "has it gone silent?"; **overall** → "how long will I wait in total?" (the one that protects your threads).

## Worked example
```java
HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(2))      // bounds ②
        .build();

HttpRequest req = HttpRequest.newBuilder(URI.create("https://payments/api/42"))
        .timeout(Duration.ofSeconds(3))             // bounds the wait for the response
        .build();
```
- (a) Firewall silently drops SYN packets → fails after **~2 s** with `HttpConnectTimeoutException`. Without `connectTimeout`, the OS SYN retries decide (roughly 2 min on default Linux, from memory).
- (b) Connection opens in 50 ms, then the server is silent for 10 s → fails at **~3 s** from the start with `HttpTimeoutException` (JDK 11+, checked against the Java 21 API docs).

## Trade-off / common mistake
- **Mistake: forgetting wait ①.** With a pool of 20 and a slow downstream service, request 21 queues for your own pool before touching the network. The connect and read timeouts haven't started yet, so threads pile up with no timeout errors in the logs.
- **Trade-off:** tight timeouts free threads quickly but turn slow-but-valid responses into errors. Loose timeouts tolerate slow dependencies, but you pay in threads and memory. Too-low connect timeouts (≤100 ms) fail on ordinary SYN loss (first retransmission ≈1 s on Linux, from memory) and can trigger retry storms.
- **Decision scenario (your answer):** pool 20, `connectionRequestTimeout` unset, read 2 s, inventory p99 1.8 s, all 200 Tomcat threads busy, no timeout errors → threads stuck on pool acquisition; set `connectionRequestTimeout` ≈1 s (or a few hundred ms) ✅. 20 connections × 1.8 s each ≈ 11 req/s of capacity; the 1.8 s calls stay under the 2 s read timeout, so nothing fires.

## Flashcards
- Q: Which wait does a connect timeout bound, and when does it stop mattering? / A: Establishing the connection. Once the connection is open it never fires again for that call.
- Q: Why can a 5 s read timeout fail to stop a 10-minute response? / A: It bounds silence between reads; each byte resets the clock, so a trickle never trips it.
- Q: Which setting caps the total time of a call? / A: A request/overall timeout, e.g. JDK `HttpRequest.timeout(...)`.
- Q: Pool of 20, slow downstream, all threads busy, no timeout errors. Which wait is unbounded? / A: Pool acquisition; bound it with e.g. Apache HttpClient `connectionRequestTimeout`.
- Q: What if `HttpRequest.timeout` is never set in the JDK client? / A: Same as infinite: the call can block forever.

## Your check-in answers
- Prereq: what happens before the first request byte → ✅ TCP handshake; plus TLS for HTTPS and DNS before both.
- Hook check-in: why `connectTimeout = 2s` doesn't help a silent server → ✅ the stuck wait is reading bytes, not connecting.
- Predict (a) dropped SYN / (b) silent server → ✅✅ 2 s connect timeout / 3 s request timeout.
- Scenario: threads busy, no timeout errors → ✅ pool acquisition; set `connectionRequestTimeout`.
- Q1 Read vs overall timeout in your own words → ✅ Precision: the danger is a slow *trickle*, not a large response that streams quickly.
- Q2 `connectTimeout = 30s`, dead host → 🟡 1 s is right, but missed that each call holds a thread for 30 s (thread-pool exhaustion) and the too-low risk (SYN retransmission ≈1 s, needless failures, retry storms).
- Q3 Multiple choice: chunk every 1.5 s, read timeout 2 s → ✅ B: runs ~3 minutes, no timeout fires.

## Seen in the wild
- **JDK `java.net.http.HttpClient`** (Java 11+): `HttpClient.Builder.connectTimeout` vs `HttpRequest.Builder.timeout`; the latter throws `HttpTimeoutException` and is infinite when unset.
- **Apache HttpClient**: separates `connectionRequestTimeout` (pool lease), connect timeout, and socket/response timeouts.

## Learn more
- [HttpRequest.Builder — Java SE 21 API (Oracle)](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpRequest.Builder.html): exact semantics of `timeout(Duration)`, including the infinite default.
- Google SRE book — "Addressing Cascading Failures" (from memory): why long or missing timeouts let one slow dependency exhaust caller resources.

## Next up
- **122. Deadline propagation**: allocate one caller's remaining time across downstream operations. No prerequisite redirect.
- Revisit the "too low" side of the connect-timeout trade-off before 122.
