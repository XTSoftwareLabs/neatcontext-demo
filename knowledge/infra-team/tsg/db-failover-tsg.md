# TSG: billing-postgres failover safety

**Owner:** Infra Team
**Severity of getting this wrong:** very high (widens blast radius)

## Hard rule

**Do not fail over the billing-postgres primary during business hours to
"resolve" a connection-pool saturation incident.**

## Why

A pool-saturation incident means clients are queuing for connections. A primary
failover:

- drops **every** in-flight connection across **every** dependent service at
  once (checkout-api, billing-api, invoice-worker),
- forces all poolers to reconnect simultaneously (a thundering herd),
- typically turns a single-service degradation into a multi-service outage.

Failover is the right tool for a *failed* primary (hardware, corruption,
replication broken) — not for a *saturated* one.

## What to do instead for saturation

1. Find what changed (recent pgbouncer / pool-size deploy) and **revert it with a
   RELOAD** — no dropped connections. See runbook: postgres-connection-pool.
2. If load is organic (no bad change), scale pool size carefully within
   `max_connections=200`, or shed load upstream.

## Connection budget reminder

```
Postgres primary max_connections = 200
pgbouncer default_pool_size      = (per pool) must sum to <= ~180 across pools
```

Shrinking `default_pool_size` reduces concurrency for callers; growing it risks
exhausting the primary. Change it deliberately and watch saturation after.
