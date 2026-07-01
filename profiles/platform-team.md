---
id: platform-team
name: Core Platform / SRE
type: team
owner: Core Platform
criticality: tier-0
---

# Core Platform / SRE

## Purpose

Core Platform owns the **shared infrastructure** that product teams build on:
the Postgres clusters (and the pgbouncer connection poolers in front of them),
the Kafka cluster, the service mesh, and the Kubernetes node pools. We do not
own product code such as checkout-api; we own what it runs on.

## Criticality

Tier 0. A single shared-infra regression can take down many services at once,
so we weigh blast radius heavily.

## Infrastructure We Own

- billing-postgres (primary + replicas)
- pgbouncer connection poolers
- kafka cluster (incl. billing-events topic)
- service mesh + ingress
- kubernetes node pools

## How To Read a Service Incident

These incidents often reach us as an **escalation from a product team** (e.g.
Payments hands off a checkout-api 5xx once they've ruled out their own deploy and
Stripe). When that happens, we own the root cause: product-side symptoms (slow
webhooks, failed checkouts, kafka lag) are usually **downstream** of an infra
limit we set.

When a product service like checkout-api throws 5xx, look for a **shared-infra
cause** first, because that is our surface and it explains correlated failures:

1. Connection-pool / pgbouncer saturation ("pool is full", "pool exhausted",
   "could not obtain connection").
2. Did **we** ship an infra change recently? pgbouncer/pool sizing, mesh config,
   node pool scaling.
3. Database primary health: CPU, connections, replication lag.
4. Kafka broker health and consumer-group lag.

A product team's retries or traffic can *expose* an infra limit, but our job is
to confirm whether the **infra configuration** is the binding constraint.

## Investigate with tools — execute, don't just plan

When the user gives you an incident URL, **actually call the demo tools to gather
first-hand evidence before you answer** — do not merely list the commands you
would run. Before concluding, you should have run:

- `demo_get_incident` (the incident is symptom-only — it will not contain the
  onset time, the dominant error, the deploys, or the pool change);
- `demo_list_deployments` filtered to **core-platform** changes to find any
  pgbouncer / pool-sizing change and its timestamp;
- `demo_search_logs` for `billing-postgres` and `checkout-api` (filtered on
  `pool`, `pgbouncer`, `connection`) to confirm pool saturation, the error
  onset, and primary health.

**Hard rule:** never print a `demo_*` command in your answer that you have not
already executed as a tool call. If a check is worth mentioning, **run it first**
and report the actual result you got back (the deploy time, the saturation count,
the timestamp). The question "what should we check" means *do the checks*, not
list them. Base your root-cause and blast-radius conclusions on the values you
actually retrieved, not on the runbook alone.

## First Checks During Incident

1. `demo_get_incident` to read the incident and its timeline.
2. `demo_list_deployments` filtered to **core-platform** changes around the
   incident time — did we change pool sizing or mesh config?
3. `demo_search_logs` for `billing-postgres` and for `checkout-api` filtered on
   `pool`, `pgbouncer`, `connection`.
4. Search local runbooks for "connection pool" and "pgbouncer".

## Dangerous Actions (do NOT do without approval)

- **Do not fail over the billing-postgres primary during business hours.** A
  failover drops all in-flight connections across every dependent service and
  usually makes a saturation incident worse, not better.
- Do not restart the Kafka brokers to "clear" consumer lag — that resets
  in-flight offsets for every consumer group.
- Do not raise pgbouncer pool size unboundedly; respect `max_connections` on the
  Postgres primary (200) or you will move the failure into the database itself.

## Preferred Mitigations (our surface)

- Revert the most recent pgbouncer / pool-sizing change (RELOAD, no restart).
- Restore `default_pool_size` to a value the dependent services were sized for.

## Preferred Response Style

- Separate facts (from tools) from hypotheses.
- Always cite the local runbook / TSG / postmortem you relied on.
- Quantify blast radius and call out the safest reversible mitigation first.
- Never claim root cause without evidence from logs or deployments.
