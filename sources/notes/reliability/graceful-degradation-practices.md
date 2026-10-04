# Capture metadata

- Title: Graceful Degradation Practices
- Captured: 2026-09-29
- Source type: User-supplied technical note
- Origin: User conversation
- Provenance note: Authorship and prior verification status were not supplied.

---

- Rate Limiting: during a traffic surge which can be caused by a black friday event or a DDoS attack, we can limit the amounts of requests that we allow our application to process during a period of time. For example, we can allow only 10 requests per minute from an IP address, and when there is the 11th call coming, we are rejecting it.
- request coalescing: when there are a lot of requests for the same resource/key performed at the same time, instead of executing the operations for each request, we coalesce them into one request, and then they wait for the response, and once there is a response, it is forwarded back to each reqeust.
- Load shedding: when there are many requests to our application and the performance starts to degrade, we need to take measures in order to make sure the most important operations still work, by disabling other operations that are less important, for example we prioritize the payment actions instead of recording user clicks
- jitter and retry: when there were some issues and the service recovers, it is a high chance that it will be bombarded with a lot of requests at the same time, this is known as the thundering herd problem. We can avoid this by adding a random delay, thus we distribute the load randomly and the app doesnt crash.
- circuit breaker: when there is a part of the system that fails for some time, in order to avoid making extra useless calls (because it is down), we completely stop making requests to the failing service until it is healthy again or for a specific period, like 60 seconds.
- request timeouts, so that we dont risk waiting too much for a specific service or resource, because this could increase the latency of the entire system as a whole, which is reflected to the end user most of time.
- Monitoring and alerts: it is very important to use an o11y framework, because this helps us set alerts for certain metrics, such as cpu load, memory usage and so on, which are trigger once the metrics went over a threshold, and we can take action quicker, not when the system is down and customer notify us.
