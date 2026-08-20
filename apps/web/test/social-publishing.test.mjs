import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublishReceipt,
  campaignCompletionState,
  createSocialCampaign,
  prepareCampaign,
  transitionCampaign,
} from "../lib/social-publishing.mjs";

test("creates a bounded campaign and prepares one job per unique platform", () => {
  let seq = 0;
  const campaign = createSocialCampaign({
    projectId: "project-1",
    missionId: "mission-1",
    title: "Genesis drop",
    platforms: ["instagram", "threads", "instagram"],
    masterContent: { title: "Genesis", message: "One idea, native variants." },
  }, { now: () => 1000, id: prefix => `${prefix}-${++seq}` });

  const prepared = prepareCampaign(campaign, {
    threads: { message: "A conversational Threads variant." },
  }, { now: () => 2000, id: prefix => `${prefix}-${++seq}` });

  assert.equal(prepared.status, "ready");
  assert.deepEqual(prepared.platforms, ["instagram", "threads"]);
  assert.equal(prepared.jobs.length, 2);
  assert.equal(prepared.jobs[1].variant.message, "A conversational Threads variant.");
});

test("rejects invalid campaign transitions and unsupported platforms", () => {
  assert.throws(() => createSocialCampaign({
    projectId: "p",
    missionId: "m",
    platforms: ["unknown-network"],
    masterContent: { title: "x", message: "y" },
  }), /unsupported social platform/);

  const campaign = createSocialCampaign({
    projectId: "p",
    missionId: "m",
    platforms: ["x"],
    masterContent: { title: "x", message: "y" },
  });
  assert.throws(() => transitionCampaign(campaign, "completed"), /invalid campaign transition/);
});

test("receipt preserves partial failures instead of replaying successful jobs", () => {
  const campaign = {
    id: "c1", projectId: "p", missionId: "m", runId: "r", status: "publishing",
    jobs: [
      { id: "j1", platform: "instagram", status: "live", externalPostId: "ig-1", externalUrl: "https://example.test/ig", attempts: 1 },
      { id: "j2", platform: "tiktok", status: "failed", error: "provider unavailable", attempts: 1 },
    ],
  };
  assert.equal(campaignCompletionState(campaign), "partially_failed");
  const receipt = buildPublishReceipt(campaign, { now: () => 5000 });
  assert.equal(receipt.campaignStatus, "partially_failed");
  assert.equal(receipt.jobs[0].externalPostId, "ig-1");
  assert.equal(receipt.jobs[1].error, "provider unavailable");
});
