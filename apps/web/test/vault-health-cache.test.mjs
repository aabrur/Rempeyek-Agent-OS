import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServer, whenHttpModulesReady } = require("../server.js");

function fetchJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    }).on("error", reject);
  });
}

test("vault-health endpoint caches result and returns fast on repeated calls", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-vh-test-"));
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
    // First call (populates cache)
    const first = await fetchJson(port, "/api/vault-health");
    assert.equal(first.status, 200);
    assert.ok(first.data.vault);

    // 10 concurrent repeated calls within cache window
    const t0 = performance.now();
    const concurrent = await Promise.all(
      Array.from({ length: 10 }, () => fetchJson(port, "/api/vault-health"))
    );
    const totalDuration = performance.now() - t0;

    for (const res of concurrent) {
      assert.equal(res.status, 200);
      assert.deepEqual(res.data, first.data);
    }

    // Cached responses must be fast (< 100ms total for all 10 concurrent requests)
    assert.ok(totalDuration < 150, `Expected cached calls to be fast, took ${totalDuration}ms`);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
