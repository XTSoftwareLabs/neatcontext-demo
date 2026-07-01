# Runbook: checkout-api elevated 5xx rate — is this ours?

**Owner:** Payments Engineering
**Applies to:** checkout-api in production

## Symptom

POST /checkout returns 500/503; Datadog "checkout-api 5xx rate" monitor fires.
Customers report failed payments.

## Goal of this runbook

checkout-api 5xx can be caused by **something we own** (our deploy, Stripe, our
webhook logic) **or by shared infrastructure we only consume** — the
billing-postgres connection pool and its **pgbouncer** pooler, both owned by
**Core Platform / SRE**. The first job is to decide ownership, because the
correct action differs:

- If it's ours → fix it on our surface (roll back / feature flag).
- If it's shared infra we don't own → **hand off to Core Platform with the
  evidence.** Do not try to fix pgbouncer/Postgres yourself.

## Triage decision (do these in order)

1. **Timing.** `demo_search_logs service=checkout-api query=pool` and find the
   **first** error timestamp. `demo_list_deployments service=checkout-api` and
   compare to our latest deploy time. **If the 5xx started before our deploy, our
   deploy is not the trigger.**
2. **Stripe.** Check `demo_search_logs service=checkout-api query=stripe` and the
   incident's Stripe status. If Stripe is healthy (status green, health probe
   200, normal latency), rule out the payment provider.
3. **Dominant error.** What error is first and most frequent? If it is
   `could not obtain connection from pool 'billing-postgres'` or
   `pgbouncer: pool 'billing' is full (40/40)`, the binding constraint is the
   **DB connection pool**.

## Decision

- **All three point away from us** (5xx predates our deploy + Stripe healthy +
  dominant error is connection-pool exhaustion) → **this is NOT a Payments root
  cause. Escalate to Core Platform / SRE** (owners of billing-postgres +
  pgbouncer). Hand off: the incident link, the pool-exhaustion log lines with
  timestamps, and the deployment timeline (including any pgbouncer/pool-size
  change you see). See `service-ownership.md`.
- Interim, optional: disable `stripe_webhook_auto_retry` so our retries stop
  adding any load to the saturated pool — but say clearly this is not the fix.

- **If instead our deploy lines up with onset, or Stripe is degraded, or the
  dominant error is Stripe/webhook** → it's ours: roll back the suspect
  checkout-api deploy or disable the feature flag.

## Safety

- **Never restart invoice-worker during the settlement window (09:00–10:00Z).**
  See TSG: settlement-window-safety.
- Do not change pgbouncer or Postgres settings — that is Core Platform's surface.
