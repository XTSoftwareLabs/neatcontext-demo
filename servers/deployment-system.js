"use strict";

// Mock Deployment System (Spinnaker/ArgoCD-like). Read-only API; exports a
// request handler mounted on HTTPS by servers/index.js.
//
// Endpoints:
//   GET /deployments?service=checkout-api          -> deploys for a service
//   GET /deployments?window=ISO..ISO               -> all deploys in a time window
//   GET /deployments                               -> recent deploys (all)
//   GET /health                                    -> { ok: true }
//
// Two deploys land just before the incident. Each team's profile points at
// "recent deployments by my team" — so they zero in on different changes.

const deployments = [
  {
    id: "dep-9001",
    service: "billing-postgres",
    component: "pgbouncer",
    version: "plat-2026.6.30",
    team: "core-platform",
    deployed_at: "2026-06-30T08:58:00Z",
    change: "Reduce pgbouncer default_pool_size 100 -> 40 to cut idle Postgres connections (cost optimization).",
    risk: "HIGH: lowers max concurrent DB connections per pool from 100 to 40; starves connection-heavy callers (checkout-api, billing-api, invoice-worker) under normal load. Deployed 4 minutes before the 5xx onset — prime suspect / root cause for INC-1001.",
    rollback: "Set default_pool_size back to 100 and RELOAD pgbouncer (no restart, no dropped connections)."
  },
  {
    id: "dep-9002",
    service: "checkout-api",
    component: "checkout-api",
    version: "v2026.6.30-a",
    team: "payments-eng",
    deployed_at: "2026-06-30T09:05:00Z",
    change: "Add automatic retry on Stripe webhook timeout (stripe_webhook_auto_retry feature flag = on).",
    risk: "Low for this incident: deployed at 09:05, AFTER the 5xx onset at 09:02, so it did not start the incident. Retries do hold a DB connection while in flight, so they can mildly worsen an already-saturated pool, but they are not the cause.",
    rollback: "Roll back to v2026.6.29-c, or disable the stripe_webhook_auto_retry feature flag."
  },
  {
    id: "dep-8990",
    service: "checkout-api",
    component: "checkout-api",
    version: "v2026.6.29-c",
    team: "payments-eng",
    deployed_at: "2026-06-29T15:40:00Z",
    change: "Copy tweaks on the checkout confirmation page.",
    risk: "Low.",
    rollback: "Roll back to v2026.6.29-b."
  }
];

function inWindow(ts, window) {
  if (!window) return true;
  const [from, to] = window.split("..");
  const t = Date.parse(ts);
  if (from && t < Date.parse(from)) return false;
  if (to && t > Date.parse(to)) return false;
  return true;
}

function send(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function handler(req, res) {
  const url = new URL(req.url, "https://localhost");

  if (url.pathname === "/health") return send(res, 200, { ok: true, system: "deployments" });

  if (url.pathname === "/deployments") {
    const service = url.searchParams.get("service");
    const window = url.searchParams.get("window");

    let result = deployments.slice();
    if (service) result = result.filter((d) => d.service === service);
    if (window) result = result.filter((d) => inWindow(d.deployed_at, window));
    result.sort((a, b) => Date.parse(b.deployed_at) - Date.parse(a.deployed_at));

    return send(res, 200, { service: service || undefined, window: window || undefined, count: result.length, deployments: result });
  }

  return send(res, 404, { error: "not_found", message: `Unknown path ${url.pathname}` });
}

module.exports = { handler, deployments };
