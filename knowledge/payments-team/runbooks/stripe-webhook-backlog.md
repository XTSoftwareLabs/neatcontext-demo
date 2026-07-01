# Runbook: Stripe webhook slowness — Stripe issue, or downstream of the DB pool?

**Owner:** Payments Engineering

## Important: webhook slowness is often a SYMPTOM, not the cause

A slow/timing-out Stripe webhook handler looks like a Stripe problem, but the
handler must write to billing-postgres to persist each event. If the
**connection pool is exhausted**, the handler blocks waiting for a DB connection
and times out — even though Stripe itself is perfectly healthy.

So before treating this as a payments/Stripe problem, check the pool.

## Distinguish the two cases

1. **Stripe is actually degraded** — status.stripe.com is red, the API health
   probe is slow/failing, latency to `api.stripe.com` is high. Then it's a
   provider issue; throttle and wait it out.
2. **Stripe is healthy but the handler is slow** — look at the log line; if it
   says the handler is *blocked waiting for a billing-postgres connection*, the
   real problem is the DB connection pool (Infra Team's surface), not Stripe.
   The webhook latency is downstream.

## What to check

- `demo_search_logs service=checkout-api query=stripe` — is there a "Stripe API
  health probe ok ... not degraded" line? Then Stripe is fine.
- `demo_search_logs service=checkout-api query=pool` — pool-exhaustion errors
  with earlier timestamps than the webhook slowness confirm the pool is the
  cause and the webhook is the symptom.

## Action

- If pool exhaustion is the cause: this is **not ours to fix** — hand off to Infra Team (see `service-ownership.md`). Optionally disable
  `stripe_webhook_auto_retry` so retries stop adding load while they fix the pool.

## Do NOT

- Do not restart invoice-worker mid-settlement (see settlement-window-safety).
- Do not bulk-replay Stripe webhooks while the pool is saturated.
