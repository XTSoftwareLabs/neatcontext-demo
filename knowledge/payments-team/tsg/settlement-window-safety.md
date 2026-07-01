# TSG: Settlement window safety (invoice-worker)

**Owner:** Payments Engineering
**Severity of getting this wrong:** very high (double-charges, finance reconciliation)

## The window

The daily settlement job `daily-settlement` runs on **invoice-worker** every day
from **09:00 to 10:00 UTC**. During this window invoice-worker is reconciling
captured payments against invoices.

## Hard rule

**Do not restart, redeploy, scale down, or kill invoice-worker between 09:00 and
10:00 UTC.** Interrupting a settlement run can:

- double-charge customers whose settlement was mid-flight,
- leave invoices in an inconsistent paid/unpaid state,
- require a manual finance reconciliation that takes days.

If invoice-worker *must* be touched during the window, you need explicit
approval from the Payments Tech Lead **and** Finance Ops.

## How to tell settlement is running

Look for this log line on checkout-api / invoice-worker:

```
settlement job 'daily-settlement' running on invoice-worker (window 09:00-10:00Z); do not interrupt.
```

## Safe alternatives during the window

- Disable the `stripe_webhook_auto_retry` feature flag (does not require a
  restart).
- Roll back checkout-api (separate service from invoice-worker — safe).
