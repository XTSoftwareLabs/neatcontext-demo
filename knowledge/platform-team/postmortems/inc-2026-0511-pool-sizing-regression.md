# Postmortem: INC-0977 — pgbouncer pool-size cut starved checkout-api

**Date:** 2026-05-11
**Infra:** billing-postgres / pgbouncer
**Severity:** SEV2
**Owner:** Core Platform / SRE

## Summary

A cost-optimization change reduced pgbouncer `default_pool_size` from 100 to 40
on the `billing` pool. Idle connections dropped as intended. But the change was
sized for *idle* load, not *peak* load. At the next traffic peak the pool
saturated (40/40 server connections, dozens of clients queuing), and every
service that talks to billing-postgres — checkout-api first — began returning
5xx on connection-acquisition timeouts.

## Timeline

- 10:30 — Deploy: `default_pool_size 100 -> 40`, pgbouncer RELOAD.
- 12:15 — Lunchtime traffic peak; pool saturates at 40/40.
- 12:18 — checkout-api 5xx monitor fires.
- 12:26 — Reverted `default_pool_size` to 100, RELOAD. Pool drained in ~90s.
- 12:29 — Error rate back to baseline. No primary failover was needed.

## Root cause

The new pool size was below the concurrent-connection demand of dependent
services at peak. The Postgres primary was healthy the entire time (CPU ~60%,
well under `max_connections=200`) — the bottleneck was purely the pgbouncer pool
ceiling **we** set.

## What worked

- A `RELOAD` to restore the old pool size fixed it in under two minutes with zero
  dropped connections. **We explicitly did not fail over the primary** — that
  would have dropped all in-flight work and widened the outage.

## Lessons

- For "pool is full / could not obtain connection" incidents, **check for a
  recent pool-sizing / pgbouncer change first**, and revert it with RELOAD.
- Product-side load (e.g. a retry storm) can *expose* an undersized pool, but the
  reversible fix on our side is the pool size — not a failover, and not touching
  the product team's workers.

## Follow-ups

- Load-test pool-size changes against peak, not idle.
- Alert on pgbouncer pool utilization (>80% server connections).
