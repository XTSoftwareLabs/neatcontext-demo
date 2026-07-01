---
id: payments-team
name: Payments Engineering
type: team
owner: Payments Engineering
criticality: tier-0
---

# Payments Engineering

## Purpose

Payments Engineering owns the customer-facing payment path: `checkout-api`,
`billing-api`, `invoice-worker`, and the Stripe webhook processor. We are
responsible for taking payment, issuing invoices, and reconciling settlement.

## Criticality

Tier 0. Any failed checkout is direct revenue loss and is treated as high
severity.

## Services We Own

- checkout-api
- billing-api
- invoice-worker
- webhook-processor (Stripe webhooks)

## Dependencies We Consume (but do not own)

- Stripe (payment provider)
- billing-postgres (owned by Core Platform)
- kafka-billing-events (owned by Core Platform)

## Service Ownership (who to escalate to)

We **own** checkout-api, billing-api, invoice-worker, and the webhook processor.
We **consume but do not own** these — they belong to **Core Platform / SRE**:

- billing-postgres (and the **pgbouncer** connection pooler in front of it)
- kafka-billing-events

If the binding constraint of an incident is in something we do not own, the
correct action is to **escalate / hand off to Core Platform with the evidence** —
not to keep digging in the payment path or to touch their infrastructure.

## Is This Incident Ours? (triage BEFORE deep-diving)

For a checkout-api 5xx, decide ownership first using three checks:

1. **Timing:** did the 5xx start **before** our most recent deploy? If yes, our
   deploy did not trigger it.
2. **Stripe:** is Stripe healthy (status page green, webhook latency normal)? If
   yes, rule out the payment provider.
3. **Dominant error:** what error appears first and most? If it is
   `could not obtain connection from pool 'billing-postgres'` /
   `pgbouncer: pool 'billing' is full`, the binding constraint is the **DB
   connection pool** — Core Platform's surface, not ours.

**If timing clears our deploy, Stripe is healthy, and the dominant error is
connection-pool exhaustion → this is NOT a Payments root cause. Hand off to Core
Platform.** Provide the incident, the pool-exhaustion log lines, and the
deployment timeline. You may reduce our own contribution (e.g. disable
`stripe_webhook_auto_retry`) but state clearly it is not the root cause and will
not resolve the incident.

## Investigate with tools — execute, don't just plan

When the user gives you an incident URL, **actually call the demo tools to gather
first-hand evidence before you answer** — do not merely list the commands you
would run. Before concluding, you should have run:

- `demo_get_incident` (the incident is symptom-only — it will not contain the
  onset time, the dominant error, the deploys, or Stripe's health);
- `demo_search_logs` for `checkout-api` (filtered on `pool`, then `stripe`) to
  find the first/dominant error with its timestamp and to confirm the Stripe
  health probe;
- `demo_list_deployments` to compare our checkout-api deploy time to the 5xx
  onset and to spot any non-Payments change (e.g. a pgbouncer pool-size change).

**Hard rule:** never print a `demo_*` command in your answer that you have not
already executed as a tool call. If a check is worth mentioning, **run it first**
and report the actual result you got back (the timestamp, the error text, the
deploy time). The question "what should we check" means *do the checks*, not list
them. Base your timing / Stripe / dominant-error conclusions on the values you
actually retrieved, not on the runbook alone.

## First Checks During Incident

1. `demo_get_incident` to read the incident, timeline, Stripe status, and
   service ownership.
2. `demo_search_logs` for `checkout-api` filtered on `pool` — find the first and
   dominant error and its timestamp.
3. `demo_list_deployments` around the incident time — compare our checkout-api
   deploy time to the 5xx onset, and note any **non-Payments** change (e.g. a
   pgbouncer / pool-size change owned by Core Platform).
4. Check `stripe` and `webhook` log lines to confirm whether Stripe is the cause
   or just a downstream symptom of the DB pool.
5. Search local runbooks for "checkout 5xx", "is this ours", and "ownership".

## Dangerous Actions (do NOT do without approval)

- **Do not restart `invoice-worker` during the settlement window (09:00–10:00Z).**
  An interrupted settlement run causes double-charges and finance reconciliation
  pain.
- Do not manually mark invoices as paid without Finance Ops approval.
- Do not resolve the incident until the Stripe webhook backlog is drained to zero.
- Do not change billing-postgres / pgbouncer settings yourself — that is Core
  Platform's surface; escalate to them instead.

## Preferred Mitigations (our surface)

- If the root cause is ours: roll back the most recent checkout-api deploy, or
  disable the `stripe_webhook_auto_retry` feature flag.
- **If the root cause is shared infra we don't own (DB connection pool /
  pgbouncer): escalate to Core Platform.** That is the correct mitigation for us.
  Optionally disable `stripe_webhook_auto_retry` to stop adding any load while
  Core Platform fixes the pool — but call it interim, not the fix.

## Preferred Response Style

- Separate facts (from tools) from hypotheses.
- Always cite the local runbook / TSG / postmortem you relied on.
- Lead with first checks, then a most-likely cause, then safe mitigation.
- Never claim root cause without evidence from logs or deployments.
