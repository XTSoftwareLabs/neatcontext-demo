# Reference: service ownership & escalation (Payments view)

Use this to decide **who owns the root cause** and where to hand off.

## We own (Payments Engineering)

| Component | Notes |
|---|---|
| checkout-api | Customer checkout endpoint. |
| billing-api | Invoice / payment APIs. |
| invoice-worker | Settlement + kafka `billing-events` consumer. |
| webhook-processor | Stripe webhook handling. |

## We consume but DO NOT own → escalate to Core Platform / SRE

| Component | Owner | Common failure we mis-attribute to ourselves |
|---|---|---|
| billing-postgres | Core Platform / SRE | `could not obtain connection from pool` |
| **pgbouncer** (pooler) | Core Platform / SRE | `pool 'billing' is full (N/N)` — pool-size too low |
| kafka-billing-events | Core Platform / SRE | consumer lag (often downstream of the DB pool) |

## External

| Dependency | Owner | How to check |
|---|---|---|
| Stripe | Stripe (vendor) | status.stripe.com + API health probe in logs |

## When to hand off to Core Platform

Hand off when the incident's **binding constraint** is in something we consume
but don't own — most commonly the **billing-postgres connection pool /
pgbouncer**. Signals:

- dominant error is `could not obtain connection from pool` / `pgbouncer pool is
  full`,
- the 5xx onset predates our latest checkout-api deploy,
- Stripe is healthy.

**Hand-off package:** incident link, the first pool-exhaustion log line (with
timestamp), and `demo_list_deployments` output showing any pgbouncer / pool-size
change. Core Platform owns the fix (pool sizing); we cannot and should not change
pgbouncer ourselves.
