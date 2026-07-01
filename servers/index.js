"use strict";

// Launcher: starts the three mock systems the NeatContext demo talks to, over
// HTTPS using a self-signed certificate (auto-generated on first run).
//   Incident Management System  ->  https://localhost:7801
//   Log System                  ->  https://localhost:7802
//   Deployment System           ->  https://localhost:7803
//
// No npm dependencies — plain Node https + openssl for the cert. Run:
//   node servers/index.js
// Override ports with INCIDENT_PORT / LOG_PORT / DEPLOY_PORT.

const https = require("node:https");
const { ensureCert } = require("./ensure-cert");
const incident = require("./incident-system");
const logs = require("./log-system");
const deployments = require("./deployment-system");

const tls = ensureCert();

function httpsServer(handler) {
  return https.createServer({ key: tls.key, cert: tls.cert }, handler);
}

const services = [
  { name: "Incident Management System", server: httpsServer(incident.handler), port: Number(process.env.INCIDENT_PORT || 7801) },
  { name: "Log System", server: httpsServer(logs.handler), port: Number(process.env.LOG_PORT || 7802) },
  { name: "Deployment System", server: httpsServer(deployments.handler), port: Number(process.env.DEPLOY_PORT || 7803) }
];

for (const s of services) {
  s.server.listen(s.port, "127.0.0.1", () => {
    console.log(`[${s.name}] listening on https://localhost:${s.port}`);
  });
  s.server.on("error", (err) => {
    console.error(`[${s.name}] failed on port ${s.port}: ${err.message}`);
    process.exit(1);
  });
}

console.log("\nDemo incident URL to paste into NeatContext:");
console.log("  https://localhost:7801/incidents/INC-1001\n");
console.log("(Self-signed cert — the Ops Demo Systems extension is configured to accept it.)\n");

function shutdown() {
  console.log("\nShutting down demo systems...");
  for (const s of services) s.server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
