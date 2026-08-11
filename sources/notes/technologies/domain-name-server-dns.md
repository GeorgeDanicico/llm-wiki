
The DNS is responsible for mapping a domain name to an ip address. 

It is composed of 4 things:
- DNS Recursor - the first thing that is hit by a client request, which will handle the request
- Root nameserver - the "rack of ips" in a library
- TLD nameserver - the specific rack of ips
- Authoritative nameserver - The ISP nameserver, which will give the IPs.

Before a client request goes to the DNS service, it first queries the <b>local browser cache</b> and if it does not find a match, it queries the <b>OS cache</b>, and if it does not find it there, it then perform a call to the DNS server.

#### DNS Records

 A DNS record represents an entry in the authoritative DNS servers which contains informations about the domain, including the IP addresses to which the domains point. A DNS record also has a TTL - time to live - which means the time for which an entry stays in the DNS cache.

#### Common DNS records

- <b>A record</b>           - the record that holds the IP address
- <b>AAAA record</b>   - the record that holds the IPv6 address for a domain
- <b>CNAME record</b> - forwards one domain or subdomain to another one.