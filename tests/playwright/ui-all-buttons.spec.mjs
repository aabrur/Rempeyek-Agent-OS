import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServer, whenHttpModulesReady } = require("../../apps/web/server.js");

let playwright;
try {
  playwright = require("@playwright/test");
} catch (error) {
  throw new Error(`Playwright Chromium is required: ${error.message}`);
}

async function withServer(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-pw-test-"));
  const configPath = path.join(root, "agents.config.json");
  const vaultPath = path.join(root, "Vault");
  const telemetryDir = path.join(root, "telemetry");
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(telemetryDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      agency: "Playwright UI OS",
      activeAgentId: "codex",
      agents: [
        {
          id: "codex",
          kind: "agent",
          name: "Codex",
          role: "Autonomous Engineer",
          node: "Node-12",
          enabled: true,
          lane: "Codex",
          gateway: {
            marketplaceId: "codex",
            trigger: "codex",
            workdir: root,
          },
        },
      ],
    }),
  );

  await whenHttpModulesReady();
  const server = createServer({
    configPath,
    stateRoot: root,
    vaultPath,
    telemetryDir,
    userHome: path.join(root, "home"),
    bundleRoot: path.resolve("marketplace", "bundles"),
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ base, root, server });
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("Playwright UI test exercises the real renderer", async () => {
  if (!playwright?.chromium) {
    throw new Error("Playwright Chromium is required");
  }
  await withServer(async ({ base }) => {
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      const nav = await page.locator("nav#nav").count();
      assert.ok(nav > 0, "primary navigation must render");
      const body = await page.locator("body").innerText();
      assert.ok(body.includes("Codex") || body.includes("Playwright UI OS") || body.includes("AGENTS"));
    } finally {
      await browser.close();
    }
  });
});
