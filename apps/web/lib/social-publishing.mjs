import crypto from "node:crypto";

export const SOCIAL_PLATFORMS = Object.freeze([
  "instagram",
  "youtube",
  "linkedin",
  "tiktok",
  "facebook",
  "threads",
  "x",
  "pinterest",
  "bluesky",
  "reddit",
  "telegram",
  "discord",
  "google-business",
]);

export const CAMPAIGN_STATES = Object.freeze([
  "draft",
  "ready",
  "approval_required",
  "queued",
  "publishing",
  "partially_failed",
  "completed",
  "failed",
  "cancelled",
]);

export const JOB_STATES = Object.freeze([
  "pending",
  "approval_required",
  "queued",
  "publishing",
  "live",
  "failed",
  "cancelled",
]);

const CAMPAIGN_TRANSITIONS = Object.freeze({
  draft: new Set(["ready", "cancelled"]),
  ready: new Set(["approval_required", "queued", "cancelled"]),
  approval_required: new Set(["queued", "cancelled"]),
  queued: new Set(["publishing", "cancelled"]),
  publishing: new Set(["partially_failed", "completed", "failed"]),
  partially_failed: new Set(["queued", "publishing", "failed", "completed", "cancelled"]),
  completed: new Set(),
  failed: new Set(["queued", "cancelled"]),
  cancelled: new Set(),
});

const JOB_TRANSITIONS = Object.freeze({
  pending: new Set(["approval_required", "queued", "cancelled"]),
  approval_required: new Set(["queued", "cancelled"]),
  queued: new Set(["publishing", "cancelled"]),
  publishing: new Set(["live", "failed"]),
  live: new Set(),
  failed: new Set(["queued", "cancelled"]),
  cancelled: new Set(),
});

const text = value => typeof value === "string" ? value.trim() : "";
const clone = value => structuredClone(value);
const nowIso = now => new Date(now()).toISOString();
const randomId = prefix => `${prefix}-${crypto.randomUUID()}`;

function assertState(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`invalid ${label} '${value}'`);
}

function assertTransition(current, next, table, label) {
  if (current === next) return;
  const allowed = table[current];
  if (!allowed || !allowed.has(next)) throw new Error(`invalid ${label} transition ${current} -> ${next}`);
}

function uniquePlatforms(platforms) {
  if (!Array.isArray(platforms) || platforms.length === 0) throw new Error("at least one platform is required");
  const output = [];
  for (const raw of platforms) {
    const platform = text(raw).toLowerCase();
    if (!SOCIAL_PLATFORMS.includes(platform)) throw new Error(`unsupported social platform '${platform}'`);
    if (!output.includes(platform)) output.push(platform);
  }
  return output;
}

export function validateMasterContent(input = {}) {
  const title = text(input.title);
  const message = text(input.message);
  if (!title) throw new Error("master content title is required");
  if (!message) throw new Error("master content message is required");
  if (title.length > 200) throw new Error("master content title is too long");
  if (message.length > 20000) throw new Error("master content message is too long");
  const assets = Array.isArray(input.assets) ? input.assets.map(asset => ({ ...asset })) : [];
  return {
    title,
    message,
    cta: text(input.cta),
    link: text(input.link),
    tags: Array.isArray(input.tags) ? input.tags.map(text).filter(Boolean).slice(0, 50) : [],
    assets,
  };
}

export function createSocialCampaign(input = {}, { now = Date.now, id = randomId } = {}) {
  const projectId = text(input.projectId);
  const missionId = text(input.missionId);
  if (!projectId) throw new Error("projectId is required");
  if (!missionId) throw new Error("missionId is required");
  const platforms = uniquePlatforms(input.platforms);
  const createdAt = nowIso(now);
  const campaign = {
    schemaVersion: 1,
    id: text(input.id) || id("campaign"),
    projectId,
    missionId,
    runId: text(input.runId) || null,
    title: text(input.title) || "Untitled campaign",
    objective: text(input.objective),
    status: "draft",
    platforms,
    masterContent: validateMasterContent(input.masterContent),
    approvalPolicy: {
      mode: ["always", "within-contract"].includes(input.approvalPolicy?.mode)
        ? input.approvalPolicy.mode
        : "always",
      approvalId: null,
    },
    schedule: input.schedule?.publishAt ? { publishAt: new Date(input.schedule.publishAt).toISOString() } : null,
    jobs: [],
    events: [],
    createdAt,
    updatedAt: createdAt,
  };
  campaign.events.push({ type: "social.campaign.created", at: createdAt, summary: `Campaign created for ${platforms.length} platform(s)` });
  return campaign;
}

export function transitionCampaign(campaign, next, { now = Date.now, summary = "" } = {}) {
  assertState(campaign.status, CAMPAIGN_STATES, "campaign state");
  assertState(next, CAMPAIGN_STATES, "campaign state");
  assertTransition(campaign.status, next, CAMPAIGN_TRANSITIONS, "campaign");
  const at = nowIso(now);
  const output = clone(campaign);
  output.status = next;
  output.updatedAt = at;
  output.events = [...(output.events || []), {
    type: `social.campaign.${next}`,
    at,
    summary: text(summary) || `Campaign state changed to ${next}`,
  }];
  return output;
}

export function createPlatformVariant(masterContent, platform, overrides = {}) {
  if (!SOCIAL_PLATFORMS.includes(platform)) throw new Error(`unsupported social platform '${platform}'`);
  const base = validateMasterContent(masterContent);
  return {
    platform,
    title: text(overrides.title) || base.title,
    message: text(overrides.message) || base.message,
    cta: text(overrides.cta) || base.cta,
    link: text(overrides.link) || base.link,
    tags: Array.isArray(overrides.tags) ? overrides.tags.map(text).filter(Boolean) : base.tags,
    assets: Array.isArray(overrides.assets) ? overrides.assets.map(asset => ({ ...asset })) : base.assets,
    metadata: overrides.metadata && typeof overrides.metadata === "object" ? clone(overrides.metadata) : {},
  };
}

export function prepareCampaign(campaign, variants = {}, { now = Date.now, id = randomId } = {}) {
  if (campaign.status !== "draft") throw new Error("only draft campaigns can be prepared");
  const prepared = clone(campaign);
  prepared.jobs = prepared.platforms.map(platform => ({
    schemaVersion: 1,
    id: id("publish-job"),
    campaignId: prepared.id,
    projectId: prepared.projectId,
    missionId: prepared.missionId,
    runId: prepared.runId,
    platform,
    status: "pending",
    variant: createPlatformVariant(prepared.masterContent, platform, variants[platform] || {}),
    externalPostId: null,
    externalUrl: null,
    error: null,
    attempts: 0,
    publishAt: prepared.schedule?.publishAt || null,
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
  }));
  return transitionCampaign(prepared, "ready", { now, summary: `Prepared ${prepared.jobs.length} platform-native publish job(s)` });
}

export function transitionJob(job, next, { now = Date.now, patch = {} } = {}) {
  assertState(job.status, JOB_STATES, "job state");
  assertState(next, JOB_STATES, "job state");
  assertTransition(job.status, next, JOB_TRANSITIONS, "publish job");
  return { ...clone(job), ...clone(patch), status: next, updatedAt: nowIso(now) };
}

export function campaignCompletionState(campaign) {
  const jobs = campaign.jobs || [];
  if (!jobs.length) return campaign.status;
  const live = jobs.filter(job => job.status === "live").length;
  const failed = jobs.filter(job => job.status === "failed").length;
  const terminal = jobs.filter(job => ["live", "failed", "cancelled"].includes(job.status)).length;
  if (live === jobs.length) return "completed";
  if (terminal === jobs.length && live === 0 && failed > 0) return "failed";
  if (failed > 0 && live > 0) return "partially_failed";
  return campaign.status;
}

export function buildPublishReceipt(campaign, { now = Date.now } = {}) {
  const jobs = (campaign.jobs || []).map(job => ({
    jobId: job.id,
    platform: job.platform,
    status: job.status,
    externalPostId: job.externalPostId || null,
    externalUrl: job.externalUrl || null,
    attempts: job.attempts || 0,
    error: job.error || null,
  }));
  return {
    schemaVersion: 1,
    receiptType: "social-publishing",
    campaignId: campaign.id,
    projectId: campaign.projectId,
    missionId: campaign.missionId,
    runId: campaign.runId,
    campaignStatus: campaignCompletionState(campaign),
    createdAt: nowIso(now),
    jobs,
    evidence: jobs.map(job => ({
      type: "external-publication",
      platform: job.platform,
      status: job.status,
      externalPostId: job.externalPostId,
      externalUrl: job.externalUrl,
    })),
  };
}
