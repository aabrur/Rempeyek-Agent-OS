import {
  buildPublishReceipt,
  campaignCompletionState,
  prepareCampaign,
  transitionCampaign,
  transitionJob,
} from "./social-publishing.mjs";

const clone = value => structuredClone(value);

function adapterFor(adapters, platform) {
  const adapter = adapters?.[platform];
  if (!adapter || typeof adapter.publish !== "function") {
    throw new Error(`publisher adapter unavailable for '${platform}'`);
  }
  return adapter;
}

export function createSocialPublishingOrchestrator({
  store,
  approvalQueue,
  adapters = {},
  now = Date.now,
} = {}) {
  if (!store) throw new Error("store is required");
  if (!approvalQueue) throw new Error("approvalQueue is required");

  const persist = campaign => store.put(campaign);

  const requestApproval = campaign => {
    if (campaign.status !== "ready") throw new Error("campaign must be ready before approval");
    const approval = approvalQueue.request({
      type: "social.publish",
      target: campaign.id,
      consequence: `Publish campaign '${campaign.title}' to ${campaign.platforms.length} external platform(s)`,
      actor: "social-publishing",
    });
    const next = transitionCampaign(campaign, "approval_required", {
      now,
      summary: `External publishing approval requested: ${approval.id}`,
    });
    next.approvalPolicy.approvalId = approval.id;
    next.jobs = next.jobs.map(job => transitionJob(job, "approval_required", { now }));
    return { campaign: persist(next), approval };
  };

  const authorize = campaign => {
    if (campaign.status === "ready" && campaign.approvalPolicy.mode === "within-contract") {
      const queued = transitionCampaign(campaign, "queued", { now, summary: "Queued under Work Contract authority" });
      queued.jobs = queued.jobs.map(job => transitionJob(job, "queued", { now }));
      return persist(queued);
    }
    if (campaign.status !== "approval_required") throw new Error("campaign is not waiting for approval");
    const approvalId = campaign.approvalPolicy.approvalId;
    const result = approvalQueue.authorize(approvalId, {
      type: "social.publish",
      target: campaign.id,
      actor: "social-publishing",
    });
    if (!result.allowed) throw new Error(`publishing approval denied: ${result.reason}`);
    const queued = transitionCampaign(campaign, "queued", { now, summary: "Scoped publishing approval consumed" });
    queued.jobs = queued.jobs.map(job => job.status === "approval_required" ? transitionJob(job, "queued", { now }) : job);
    return persist(queued);
  };

  const publishOne = async (campaign, job) => {
    const adapter = adapterFor(adapters, job.platform);
    let working = transitionJob(job, "publishing", {
      now,
      patch: { attempts: (job.attempts || 0) + 1, error: null },
    });
    campaign.jobs = campaign.jobs.map(item => item.id === job.id ? working : item);
    persist(campaign);
    try {
      const result = await adapter.publish(clone(working), {
        campaign: clone(campaign),
        publishAt: working.publishAt,
      });
      if (!result || result.ok !== true) throw new Error(result?.error || "publisher returned no success receipt");
      working = transitionJob(working, "live", {
        now,
        patch: {
          externalPostId: result.externalPostId || null,
          externalUrl: result.externalUrl || null,
          providerReceipt: result.receipt || null,
        },
      });
    } catch (error) {
      working = transitionJob(working, "failed", {
        now,
        patch: { error: String(error?.message || error || "publish failed").slice(0, 1000) },
      });
    }
    campaign.jobs = campaign.jobs.map(item => item.id === working.id ? working : item);
    return persist(campaign);
  };

  const run = async campaignId => {
    let campaign = store.get(campaignId);
    if (!campaign) throw new Error("campaign not found");
    if (campaign.status !== "queued" && campaign.status !== "partially_failed" && campaign.status !== "failed") {
      throw new Error(`campaign cannot publish from '${campaign.status}'`);
    }
    if (campaign.status !== "queued") {
      campaign = transitionCampaign(campaign, "queued", { now, summary: "Retrying failed publish jobs only" });
      campaign.jobs = campaign.jobs.map(job => job.status === "failed" ? transitionJob(job, "queued", { now }) : job);
    }
    campaign = transitionCampaign(campaign, "publishing", { now });
    persist(campaign);

    for (const job of campaign.jobs.filter(item => item.status === "queued")) {
      campaign = await publishOne(campaign, job);
    }

    const completion = campaignCompletionState(campaign);
    if (completion !== campaign.status) {
      campaign = transitionCampaign(campaign, completion, {
        now,
        summary: completion === "completed"
          ? "All platform publications have verified live receipts"
          : completion === "partially_failed"
            ? "Some platform publications failed; successful posts were preserved"
            : "No platform publication completed successfully",
      });
      persist(campaign);
    }
    return { campaign: clone(campaign), receipt: buildPublishReceipt(campaign, { now }) };
  };

  return Object.freeze({
    prepare(campaign, variants) {
      return persist(prepareCampaign(campaign, variants, { now }));
    },
    requestApproval,
    authorize,
    run,
    retryFailed(campaignId) {
      const campaign = store.get(campaignId);
      if (!campaign) throw new Error("campaign not found");
      if (!["partially_failed", "failed"].includes(campaign.status)) throw new Error("campaign has no retryable failure state");
      return run(campaignId);
    },
  });
}
