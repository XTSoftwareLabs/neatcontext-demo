"use strict";

// Mock Log System (Datadog/Splunk-like). Read-only API; exports a request
// handler mounted on HTTPS by servers/index.js.
//
// Endpoints:
//   GET /logs?service=checkout-api&from=...&to=...&query=...   -> matching log lines
//   GET /health                                                -> { ok: true }
//
// The checkout-api logs make the true root cause discoverable: the FIRST and
// DOMINANT errors are billing-postgres connection-pool exhaustion (starting
// 09:02, before the 09:05 payments deploy), Stripe is explicitly healthy, and
// even the webhook slowness is attributed to waiting on a DB connection. So a
// Payments investigator can correctly conclude "this isn't our service" and
// hand off, while a Core Platform investigator finds the pool-size change.

const logs = {
  "checkout-api": [
    { ts: "2026-06-30T09:02:08Z", level: "ERROR", msg: "could not obtain connection from pool 'billing-postgres' within 5000ms (pool exhausted: active=40, idle=0, waiting=22)." },
    { ts: "2026-06-30T09:02:09Z", level: "ERROR", msg: "pgbouncer: pool 'billing' is full (server connections 40/40); client queued." },
    { ts: "2026-06-30T09:02:14Z", level: "ERROR", msg: "POST /checkout 503 — db connection acquisition failed; could not start transaction." },
    { ts: "2026-06-30T09:03:40Z", level: "ERROR", msg: "could not obtain connection from pool 'billing-postgres' within 5000ms (pool exhausted: active=40, idle=0, waiting=29)." },
    { ts: "2026-06-30T09:05:11Z", level: "INFO", msg: "Started checkout-api v2026.6.30-a (build a1b2c3d). Feature: stripe_webhook_auto_retry=on. (Deploy landed after 5xx onset at 09:02.)" },
    { ts: "2026-06-30T09:06:02Z", level: "INFO", msg: "Stripe API health probe ok: GET api.stripe.com 200 in 118ms — Stripe is not degraded." },
    { ts: "2026-06-30T09:06:30Z", level: "WARN", msg: "Stripe webhook handler slow: 9120ms — blocked waiting for a billing-postgres connection to persist the event, NOT a Stripe-side delay." },
    { ts: "2026-06-30T09:07:10Z", level: "ERROR", msg: "could not obtain connection from pool 'billing-postgres' within 5000ms (pool exhausted: active=40, idle=0, waiting=41)." },
    { ts: "2026-06-30T09:09:00Z", level: "WARN", msg: "kafka consumer lag on billing-events: 38240 messages (invoice-worker blocked on db connection acquisition)." },
    { ts: "2026-06-30T09:12:09Z", level: "ERROR", msg: "POST /checkout 500 — db connection acquisition failed; downstream billing-api also unable to acquire connections." },
    { ts: "2026-06-30T09:16:40Z", level: "ERROR", msg: "pgbouncer: pool 'billing' is full (server connections 40/40); 58 clients waiting; avg wait 4900ms." },
    { ts: "2026-06-30T09:20:15Z", level: "WARN", msg: "settlement job 'daily-settlement' running on invoice-worker (window 09:00-10:00Z); do not interrupt." }
  ],
  "billing-postgres": [
    { ts: "2026-06-30T08:58:30Z", level: "INFO", msg: "pgbouncer reloaded config: default_pool_size 100 -> 40, max_client_conn 1000 (deploy plat-2026.6.30)." },
    { ts: "2026-06-30T09:12:05Z", level: "WARN", msg: "pool 'billing' saturated: 40/40 server connections in use; 37 clients waiting." },
    { ts: "2026-06-30T09:16:41Z", level: "WARN", msg: "pool 'billing' saturated: 40/40 server connections in use; 64 clients waiting." },
    { ts: "2026-06-30T09:18:00Z", level: "INFO", msg: "postgres primary CPU 61%, connections 40 active (max_connections 200 — not the bottleneck; pgbouncer pool is)." }
  ]
};

function inWindow(ts, from, to) {
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

  if (url.pathname === "/health") return send(res, 200, { ok: true, system: "logs" });

  if (url.pathname === "/logs") {
    const service = url.searchParams.get("service");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const query = (url.searchParams.get("query") || "").toLowerCase();

    if (!service || !logs[service]) {
      return send(res, 200, {
        service,
        available_services: Object.keys(logs),
        lines: [],
        message: service ? `No logs for service '${service}'.` : "Provide ?service=<name>."
      });
    }

    const lines = logs[service]
      .filter((l) => inWindow(l.ts, from, to))
      .filter((l) => (query ? l.msg.toLowerCase().includes(query) : true));

    return send(res, 200, { service, from, to, query: query || undefined, count: lines.length, lines });
  }

  return send(res, 404, { error: "not_found", message: `Unknown path ${url.pathname}` });
}

module.exports = { handler, logs };
