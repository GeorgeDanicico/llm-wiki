# Token buckets and network bandwidth shaping

- Capture date: 2026-08-15
- Source type: AI-assisted conversational note
- Origin: User inquiry answered by Codex in the current conversation, then explicitly requested for capture
- User capture request: “Alright, save this information”
- Verification status: Not checked against an external authoritative source

## Captured wording

### Token bucket

The wiki doesn’t currently contain material about token buckets.

**Beyond the wiki:** A token bucket is an algorithm for rate limiting traffic or requests while still allowing short bursts.

- The bucket holds up to a fixed number of tokens.
- Tokens are added continuously at a fixed refill rate.
- Each operation consumes one or more tokens.
- If enough tokens exist, the operation proceeds.
- Otherwise, it is rejected, delayed, or queued.

Example: a bucket with a capacity of 20 tokens that refills at 5 tokens per second allows:

- A burst of up to 20 requests.
- A sustained average of 5 requests per second afterward.
- Unused capacity to accumulate, but never beyond 20 tokens.

It is commonly used for:

- API rate limiting.
- Network bandwidth shaping.
- Login or authentication throttling.
- Controlling background jobs.
- Protecting services from overload.
- Enforcing customer usage quotas.

The refill rate controls the long-term throughput, while the bucket capacity controls the permitted burst size. Unlike a strict “5 requests every second” window, a token bucket lets users save unused capacity for a later burst.

### Network bandwidth shaping

The wiki doesn’t currently contain material about network bandwidth shaping.

**Beyond the wiki:** Network bandwidth shaping—also called traffic shaping—is deliberately controlling how quickly network data is transmitted. Its purpose is to smooth traffic, prevent congestion, or prioritize important applications.

For example, on a 100 Mbps connection, a router might:

- Limit backups to 20 Mbps.
- Guarantee enough capacity for video calls.
- Allow backups to briefly exceed 20 Mbps when the network is idle.
- Queue excess packets instead of immediately dropping them.

A token bucket can implement this:

- Tokens are generated at the permitted average data rate.
- Sending a packet consumes tokens based on its size.
- If enough tokens are available, the packet is sent.
- Otherwise, it waits in a queue or is handled according to policy.

Shaping normally delays excess traffic. This differs from **traffic policing**, which typically drops or marks traffic that exceeds the limit.
