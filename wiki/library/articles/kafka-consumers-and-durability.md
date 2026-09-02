# Kafka Consumers, Consumer Groups, and Durability

## Coverage

This technical explainer connects Kafka's consumer model to its storage guarantees. It covers offsets and commits, consumer-group partition assignment, rebalancing, at-least-once versus at-most-once processing, replica acknowledgements, ISR and `min.insync.replicas`, page-cache persistence, and leader failover.

## Ideas contributed to the wiki

- [Kafka consumer progress and durability](../../distributed-systems/kafka-consumer-progress-and-durability.md)
- [Stream-processing fault tolerance](../../distributed-systems/stream-processing-fault-tolerance.md), especially replay and external-side-effect boundaries
- [Payment idempotency and double-charge prevention](../../distributed-systems/payment-idempotency-and-double-charge-prevention.md), where Kafka redelivery makes idempotent handlers necessary

## Source status

This is an unsigned technical note supplied from the local `farm-tracker` repository and captured on 2026-08-18. Its conceptual claims were compared with the Apache Kafka 4.3 consumer, producer, broker, and design documentation. The core model is consistent with those docs, but configuration defaults, group protocols, timeout ownership, and offset-retention behavior are version-sensitive and should be checked against the deployed Kafka version.

Source: [captured article](../../../sources/articles/kafka-consumers-and-durability.md)

Verification references: [Kafka 4.3 consumer configuration](https://kafka.apache.org/43/configuration/consumer-configs/), [producer configuration](https://kafka.apache.org/43/configuration/producer-configs/), [broker configuration](https://kafka.apache.org/43/configuration/broker-configs/), and [design documentation](https://kafka.apache.org/43/design/design/)
