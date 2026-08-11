# Domain Name System (DNS)

DNS maps names to records, including address records used to reach services. A lookup may be answered from a browser cache or operating-system cache before a recursive resolver performs further resolution.

## Resolution roles captured in the source

- A recursive resolver receives the client's unresolved query and coordinates resolution.
- Root name servers direct resolution toward the appropriate top-level-domain namespace.
- TLD name servers direct resolution toward authoritative servers for the domain.
- Authoritative name servers provide records for zones they serve.

The original note calls the authoritative server “the ISP nameserver.” That is an oversimplification: the note does not establish who operates a domain's authoritative service, so this identity should not be carried forward as a general rule.

## Records

| Record | Meaning in the captured notes |
| --- | --- |
| `A` | Holds an IPv4 address. |
| `AAAA` | Holds an IPv6 address. |
| `CNAME` | Aliases one domain or subdomain to another name. |

A record's TTL tells caches how long the record may remain cached. This makes TTL relevant both to lookup load and to how quickly clients observe record changes.

## Source status

This page compiles a short personal note. It clarifies the note's library analogy but does not claim to document every DNS lookup path, cache, or record type.

Source: [original personal DNS note](../../sources/notes/technologies/domain-name-server-dns.md)

