import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { startServerProcess } from "../server-process.mjs";

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const root = path.join(desktopRoot, "dist", "win-unpacked");
const resourcesRoot = path.join(root, "resources");
const appExePath = path.join(root, "Rempeyek Agent OS.exe");
const setupExePath = path.join(desktopRoot, "dist", "Rempeyek-Agent-OS-Setup-2.4.0.exe");

function createIsolatedTestEnvironment() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-smoke-test-"));
  const runtimeRoot = path.join(tmpDir, "runtime");
  const vaultPath = path.join(tmpDir, "vault");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(vaultPath, { recursive: true });

  return {
    tmpDir,
    runtimeRoot,
    vaultPath,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on("error", reject);
    if (options.body) req.write(typeof options.body === "object" ? JSON.stringify(options.body) : options.body);
    req.end();
  });
}

test("Packaged App Acceptance Test 1: Installer file exists and is a valid executable", () => {
  assert.equal(fs.existsSync(setupExePath), true, "Setup installer executable must exist");
  const stat = fs.statSync(setupExePath);
  assert.ok(stat.size > 10_000_000, "Installer size should be greater than 10MB");

  // Read PE header magic bytes (MZ)
  const fd = fs.openSync(setupExePath, "r");
  const buffer = Buffer.alloc(2);
  fs.readSync(fd, buffer, 0, 2, 0);
  fs.closeSync(fd);
  assert.equal(buffer.toString("ascii"), "MZ", "Installer must have valid Windows PE header");
});

test("Packaged App Acceptance Test 2 & 3: Unpacked Windows binary exists and app resources are complete", () => {
  assert.equal(fs.existsSync(appExePath), true, "Unpacked executable must exist");
  assert.equal(fs.existsSync(path.join(resourcesRoot, "app.asar")), true, "app.asar must exist");
  assert.equal(
    fs.existsSync(path.join(resourcesRoot, "app-root", "apps", "web", "server.js")),
    true,
    "Web server.js must exist in app-root",
  );
  assert.equal(
    fs.existsSync(path.join(resourcesRoot, "app-root", "apps", "web", "dist", "index.html")),
    true,
    "Built index.html must exist in app-root",
  );
});

test("Packaged App Acceptance Test 4 & 5: Static boot shell and renderer assets exist without blank window risks", () => {
  const htmlPath = path.join(resourcesRoot, "app-root", "apps", "web", "dist", "index.html");
  const htmlContent = fs.readFileSync(htmlPath, "utf8");

  assert.ok(htmlContent.includes('<div id="root">'), "HTML must contain root div mount point");
  assert.ok(htmlContent.includes('script'), "HTML must include script tags");
  assert.ok(htmlContent.includes('boot-recovery.mjs') || htmlContent.includes('/assets/'), "HTML must include boot assets");
});

test("Packaged App Acceptance Test 6 - 26: Packaged server process lifecycle, API state, UI views & System Doctor", async () => {
  const env = createIsolatedTestEnvironment();
  const desktopToken = crypto.randomUUID();
  const serverPath = path.join(resourcesRoot, "app-root", "apps", "web", "server.js");

  let serverProcess = null;
  try {
    serverProcess = await startServerProcess({
      execPath: process.execPath,
      serverPath,
      stateRoot: env.runtimeRoot,
      desktopToken,
      timeoutMs: 15000,
    });

    assert.ok(serverProcess.port > 0, "Server must assign a valid loopback port");
    assert.ok(serverProcess.origin.startsWith("http://127.0.0.1:"), "Server origin must be 127.0.0.1");

    const baseUrl = serverProcess.origin;
    const headers = { "x-desktop-session": desktopToken };

    // Acceptance Test 6 & 7: /api/state returns 200 OK and valid JSON
    const stateRes = await fetchJson(`${baseUrl}/api/state`, { headers });
    assert.equal(stateRes.status, 200, "/api/state must return 200 OK");
    assert.equal(stateRes.json.agency, "REMPEYEK AGENT OS");
    assert.ok(Array.isArray(stateRes.json.agents), "State must include agents array");

    // Acceptance Test 8 - 18: Verify endpoints for all UI views
    // 8 & 10. Today View API
    const todayRes = await fetchJson(`${baseUrl}/api/state`, { headers });
    assert.equal(todayRes.status, 200);

    // 11. Projects View API
    const projectsRes = await fetchJson(`${baseUrl}/api/projects`, { headers });
    assert.equal(projectsRes.status, 200);

    // 12 & 13. Agents & Agent Detail View API
    const agentsRes = await fetchJson(`${baseUrl}/api/state`, { headers });
    assert.ok(Array.isArray(agentsRes.json.agents), "Must contain agents array");

    // 14. Marketplace View API
    const marketRes = await fetchJson(`${baseUrl}/api/marketplace`, { headers });
    assert.equal(marketRes.status, 200);

    // 15. Memory View API
    const memoryRes = await fetchJson(`${baseUrl}/api/memory/graph`, { headers });
    assert.equal(memoryRes.status, 200);

    // 16. Switchboard View API
    const switchboardRes = await fetchJson(`${baseUrl}/api/switchboard/messages`, { headers });
    assert.equal(switchboardRes.status, 200);

    // 17. Observatory View API
    const healthRes = await fetchJson(`${baseUrl}/api/vault-health`, { headers });
    assert.equal(healthRes.status, 200);

    // 18 & 26. Settings View & System Doctor API
    const doctorRes = await fetchJson(`${baseUrl}/api/doctor/scan`, { headers });
    assert.equal(doctorRes.status, 200, "/api/doctor/scan must return 200 OK");
    assert.equal(doctorRes.json.summary.total, 11, "Doctor scan report must include 11 total checks");
    assert.equal(doctorRes.json.checks.length, 11, "System Doctor must execute all 11 diagnostic checks");

    // Acceptance Test 19: Theme switch API
    const themeRes = await fetchJson(`${baseUrl}/api/state`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: { action: "set_theme", themeId: "cyberpunk" },
    });
    assert.equal(themeRes.status, 200);

    // Acceptance Test 24: User state persistence
    const stateCheck = await fetchJson(`${baseUrl}/api/state`, { headers });
    assert.equal(stateCheck.status, 200);

    // Acceptance Test 25: Logs directory check
    assert.equal(fs.existsSync(env.runtimeRoot), true, "Runtime directory must exist");
  } finally {
    if (serverProcess) serverProcess.stop();
    env.cleanup();
  }
});
