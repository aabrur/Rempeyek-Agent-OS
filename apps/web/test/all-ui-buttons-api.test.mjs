import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServer } = require("../server.js");

async function withServer(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-buttons-test-"));
  const configPath = path.join(root, "agents.config.json");
  const vaultPath = path.join(root, "Vault");
  const telemetryDir = path.join(root, "telemetry");
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(telemetryDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      agency: "Test OS",
      activeAgentId: "hermes",
      agents: [
        {
          id: "hermes",
          kind: "agent",
          name: "Hermes",
          role: "Crypto & ops",
          node: "Node-1",
          enabled: true,
          lane: "Hermes",
          gateway: {
            marketplaceId: "hermes",
            trigger: "hermes",
            workdir: root,
          },
        },
      ],
    }),
  );

  const server = createServer({
    configPath,
    stateRoot: root,
    vaultPath,
    telemetryDir,
    userHome: path.join(root, "home"),
    bundleRoot: path.resolve("marketplace", "bundles"),
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  await new Promise(resolve => setTimeout(resolve, 150));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ base, root, vaultPath, telemetryDir });
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function approve(base, type, target) {
  const requested = await fetch(`${base}/api/approvals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, target, consequence: `${type} ${target}`, actor: "test" }),
  }).then(res => res.json());
  const decision = await fetch(`${base}/api/approvals/${requested.id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved", confirmed: true }),
  });
  assert.equal(decision.status, 200);
  return requested.id;
}

test("API routes cover all UI action button backend contracts", () => withServer(async ({ base }) => {
  // 1. /api/state - Status / State poll
  const stateRes = await fetch(`${base}/api/state`);
  assert.equal(stateRes.status, 200);
  const state = await stateRes.json();
  assert.ok(state.agents);
  assert.equal(state.agents[0].id, "hermes");

  // 2. /api/marketplace - Marketplace Catalog entries
  const catRes = await fetch(`${base}/api/marketplace`);
  assert.equal(catRes.status, 200);
  const cat = await catRes.json();
  assert.ok(Array.isArray(cat.entries));

  // 3. /api/version - Version / Check for Updates
  const verRes = await fetch(`${base}/api/version`);
  assert.equal(verRes.status, 200);
  const ver = await verRes.json();
  assert.ok(ver.version);

  // 4. /api/settings/runtime - Runtime Settings
  const setRes = await fetch(`${base}/api/settings/runtime`);
  assert.equal(setRes.status, 200);
  const settings = await setRes.json();
  assert.ok(settings.paths);

  // 5. /api/vault-health - Vault Health
  const vhRes = await fetch(`${base}/api/vault-health`);
  assert.equal(vhRes.status, 200);
  const vh = await vhRes.json();
  assert.ok(vh.vault);

  // 6. Register custom agent (/api/agents/add) - Single valid request body
  const customId = `custom-agent-${Date.now()}`;
  const addApproval = await approve(base, "agents.add", "registry");
  const addRes = await fetch(`${base}/api/agents/add`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-approval-id": addApproval },
    body: JSON.stringify({ id: customId, name: "Custom Agent", trigger: "custom-cli", home: "C:\\Agents\\Custom" }),
  });
  const added = await addRes.json();
  assert.equal(addRes.status, 200, `addAgent status: ${addRes.status}, body: ${JSON.stringify(added)}`);
  assert.equal(added.ok, true);
  assert.equal(added.agent.id, customId);
}));
