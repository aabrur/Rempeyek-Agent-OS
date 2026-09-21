import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServer, whenHttpModulesReady } = require("../server.js");

function fetchResponse(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    }).on("error", reject);
  });
}

test("API and static responses include defense-in-depth security headers and CSP", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-sec-test-"));
  const configPath = path.join(root, "agents.config.json");
  const vaultPath = path.join(root, "Vault");
  const distDir = path.join(root, "dist");
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ agency: "Test", agents: [] }));
  fs.writeFileSync(
    path.join(distDir, "index.html"),
    "<!doctype html><html><head><title>Test</title></head><body><h1>Rempeyek</h1></body></html>",
  );

  const server = createServer({
    configPath,
    stateRoot: root,
    vaultPath,
    telemetryDir: path.join(root, "telemetry"),
    distDir,
  });

  await whenHttpModulesReady();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    // 1. JSON API endpoint
    const apiRes = await fetchResponse(port, "/api/version");
    assert.equal(apiRes.status, 200);
    assert.equal(apiRes.headers["x-content-type-options"], "nosniff");
    assert.equal(apiRes.headers["x-frame-options"], "SAMEORIGIN");
    assert.equal(apiRes.headers["referrer-policy"], "no-referrer");

    // 2. HTML static route
    const htmlRes = await fetchResponse(port, "/");
    assert.equal(htmlRes.status, 200);
    assert.equal(htmlRes.headers["x-content-type-options"], "nosniff");
    assert.equal(htmlRes.headers["x-frame-options"], "SAMEORIGIN");
    assert.ok(htmlRes.headers["content-security-policy"], "CSP header must be present on HTML");
    assert.ok(htmlRes.headers["content-security-policy"].includes("default-src 'self'"));

    // 3. Fallback / 404 response includes base security headers
    const notFoundRes = await fetchResponse(port, "/missing-file.xyz");
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.headers["x-content-type-options"], "nosniff");
    assert.equal(notFoundRes.headers["x-frame-options"], "SAMEORIGIN");
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
