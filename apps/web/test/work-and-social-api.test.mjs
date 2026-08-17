import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServer } = require("../server.js");

async function withServer(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-work-api-"));
  const configPath = path.join(root, "agents.config.json");
  const vaultPath = path.join(root, "Vault");
  const telemetryDir = path.join(root, "telemetry");
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(telemetryDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({ agency: "Test", activeAgentId: "codex", agents: [] }),
  );

  const server = createServer({
    configPath,
    stateRoot: root,
    vaultPath,
    telemetryDir,
    userHome: path.join(root, "home"),
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ base, vaultPath, root });
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("REST API: Work Lifecycle endpoints (missions, contracts, runs)", async () => withServer(async ({ base }) => {
  // 1. Create Mission
  const createRes = await fetch(`${base}/api/work/missions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "apollo", title: "Launch v2.5", goal: "Complete launch" }),
  });
  assert.equal(createRes.status, 201);
  const mission = await createRes.json();
  assert.equal(mission.title, "Launch v2.5");
  assert.equal(mission.status, "DRAFT");

  // 2. List Missions
  const listRes = await fetch(`${base}/api/work/missions?projectId=apollo`);
  assert.equal(listRes.status, 200);
  const { missions } = await listRes.json();
  assert.equal(missions.length, 1);
  assert.equal(missions[0].missionId, mission.missionId);

  // 3. Transition Mission
  const patchRes = await fetch(`${base}/api/work/missions/${mission.missionId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "PLANNED", reason: "Scope defined" }),
  });
  assert.equal(patchRes.status, 200);
  const updatedMission = await patchRes.json();
  assert.equal(updatedMission.status, "PLANNED");

  // 4. Create Contract
  const contractRes = await fetch(`${base}/api/work/contracts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      missionId: mission.missionId,
      objective: "Execute launch verification",
      definitionOfDone: ["Tests passing", "Release notes written"],
    }),
  });
  assert.equal(contractRes.status, 201);
  const contract = await contractRes.json();
  assert.equal(contract.objective, "Execute launch verification");

  // 5. Create Run
  const runRes = await fetch(`${base}/api/work/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      missionId: mission.missionId,
      contractId: contract.contractId,
      workerId: "codex",
    }),
  });
  assert.equal(runRes.status, 201);
  const run = await runRes.json();
  assert.equal(run.workerId, "codex");
  assert.equal(run.status, "STARTING");
}));

test("REST API: Social Publishing endpoints (campaigns, schedule, publish, retry, connectors)", async () => withServer(async ({ base }) => {
  // 1. Create Campaign
  const createRes = await fetch(`${base}/api/social/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: "apollo",
      objective: "Deploy multi-platform AI agents",
      targetPlatforms: ["twitter", "linkedin"],
      CTA: "Try Rempeyek OS",
    }),
  });
  assert.equal(createRes.status, 201);
  const { campaign, variants } = await createRes.json();
  assert.equal(campaign.objective, "Deploy multi-platform AI agents");
  assert.equal(variants.length, 2);

  // 2. Schedule Campaign
  const schedRes = await fetch(`${base}/api/social/campaigns/${campaign.campaignId}/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(schedRes.status, 200);
  const schedData = await schedRes.json();
  assert.equal(schedData.campaign.status, "QUEUED");
  assert.equal(schedData.jobs.length, 2);

  // 3. Publish Campaign
  const pubRes = await fetch(`${base}/api/social/campaigns/${campaign.campaignId}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(pubRes.status, 200);
  const pubData = await pubRes.json();
  assert.equal(pubData.campaign.status, "LIVE");
  assert.equal(pubData.results.length, 2);
  assert.ok(pubData.results[0].receipt);

  // 4. Get Campaign Detail
  const detailRes = await fetch(`${base}/api/social/campaigns/${campaign.campaignId}`);
  assert.equal(detailRes.status, 200);
  const detail = await detailRes.json();
  assert.equal(detail.campaign.status, "LIVE");
  assert.equal(detail.jobs.length, 2);
  assert.equal(detail.receipts.length, 2);

  // 5. Connectors
  const connRes = await fetch(`${base}/api/social/connectors`);
  assert.equal(connRes.status, 200);
  const { connectors } = await connRes.json();
  assert.ok(Array.isArray(connectors));
}));
