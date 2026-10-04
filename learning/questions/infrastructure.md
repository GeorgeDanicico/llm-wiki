# Infrastructure

Review questions for the [Infrastructure](../../wiki/infrastructure/index.md) topic.

## INFRA-TB-001 — How do refill rate and bucket capacity affect a token bucket?

Source: [Token buckets and network bandwidth shaping](../../wiki/infrastructure/token-buckets-and-network-bandwidth-shaping.md)

Expected points:

- Refill rate sets the sustainable long-term throughput.
- Capacity bounds how many unused tokens can accumulate.
- Accumulated tokens permit a bounded burst.
- An operation without enough tokens is rejected, delayed, or queued according to policy.

## INFRA-TB-002 — How does network bandwidth shaping differ from traffic policing?

Source: [Token buckets and network bandwidth shaping](../../wiki/infrastructure/token-buckets-and-network-bandwidth-shaping.md)

Expected points:

- Shaping normally queues and delays excess traffic to smooth its transmission rate.
- Policing typically drops or marks traffic that exceeds the configured policy.
- A token bucket can measure whether traffic conforms to an average rate while allowing bounded bursts.

## INFRA-DNS-001 — What roles do recursive, root, TLD, and authoritative DNS servers play?

Source: [Domain Name System](../../wiki/infrastructure/dns.md)

Expected points:

- The recursive resolver coordinates resolution for the client.
- Root servers direct it to the relevant TLD namespace.
- TLD servers direct it to authoritative service for the domain.
- Authoritative servers supply records for zones they serve.

## INFRA-DNS-002 — Compare `A`, `AAAA`, and `CNAME` records.

Source: [Domain Name System](../../wiki/infrastructure/dns.md)

Expected points:

- `A` contains an IPv4 address.
- `AAAA` contains an IPv6 address.
- `CNAME` aliases a name to another name.

## INFRA-DNS-003 — Why can changing a DNS record fail to affect every client immediately?

Source: [Domain Name System](../../wiki/infrastructure/dns.md)

Expected points:

- Browsers, operating systems, and resolvers may have cached an earlier answer.
- TTL controls how long a cached record may be retained.
- Clients can therefore observe the change at different times.

## INFRA-DOCKER-001 — Explain the purpose of a multi-stage Dockerfile.

Source: [Dockerfile multi-stage builds](../../wiki/infrastructure/dockerfile-multi-stage-builds.md)

Expected points:

- Each `FROM` starts a stage.
- Build dependencies can remain in an earlier stage.
- Explicitly selected artifacts are copied into the runtime stage.
- The final image contains only intentional runtime necessities.

## INFRA-DOCKER-002 — A binary exists in the build stage but not in the final image. What should you inspect first?

Source: [Dockerfile multi-stage builds](../../wiki/infrastructure/dockerfile-multi-stage-builds.md)

Expected points:

- Confirm which `FROM` stage produced the binary.
- Check that the final stage explicitly copies it from the correct earlier stage.
- Verify source and destination paths in the copy instruction.
