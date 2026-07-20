#!/usr/bin/env node
"use strict";

// Ops Demo Systems — a self-contained NeatContext stdio MCP server.
//
// Authored exactly like any third-party extension: it depends only on Node
// built-ins and speaks NeatContext's Content-Length-framed JSON-RPC over stdio
// (initialize / tools/list / tools/call). It exposes read-only tools that query
// the local mock Incident, Log, and Deployment systems started by
// `node servers/index.js`.
//
// NOTE: tool names are NOT prefixed `neatcontext_`. That prefix is reserved for
// trusted (bundled, first-party) extensions; a user extension that uses it has
// those tools filtered out. So we use a plain `demo_` prefix.

const http = require("node:http");
const https = require("node:https");

const INCIDENT_BASE = process.env.NEATCONTEXT_DEMO_INCIDENT_BASE || "https://localhost:7801";
const LOG_BASE = process.env.NEATCONTEXT_DEMO_LOG_BASE || "https://localhost:7802";
const DEPLOY_BASE = process.env.NEATCONTEXT_DEMO_DEPLOY_BASE || "https://localhost:7803";

// The demo systems use a self-signed certificate. We accept it because every
// request is to the demo's own localhost systems and nothing else. This agent
// is scoped to this extension's requests only — it does not change global TLS
// behavior. Point the *_BASE env vars at real systems with valid certs to drop it.
const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

const GET_INCIDENT = "demo_get_incident";
const SEARCH_LOGS = "demo_search_logs";
const LIST_DEPLOYMENTS = "demo_list_deployments";

const tools = [
  {
    name: GET_INCIDENT,
    description:
      "Read incident details from the demo Incident Management System. Accepts an incident URL " +
      "(e.g. https://localhost:7801/incidents/INC-1001) or an incident ID (e.g. INC-1001). Returns title, " +
      "status, urgency, affected service, timeline, related services, and links to the log and deployment systems.",
    inputSchema: objectSchema(
      { incident: { type: "string", description: "Incident URL or incident ID, e.g. INC-1001." } },
      ["incident"]
    )
  },
  {
    name: SEARCH_LOGS,
    description:
      "Search the demo Log System for log lines from a service in a time window. Use after reading an " +
      "incident to inspect the error logs for the affected service (e.g. checkout-api) around the incident time.",
    inputSchema: objectSchema(
      {
        service: { type: "string", description: "Service name, e.g. checkout-api or billing-postgres." },
        from: { type: "string", description: "ISO start time, e.g. 2026-06-30T09:00:00Z." },
        to: { type: "string", description: "ISO end time, e.g. 2026-06-30T09:25:00Z." },
        query: { type: "string", description: "Optional substring filter, e.g. 'pool' or 'stripe'." }
      },
      ["service"]
    )
  },
  {
    name: LIST_DEPLOYMENTS,
    description:
      "List recent deployments from the demo Deployment System. Filter by service and/or a time window " +
      "'ISO..ISO'. Use to find changes that landed shortly before an incident (each entry includes the " +
      "change, the owning team, its risk, and how to roll back).",
    inputSchema: objectSchema(
      {
        service: { type: "string", description: "Optional service name, e.g. checkout-api." },
        window: { type: "string", description: "Optional ISO window 'from..to', e.g. 2026-06-30T08:30:00Z..2026-06-30T09:15:00Z." }
      },
      []
    )
  }
];

let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  readFrames();
});

function readFrames() {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    const end = start + length;
    if (buffer.length < end) return;
    const message = JSON.parse(buffer.slice(start, end).toString("utf8"));
    buffer = buffer.slice(end);
    void handleMessage(message);
  }
}

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

async function handleMessage(request) {
  // This extension declares connection: none, so we ignore the connection handshake.
  if (request.method === "neatcontext/connection") return;

  if (typeof request.id !== "number" && typeof request.id !== "string") {
    return; // a notification we don't handle
  }

  try {
    if (request.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "ops-demo-systems", version: "0.1.0" }
        }
      });
      return;
    }

    if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools } });
      return;
    }

    if (request.method === "tools/call") {
      const result = await handleToolCall(request.params || {});
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
      });
      return;
    }

    send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Unknown method: ${request.method}` } });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32603, message: error instanceof Error ? error.message : "Demo tool failed." }
    });
  }
}

async function handleToolCall(params) {
  const name = params.name;
  const args = objectValue(params.arguments);

  if (name === GET_INCIDENT) return getIncident(args);
  if (name === SEARCH_LOGS) return searchLogs(args);
  if (name === LIST_DEPLOYMENTS) return listDeployments(args);

  return { error: "unknown_tool", message: `Unknown demo tool: ${name}` };
}

async function getIncident(args) {
  const raw = stringArg(args, ["incident", "incident_id", "incidentId", "url", "incident_url"]);
  if (!raw) throw new Error('Tool argument "incident" is required.');
  const id = extractIncidentId(raw);
  return fetchJson(`${INCIDENT_BASE}/incidents/${encodeURIComponent(id)}`, "incident details");
}

async function searchLogs(args) {
  const service = stringArg(args, ["service"]);
  if (!service) throw new Error('Tool argument "service" is required.');
  const qs = new URLSearchParams({ service });
  const from = stringArg(args, ["from"]);
  const to = stringArg(args, ["to"]);
  const query = stringArg(args, ["query"]);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (query) qs.set("query", query);
  return fetchJson(`${LOG_BASE}/logs?${qs.toString()}`, "logs");
}

async function listDeployments(args) {
  const qs = new URLSearchParams();
  const service = stringArg(args, ["service"]);
  const window = stringArg(args, ["window"]);
  if (service) qs.set("service", service);
  if (window) qs.set("window", window);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return fetchJson(`${DEPLOY_BASE}/deployments${suffix}`, "deployments");
}

async function fetchJson(url, subject) {
  let response;
  try {
    response = await httpGet(url);
  } catch (error) {
    return {
      error: "demo_system_unreachable",
      url,
      message:
        `Could not reach the demo ${subject} system at ${url}. ` +
        "Start the mock systems with `node servers/index.js` in the neatcontextdemo project.",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
  if (response.status < 200 || response.status >= 300) {
    return { error: "demo_system_error", url, status: response.status, message: response.body.slice(0, 500) };
  }
  return response.body ? JSON.parse(response.body) : {};
}

// Minimal GET using node:http/https. We use the core modules (not global fetch)
// because they let us attach the self-signed-cert agent for the demo's HTTPS.
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith("https:");
    const lib = isHttps ? https : http;
    const options = isHttps ? { agent: insecureHttpsAgent } : {};
    const req = lib.get(url, options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("request timed out after 10s")));
  });
}

function extractIncidentId(value) {
  const fromUrl = value.match(/\/incidents\/([^/?#\s]+)/i);
  if (fromUrl) return decodeURIComponent(fromUrl[1]).toUpperCase();
  const id = value.match(/\bINC-\d+\b/i);
  if (id) return id[0].toUpperCase();
  const bare = value.match(/\b[A-Z][A-Z0-9-]{3,}\b/i);
  if (bare) return bare[0].toUpperCase();
  throw new Error("Could not find an incident ID or incident URL in the argument.");
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArg(args, keys) {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function objectSchema(properties, required) {
  return { type: "object", properties, required: required || [], additionalProperties: false };
}
