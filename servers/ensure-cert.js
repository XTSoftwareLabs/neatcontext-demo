"use strict";

// Generates a self-signed TLS certificate for the demo systems on first run.
// Uses the openssl binary (bundled with Git on Windows; standard on macOS/Linux).
// The cert covers `localhost` and `127.0.0.1` so https://localhost:<port> works.
//
// The key/cert are written to servers/certs/ and reused on later runs. They are
// gitignored — each machine generates its own.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const certDir = path.join(__dirname, "certs");
const keyPath = path.join(certDir, "localhost.key");
const certPath = path.join(certDir, "localhost.crt");

function ensureCert() {
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), keyPath, certPath };
  }

  fs.mkdirSync(certDir, { recursive: true });

  try {
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", keyPath,
        "-out", certPath,
        "-days", "825",
        "-subj", "/CN=localhost",
        "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"
      ],
      { stdio: "ignore" }
    );
  } catch (error) {
    throw new Error(
      "Could not generate a self-signed certificate with openssl.\n" +
        "openssl must be on your PATH (it ships with Git for Windows, macOS, and most Linux distros).\n" +
        `Original error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  console.log(`[tls] generated self-signed certificate -> ${certPath}`);
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), keyPath, certPath };
}

module.exports = { ensureCert, certDir, keyPath, certPath };
