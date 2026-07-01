# Postmortem: INC-0931 — checkout-api 5xx was a shared DB-pool issue (correct hand-off)

**Date:** 2026-04-18
**Service:** checkout-api
**Severity:** SEV2
**Owner (incident raised on):** Payments Engineering → **handed off to Infra Team**

## Summary

checkout-api 5xx fired. The on-call's first instinct was to blame a recent
Payments deploy and a Stripe slowdown. Triage showed otherwise: the 5xx started
**before** our deploy, Stripe was **healthy**, and the dominant error was
`could not obtain connection from pool 'billing-postgres' (pool exhausted)`. The
binding constraint was the shared DB connection pool — owned by Infra Team.
We escalated; Infra Team found a pool-sizing change and fixed it.

## Timeline

- 14:30 — checkout-api 5xx monitor fires.
- 14:33 — On-call checks: 5xx onset (14:21) **predates** our 14:28 deploy.
- 14:35 — Stripe status green; API health probe 200. Stripe ruled out.
- 14:37 — Dominant log error = pgbouncer pool exhaustion. **Escalated to Infra Team** with the incident, the pool-exhaustion log lines, and the deploy
  timeline.
- 14:44 — Infra Team identified an undersized pgbouncer pool and reverted it.
- 14:49 — Error rate back to baseline.

## What went RIGHT

- We did **not** waste time rolling back our (innocent) deploy or chasing Stripe.
- We used the timing + Stripe-health + dominant-error checks to correctly
  conclude **"this isn't our root cause"** and handed off fast with evidence.
- We owned our small contribution (disabled `stripe_webhook_auto_retry` to stop
  adding load) but were clear it was interim, not the fix.

## Lessons

- For checkout-api 5xx, **decide ownership before deep-diving.** If 5xx predates
  our deploy, Stripe is healthy, and the dominant error is DB-pool exhaustion,
  the correct action is to **escalate to Infra Team** — not to keep digging in
  the payment path. See runbook: checkout-api-5xx and service-ownership.

## Follow-ups

- Added the "is this ours?" triage to the checkout-api 5xx runbook.
- Added an alert on pgbouncer pool utilization (requested from Infra Team).
