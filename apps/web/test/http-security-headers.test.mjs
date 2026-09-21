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
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ agency: "Test", agents: [] }));

  const server = createServer({
    configPath,
    stateRoot: root,
    vaultPath,
    telemetryDir: path.join(root, "telemetry"),
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
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
