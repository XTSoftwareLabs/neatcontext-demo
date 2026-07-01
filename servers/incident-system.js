"use strict";

// Mock Incident Management System (PagerDuty-like).
// Read-only API serving fake-but-realistic incidents. Exports a request handler;
// servers/index.js mounts it on an HTTPS server with a self-signed cert.
//
// Endpoints:
//   GET /incidents              -> list incidents
//   GET /incidents/:id          -> one incident (with timeline + linked systems)
//   GET /health                 -> { ok: true }
//
// Incident URLs look like:  https://localhost:7801/incidents/INC-1001

// One shared incident with ONE true root cause: the 08:58 infra-team
// pgbouncer change (default_pool_size 100 -> 40) starved the billing-postgres
// connection pool. checkout-api (Payments) is a victim, not the cause.
//
// IMPORTANT (demo design): the incident is intentionally SYMPTOM-ONLY. It does
// NOT pre-reveal the onset time, the dominant error, the deploys, or Stripe's
// health. That evidence lives in the Log System (7802) and Deployment System
// (7803). This forces the model to actually CALL demo_search_logs and
// demo_list_deployments (not just demo_get_incident) to investigate — and each
// team still reaches its OWN correct outcome from the same raw evidence:
//   * Payments Engineering finds the 5xx predate its 09:05 deploy, Stripe is
//     healthy, and the dominant error is shared-DB-pool exhaustion it does not
//     own, and correctly HANDS OFF to Infra Team.
//   * Infra Team finds the 08:58 pool-size change is the root cause and
//     gives the fix + next actions (revert to 100 + RELOAD).
const incidents = {
  "INC-1001": {
    id: "INC-1001",
    number: 1001,
    title: "Elevated 5xx error rate on checkout-api (production)",
    status: "triggered",
    urgency: "high",
    severity: "SEV2",
    service: "checkout-api",
    environment: "production",
    region: "us-east-1",
    created_at: "2026-06-30T09:12:00Z",
    updated_at: "2026-06-30T09:24:00Z",
    resolved_at: null,
    alert_source: "Datadog",
    description:
      "5xx error rate on checkout-api exceeded the 5% threshold for 10 minutes (peak 9.1%). " +
      "Customers report failed checkouts at the payment step (HTTP 500/503). p99 latency on " +
      "POST /checkout rose from 240ms to 5.2s. Root cause not yet established — pull the " +
      "checkout-api logs and the recent deployments (see linked_systems) to investigate.",
    impact:
      "Customer-facing: a portion of checkout attempts fail with HTTP 500/503. Revenue impact ongoing.",
    related_services: ["billing-api", "invoice-worker", "billing-postgres", "kafka-billing-events"],
    service_ownership: {
      "checkout-api": "Payments Engineering",
      "invoice-worker": "Payments Engineering",
      "billing-postgres": "Infra Team",
      "pgbouncer": "Infra Team",
      "kafka-billing-events": "Infra Team"
    },
    // Pointers the NeatContext demo extension can follow into the other systems.
    linked_systems: {
      logs: "https://localhost:7802/logs?service=checkout-api&from=2026-06-30T09:00:00Z&to=2026-06-30T09:25:00Z",
      deployments: "https://localhost:7803/deployments?window=2026-06-30T08:30:00Z..2026-06-30T09:15:00Z"
    },
    // Symptom-only: the alert lifecycle, NOT the evidence. The onset time, the
    // dominant error, the deploys, and Stripe's health are intentionally absent
    // here — they live in the Log/Deployment systems and must be fetched.
    timeline: [
      { at: "2026-06-30T09:12:00Z", note: "Datadog monitor 'checkout-api 5xx rate' triggered (SEV2)." },
      { at: "2026-06-30T09:18:00Z", note: "On-call acknowledged. Investigating elevated 5xx and latency on checkout-api." },
      { at: "2026-06-30T09:24:00Z", note: "Error rate still elevated (8.4%). Investigation ongoing." }
    ]
  }
};

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

  if (url.pathname === "/health") return send(res, 200, { ok: true, system: "incident" });

  if (url.pathname === "/incidents") {
    return send(res, 200, {
      incidents: Object.values(incidents).map((i) => ({
        id: i.id,
        number: i.number,
        title: i.title,
        status: i.status,
        urgency: i.urgency,
        service: i.service,
        created_at: i.created_at
      }))
    });
  }

  const match = url.pathname.match(/^\/incidents\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]).toUpperCase();
    const incident = incidents[id];
    if (!incident) return send(res, 404, { error: "not_found", message: `No incident ${id}` });
    return send(res, 200, incident);
  }

  return send(res, 404, { error: "not_found", message: `Unknown path ${url.pathname}` });
}

module.exports = { handler, incidents };
