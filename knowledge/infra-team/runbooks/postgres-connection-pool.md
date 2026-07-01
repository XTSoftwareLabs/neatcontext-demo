# Runbook: billing-postgres connection-pool exhaustion (pgbouncer)

**Owner:** Infra Team
**Applies to:** billing-postgres + its pgbouncer pooler

## Symptom

Dependent services (checkout-api, billing-api) throw 5xx with errors like:

```
could not obtain connection from pool 'billing-postgres' within 5000ms (pool exhausted)
pgbouncer: pool 'billing' is full (server connections N/N); client queued
```

This usually presents as a *product* incident even though the binding
constraint is **our** pooler configuration.

## Architecture note

pgbouncer sits in front of billing-postgres in transaction-pooling mode.
`default_pool_size` caps **server connections per pool**. The Postgres primary
itself allows `max_connections = 200`; pgbouncer is deliberately set lower than
that. If `default_pool_size` is set too low for the offered load, clients queue
and time out long before Postgres is anywhere near its own limit.

## Diagnosis

1. `demo_get_incident` — read the incident + timeline.
2. `demo_list_deployments service=billing-postgres` (and check for any
   infra-team / pgbouncer change in the window). A recent pool-size change is
   the prime suspect.
3. `demo_search_logs service=billing-postgres` and
   `demo_search_logs service=checkout-api query=pool`. Look for "pool is full",
   "N/N", "pool exhausted", and the pgbouncer reload line.
4. Compare the saturated server-connection count to the *previous* pool size. If
   the pool was recently shrunk, that is almost certainly the cause.

## Mitigation (our surface, reversible)

- **Revert the pgbouncer `default_pool_size` to its previous value and RELOAD
  pgbouncer.** A RELOAD does not drop existing connections — it is the safe,
  fast fix. See TSG: db-failover-tsg for what NOT to do.

## Do NOT

- Do not fail over the Postgres primary (see db-failover-tsg).
- Do not raise pool size above what `max_connections=200` can support across all
  pools, or you just move the failure into Postgres.
