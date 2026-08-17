import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApprovalQueue } from "../lib/approval-queue.mjs";
import { createSocialCampaign } from "../lib/social-publishing.mjs";
import { createSocialPublishingOrchestrator } from "../lib/social-publishing-orchestrator.mjs";
import { createSocialPublishingStore } from "../lib/social-publishing-store.mjs";

async function withRuntime(run) {
  const root = await mkdtemp(path.join(tmpdir(), "rempeyek-social-"));
  try {
    const store = createSocialPublishingStore({ filePath: path.join(root, "social-publishing.json") });
    return await run({ root, store });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function campaign() {
  return createSocialCampaign({
    projectId: "project-1",
    missionId: "mission-1",
    title: "Launch",
    platforms: ["instagram", "tiktok"],
    masterContent: { title: "Launch", message: "Platform-native campaign." },
  });
}

test("requires scoped approval before external publishing and consumes it once", async () => withRuntime(async ({ store }) => {
  const queue = createApprovalQueue();
  const calls = [];
  const orchestrator = createSocialPublishingOrchestrator({
    store,
    approvalQueue: queue,
    adapters: {
      instagram: { publish: async job => { calls.push(job.platform); return { ok: true, externalPostId: "ig-1" }; } },
      tiktok: { publish: async job => { calls.push(job.platform); return { ok: true, externalPostId: "tt-1" }; } },
    },
  });

  let current = orchestrator.prepare(campaign());
  const requested = orchestrator.requestApproval(current);
  current = requested.campaign;
  await assert.rejects(() => orchestrator.run(current.id), /cannot publish/);
  queue.decide(requested.approval.id, { decision: "approved", actor: "founder" });
  current = orchestrator.authorize(current);
  const result = await orchestrator.run(current.id);

  assert.equal(result.campaign.status, "completed");
  assert.deepEqual(calls.sort(), ["instagram", "tiktok"]);
  assert.equal(queue.authorize(requested.approval.id, { type: "social.publish", target: current.id }).allowed, false);
  assert.equal(result.receipt.jobs.every(job => job.status === "live"), true);
}));

test("partial failure preserves live posts and retries only failed jobs", async () => withRuntime(async ({ store }) => {
  const queue = createApprovalQueue();
  let tiktokAttempts = 0;
  let instagramAttempts = 0;
  const orchestrator = createSocialPublishingOrchestrator({
    store,
    approvalQueue: queue,
    adapters: {
      instagram: { publish: async () => { instagramAttempts += 1; return { ok: true, externalPostId: "ig-1" }; } },
      tiktok: { publish: async () => {
        tiktokAttempts += 1;
        return tiktokAttempts === 1 ? { ok: false, error: "temporary" } : { ok: true, externalPostId: "tt-1" };
      } },
    },
  });

  let current = orchestrator.prepare(campaign());
  const requested = orchestrator.requestApproval(current);
  queue.decide(requested.approval.id, { decision: "approved", actor: "founder" });
  current = orchestrator.authorize(requested.campaign);
  const first = await orchestrator.run(current.id);
  assert.equal(first.campaign.status, "partially_failed");
  assert.equal(instagramAttempts, 1);
  assert.equal(tiktokAttempts, 1);

  const retry = await orchestrator.retryFailed(current.id);
  assert.equal(retry.campaign.status, "completed");
  assert.equal(instagramAttempts, 1);
  assert.equal(tiktokAttempts, 2);
}));
