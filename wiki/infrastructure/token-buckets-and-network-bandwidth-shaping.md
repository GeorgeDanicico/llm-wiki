# Token buckets and network bandwidth shaping

A token bucket controls the average rate of operations while permitting bounded bursts. Network bandwidth shaping is one application of that mechanism: it deliberately controls how quickly network data is transmitted so traffic can be smoothed, congestion reduced, or important applications prioritized.

> **Source status:** This page synthesizes an AI-assisted conversational note that has not been checked against an external authoritative source. Treat the details below as useful working knowledge rather than independently verified documentation.

## Token-bucket mechanism

A bucket has two principal controls:

- **Refill rate:** how quickly new tokens become available; this sets the sustainable long-term throughput.
- **Capacity:** the largest number of tokens the bucket can hold; this bounds how large a saved-up burst can be.

An operation consumes one or more tokens. When enough tokens are available, the operation proceeds. When they are not, the system may reject, delay, or queue it. Unused tokens accumulate only up to the bucket's capacity.

For example, a bucket holding at most 20 tokens and refilling at 5 tokens per second can admit an immediate burst of 20 one-token requests. After that burst, it sustains an average of 5 such requests per second. This is more flexible than a strict fixed window because unused capacity can be saved for a later burst.

Token buckets can be used for API rate limits, authentication throttling, background-job control, overload protection, customer quotas, and network bandwidth shaping.

## Bandwidth shaping with a token bucket

In network shaping, tokens are generated at the permitted average data rate, and transmitting a packet consumes tokens according to the packet's size. A packet can be sent while sufficient tokens are available. Otherwise, it waits in a queue or is handled according to the configured policy.

One example is a router on a 100 Mbps connection that limits backup traffic to an average of 20 Mbps while reserving room for video calls. A burst allowance can let backups temporarily exceed their average rate when capacity has accumulated, while excess packets are queued.

## Shaping versus policing

Traffic shaping normally delays excess traffic to bring it into conformance with the configured rate. Traffic policing typically drops or marks traffic that exceeds its policy. The distinction is therefore chiefly about what happens to traffic that arrives too quickly: shaping smooths it through delay, whereas policing enforces the limit without waiting for it.

## Source

- [AI-assisted conversational note: token buckets and network bandwidth shaping](../../sources/notes/technologies/token-buckets-and-network-bandwidth-shaping.md)
