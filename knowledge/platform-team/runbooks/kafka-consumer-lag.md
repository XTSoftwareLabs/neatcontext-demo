# Runbook: Kafka consumer lag (billing-events)

**Owner:** Core Platform / SRE

## Symptom

`kafka consumer lag on billing-events` climbing for a consumer group (e.g.
invoice-worker).

## Interpretation

Consumer lag is usually a **downstream symptom**, not a broker problem. A
consumer that is blocked (e.g. waiting on database connections it cannot get)
will stop committing offsets and lag will rise. Confirm broker health before
assuming Kafka is at fault:

1. Broker CPU / disk / under-replicated partitions — usually fine.
2. Is the consumer blocked on another resource (DB pool, downstream API)?

## Mitigation

- If brokers are healthy and the consumer is starved by a connection-pool issue,
  fix the pool (see postgres-connection-pool) and lag drains on its own.

## Do NOT

- **Do not restart Kafka brokers to "clear" lag.** It resets in-flight state for
  every consumer group and creates a much larger incident.
