import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SUPPORTED_PLATFORMS = Object.freeze([
  'twitter',
  'linkedin',
  'youtube',
  'tiktok',
  'facebook',
  'instagram',
]);

export const CAMPAIGN_STATUSES = Object.freeze([
  'DRAFT',
  'GENERATED',
  'ADAPTED',
  'PREFLIGHT',
  'APPROVAL_REQUIRED',
  'APPROVED',
  'QUEUED',
  'PUBLISHING',
  'PARTIAL_SUCCESS',
  'LIVE',
  'FAILED',
  'CANCELLED',
]);

export const CAMPAIGN_TRANSITIONS = Object.freeze({
  DRAFT: new Set(['GENERATED', 'ADAPTED', 'APPROVED', 'QUEUED', 'CANCELLED']),
  GENERATED: new Set(['ADAPTED', 'APPROVED', 'QUEUED', 'CANCELLED']),
  ADAPTED: new Set(['PREFLIGHT', 'APPROVAL_REQUIRED', 'APPROVED', 'QUEUED', 'CANCELLED']),
  PREFLIGHT: new Set(['APPROVAL_REQUIRED', 'APPROVED', 'QUEUED', 'FAILED']),
  APPROVAL_REQUIRED: new Set(['APPROVED', 'QUEUED', 'FAILED', 'CANCELLED']),
  APPROVED: new Set(['QUEUED', 'CANCELLED']),
  QUEUED: new Set(['PUBLISHING', 'PARTIAL_SUCCESS', 'LIVE', 'FAILED']),
  PUBLISHING: new Set(['LIVE', 'PARTIAL_SUCCESS', 'FAILED', 'QUEUED']),
  PARTIAL_SUCCESS: new Set(['QUEUED', 'PUBLISHING', 'LIVE', 'FAILED', 'PARTIAL_SUCCESS']),
  LIVE: new Set([]),
  FAILED: new Set(['DRAFT', 'PREFLIGHT', 'APPROVED', 'QUEUED', 'PARTIAL_SUCCESS', 'LIVE']),
  CANCELLED: new Set([]),
});

export const JOB_STATUSES = Object.freeze([
  'QUEUED',
  'PUBLISHING',
  'LIVE',
  'RETRYABLE_FAILED',
  'PERMANENT_FAILED',
  'CANCELLED',
  'BLOCKED',
]);

export const JOB_TRANSITIONS = Object.freeze({
  QUEUED: new Set(['PUBLISHING', 'CANCELLED', 'BLOCKED']),
  PUBLISHING: new Set(['LIVE', 'RETRYABLE_FAILED', 'PERMANENT_FAILED', 'BLOCKED']),
  RETRYABLE_FAILED: new Set(['QUEUED', 'PERMANENT_FAILED', 'CANCELLED']),
  PERMANENT_FAILED: new Set(['QUEUED']),
  BLOCKED: new Set(['QUEUED', 'PERMANENT_FAILED', 'CANCELLED']),
  LIVE: new Set([]),
  CANCELLED: new Set([]),
});

function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export function computeIdempotencyKey({ jobId, variantId, platform, accountRef, attempt = 0 }) {
  const payload = `${jobId}:${variantId}:${platform}:${accountRef}:${attempt}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function createCampaign(input = {}) {
  const objective = String(input.objective || '').trim();
  const projectId = String(input.projectId || '').trim();
  if (!objective) throw new Error('objective is required for Campaign');
  if (!projectId) throw new Error('projectId is required for Campaign');

  const platforms = Array.isArray(input.targetPlatforms)
    ? [...new Set(input.targetPlatforms.map(p => String(p).toLowerCase().trim()).filter(p => SUPPORTED_PLATFORMS.includes(p)))]
    : ['twitter', 'linkedin'];

  if (platforms.length === 0) {
    throw new Error('At least one valid target platform is required');
  }

  const now = new Date().toISOString();
  return {
    campaignId: String(input.campaignId || generateId('cmp')).trim(),
    projectId,
    missionId: input.missionId ? String(input.missionId).trim() : null,
    objective,
    audience: String(input.audience || 'General audience').trim(),
    offer: String(input.offer || '').trim(),
    CTA: String(input.CTA || 'Learn more').trim(),
    brandContextRef: input.brandContextRef ? String(input.brandContextRef) : null,
    sourceAssetRefs: Array.isArray(input.sourceAssetRefs) ? input.sourceAssetRefs.map(String) : [],
    targetPlatforms: platforms,
    status: CAMPAIGN_STATUSES.includes(input.status) ? input.status : 'DRAFT',
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function transitionCampaign(campaign, nextStatus, { reason = '' } = {}) {
  if (!campaign || !campaign.status) throw new Error('Invalid campaign');
  if (!CAMPAIGN_STATUSES.includes(nextStatus)) {
    throw new Error(`Invalid target campaign status: ${nextStatus}`);
  }
  if (campaign.status === nextStatus) {
    return {
      ...campaign,
      updatedAt: new Date().toISOString(),
      lastTransitionReason: reason || campaign.lastTransitionReason,
    };
  }
  const allowed = CAMPAIGN_TRANSITIONS[campaign.status];
  if (!allowed || !allowed.has(nextStatus)) {
    throw new Error(`Illegal campaign state transition: ${campaign.status} -> ${nextStatus}`);
  }
  const now = new Date().toISOString();
  return {
    ...campaign,
    status: nextStatus,
    updatedAt: now,
    lastTransitionReason: reason || null,
  };
}

export function createPlatformVariant(input = {}) {
  const campaignId = String(input.campaignId || '').trim();
  const platform = String(input.platform || '').toLowerCase().trim();
  if (!campaignId) throw new Error('campaignId is required for PlatformVariant');
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const format = String(input.format || 'post').toLowerCase().trim();
  const copy = String(input.copy || '').trim();
  const title = input.title ? String(input.title).trim() : null;
  const description = input.description ? String(input.description).trim() : null;

  return {
    variantId: String(input.variantId || generateId(`var-${platform}`)).trim(),
    campaignId,
    platform,
    format,
    copy,
    title,
    description,
    mediaRefs: Array.isArray(input.mediaRefs) ? input.mediaRefs.map(String) : [],
    ratio: input.ratio ? String(input.ratio) : '1:1',
    metadata: {
      hashtags: Array.isArray(input.metadata?.hashtags) ? input.metadata.hashtags.map(String) : [],
      mentions: Array.isArray(input.metadata?.mentions) ? input.metadata.mentions.map(String) : [],
      thumbnailRef: input.metadata?.thumbnailRef ? String(input.metadata.thumbnailRef) : null,
      customCTA: input.metadata?.customCTA ? String(input.metadata.customCTA) : null,
      ...input.metadata,
    },
    validationState: ['VALID', 'INVALID'].includes(input.validationState) ? input.validationState : (copy ? 'VALID' : 'INVALID'),
    approvalState: ['PENDING', 'APPROVED', 'REJECTED'].includes(input.approvalState) ? input.approvalState : 'PENDING',
    version: Number.isInteger(input.version) && input.version > 0 ? input.version : 1,
    errors: Array.isArray(input.errors) ? input.errors : [],
  };
}

export function createPublicationJob(input = {}) {
  const campaignId = String(input.campaignId || '').trim();
  const variantId = String(input.variantId || '').trim();
  const platform = String(input.platform || '').toLowerCase().trim();
  const accountRef = String(input.accountRef || `default-${platform}`).trim();

  if (!campaignId) throw new Error('campaignId is required for PublicationJob');
  if (!variantId) throw new Error('variantId is required for PublicationJob');
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const jobId = String(input.jobId || generateId(`job-${platform}`)).trim();
  const attempt = Number.isInteger(input.attempt) && input.attempt >= 0 ? input.attempt : 0;
  const idempotencyKey = input.idempotencyKey || computeIdempotencyKey({ jobId, variantId, platform, accountRef, attempt });
  const now = new Date().toISOString();

  return {
    jobId,
    projectId: String(input.projectId || 'default').trim(),
    missionId: input.missionId ? String(input.missionId).trim() : null,
    runId: input.runId ? String(input.runId).trim() : null,
    workUnitId: input.workUnitId ? String(input.workUnitId).trim() : null,
    campaignId,
    variantId,
    platform,
    accountRef,
    scheduledFor: input.scheduledFor || now,
    status: JOB_STATUSES.includes(input.status) ? input.status : 'QUEUED',
    attempt,
    maxAttempts: Number.isInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 3,
    idempotencyKey,
    approvalRef: input.approvalRef ? String(input.approvalRef) : null,
    providerRef: input.providerRef ? String(input.providerRef) : null,
    failureReason: input.failureReason || null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function transitionPublicationJob(job, nextStatus, { reason = '', externalId = null, attemptIncrement = false } = {}) {
  if (!job || !job.status) throw new Error('Invalid publication job');
  if (!JOB_STATUSES.includes(nextStatus)) {
    throw new Error(`Invalid target job status: ${nextStatus}`);
  }
  const allowed = JOB_TRANSITIONS[job.status];
  if (!allowed || !allowed.has(nextStatus)) {
    throw new Error(`Illegal publication job state transition: ${job.status} -> ${nextStatus}`);
  }
  const now = new Date().toISOString();
  const nextAttempt = attemptIncrement ? job.attempt + 1 : job.attempt;
  return {
    ...job,
    status: nextStatus,
    attempt: nextAttempt,
    failureReason: nextStatus.endsWith('_FAILED') ? String(reason || 'Publishing error') : job.failureReason,
    providerRef: externalId ? String(externalId) : job.providerRef,
    updatedAt: now,
  };
}

export function createPublicationReceipt(input = {}) {
  const jobId = String(input.jobId || '').trim();
  const platform = String(input.platform || '').toLowerCase().trim();
  const externalPostId = String(input.externalPostId || '').trim();
  if (!jobId) throw new Error('jobId is required for PublicationReceipt');
  if (!platform) throw new Error('platform is required for PublicationReceipt');
  if (!externalPostId) throw new Error('externalPostId is required for PublicationReceipt');

  const now = new Date().toISOString();
  return {
    receiptId: String(input.receiptId || generateId('rcp')).trim(),
    jobId,
    platform,
    provider: String(input.provider || 'sandbox-provider').trim(),
    externalPostId,
    externalUrl: input.externalUrl ? String(input.externalUrl).trim() : null,
    publishedAt: input.publishedAt || now,
    rawStatusClass: ['PUBLISHED', 'PENDING_VERIFICATION', 'PROCESSING', 'ERROR'].includes(input.rawStatusClass)
      ? input.rawStatusClass
      : 'PUBLISHED',
    verifiedAt: input.verifiedAt || now,
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String) : [],
    provenance: String(input.provenance || 'direct-provider-receipt').trim(),
    schemaVersion: 1,
  };
}

export function createAnalyticsSnapshot(input = {}) {
  const receiptId = String(input.receiptId || '').trim();
  if (!receiptId) throw new Error('receiptId is required for AnalyticsSnapshot');

  const now = new Date().toISOString();
  const metrics = typeof input.metrics === 'object' && input.metrics !== null ? input.metrics : {};

  // Metrics must be numbers or truthful strings from provider, never fabricated
  const sanitizedMetrics = {};
  for (const [k, v] of Object.entries(metrics)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      sanitizedMetrics[k] = v;
    } else if (typeof v === 'string') {
      sanitizedMetrics[k] = v;
    }
  }

  return {
    snapshotId: String(input.snapshotId || generateId('anl')).trim(),
    receiptId,
    capturedAt: input.capturedAt || now,
    metrics: sanitizedMetrics,
    provider: String(input.provider || 'direct-analytics').trim(),
    provenance: String(input.provenance || 'provider-metrics-api').trim(),
    schemaVersion: 1,
  };
}

export function createConnectorProfile(input = {}) {
  const platform = String(input.platform || '').toLowerCase().trim();
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported connector platform: ${platform}`);
  }

  const connectorId = String(input.connectorId || generateId(`con-${platform}`)).trim();
  return {
    connectorId,
    providerId: String(input.providerId || 'direct-api').trim(),
    platform,
    accountName: String(input.accountName || `${platform}-account`).trim(),
    status: ['CONNECTED', 'DISCONNECTED', 'REQUIRES_AUTH', 'UNCONFIGURED'].includes(input.status)
      ? input.status
      : 'UNCONFIGURED',
    capabilities: Array.isArray(input.capabilities)
      ? input.capabilities.map(String)
      : ['social.content.generate', 'social.publish.execute', 'social.analytics.read'],
    credentialRef: (() => {
      if (input.credentialRef) {
        const ref = String(input.credentialRef);
        if (!/^\$SECRET_[A-Z0-9_]+$/.test(ref)) {
          throw new Error('credentialRef must be a valid $SECRET_<HANDLE> reference');
        }
        return ref;
      }
      return `$SECRET_${connectorId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    })(),
    isManualSetupRequired: input.isManualSetupRequired !== undefined ? Boolean(input.isManualSetupRequired) : true,
    schemaVersion: 1,
  };
}

export function createPublishingStore({ vaultRoot, stateRoot } = {}) {
  const memory = {
    campaigns: new Map(),
    variants: new Map(),
    jobs: new Map(),
    receipts: new Map(),
    analytics: new Map(),
    connectors: new Map(),
  };

  const socialDir = vaultRoot ? path.join(vaultRoot, 'Social') : null;
  if (socialDir) {
    for (const sub of ['Campaigns', 'Variants', 'Jobs', 'Receipts', 'Analytics', 'Connectors']) {
      try { fs.mkdirSync(path.join(socialDir, sub), { recursive: true }); } catch {}
    }
  }

  return {
    saveCampaign(campaign) {
      memory.campaigns.set(campaign.campaignId, { ...campaign });
      if (socialDir) {
        const file = path.join(socialDir, 'Campaigns', `${campaign.campaignId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(campaign, null, 2), 'utf8'); } catch {}
      }
      return { ...campaign };
    },
    getCampaign(campaignId) {
      if (memory.campaigns.has(campaignId)) return { ...memory.campaigns.get(campaignId) };
      if (socialDir) {
        const file = path.join(socialDir, 'Campaigns', `${campaignId}.json`);
        try {
          if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            memory.campaigns.set(campaignId, parsed);
            return { ...parsed };
          }
        } catch {}
      }
      return null;
    },
    listCampaigns(projectId) {
      if (socialDir) {
        const dir = path.join(socialDir, 'Campaigns');
        try {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.json')) {
                const id = f.replace('.json', '');
                if (!memory.campaigns.has(id)) {
                  try {
                    const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                    memory.campaigns.set(parsed.campaignId || id, parsed);
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      const list = [...memory.campaigns.values()];
      if (projectId) return list.filter(c => c.projectId === projectId);
      return list;
    },
    savePlatformVariant(variant) {
      memory.variants.set(variant.variantId, { ...variant });
      if (socialDir) {
        const file = path.join(socialDir, 'Variants', `${variant.variantId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(variant, null, 2), 'utf8'); } catch {}
      }
      return { ...variant };
    },
    getPlatformVariant(variantId) {
      if (memory.variants.has(variantId)) return { ...memory.variants.get(variantId) };
      if (socialDir) {
        const file = path.join(socialDir, 'Variants', `${variantId}.json`);
        try {
          if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            memory.variants.set(variantId, parsed);
            return { ...parsed };
          }
        } catch {}
      }
      return null;
    },
    listVariantsForCampaign(campaignId) {
      if (socialDir) {
        const dir = path.join(socialDir, 'Variants');
        try {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.json')) {
                const id = f.replace('.json', '');
                if (!memory.variants.has(id)) {
                  try {
                    const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                    memory.variants.set(parsed.variantId || id, parsed);
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      return [...memory.variants.values()].filter(v => v.campaignId === campaignId);
    },
    savePublicationJob(job) {
      memory.jobs.set(job.jobId, { ...job });
      if (socialDir) {
        const file = path.join(socialDir, 'Jobs', `${job.jobId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(job, null, 2), 'utf8'); } catch {}
      }
      return { ...job };
    },
    getPublicationJob(jobId) {
      if (memory.jobs.has(jobId)) return { ...memory.jobs.get(jobId) };
      if (socialDir) {
        const file = path.join(socialDir, 'Jobs', `${jobId}.json`);
        try {
          if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            memory.jobs.set(jobId, parsed);
            return { ...parsed };
          }
        } catch {}
      }
      return null;
    },
    listJobsForCampaign(campaignId) {
      if (socialDir) {
        const dir = path.join(socialDir, 'Jobs');
        try {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.json')) {
                const id = f.replace('.json', '');
                if (!memory.jobs.has(id)) {
                  try {
                    const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                    memory.jobs.set(parsed.jobId || id, parsed);
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      return [...memory.jobs.values()].filter(j => j.campaignId === campaignId);
    },
    savePublicationReceipt(receipt) {
      memory.receipts.set(receipt.receiptId, { ...receipt });
      if (socialDir) {
        const file = path.join(socialDir, 'Receipts', `${receipt.receiptId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(receipt, null, 2), 'utf8'); } catch {}
      }
      return { ...receipt };
    },
    getPublicationReceipt(receiptId) {
      if (memory.receipts.has(receiptId)) return { ...memory.receipts.get(receiptId) };
      if (socialDir) {
        const file = path.join(socialDir, 'Receipts', `${receiptId}.json`);
        try {
          if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            memory.receipts.set(receiptId, parsed);
            return { ...parsed };
          }
        } catch {}
      }
      return null;
    },
    getReceiptForJob(jobId) {
      if (socialDir) {
        const dir = path.join(socialDir, 'Receipts');
        try {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.json')) {
                const id = f.replace('.json', '');
                if (!memory.receipts.has(id)) {
                  try {
                    const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                    memory.receipts.set(parsed.receiptId || id, parsed);
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      return [...memory.receipts.values()].find(r => r.jobId === jobId) || null;
    },
    saveAnalyticsSnapshot(snapshot) {
      memory.analytics.set(snapshot.snapshotId, { ...snapshot });
      if (socialDir) {
        const file = path.join(socialDir, 'Analytics', `${snapshot.snapshotId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf8'); } catch {}
      }
      return { ...snapshot };
    },
    getLatestAnalytics(receiptId) {
      const list = [...memory.analytics.values()].filter(a => a.receiptId === receiptId);
      return list.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0] || null;
    },
    saveConnectorProfile(connector) {
      memory.connectors.set(connector.connectorId, { ...connector });
      if (socialDir) {
        const file = path.join(socialDir, 'Connectors', `${connector.connectorId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(connector, null, 2), 'utf8'); } catch {}
      }
      return { ...connector };
    },
    getConnector(connectorId) {
      return memory.connectors.get(connectorId) ? { ...memory.connectors.get(connectorId) } : null;
    },
    listConnectors() {
      if (socialDir) {
        const dir = path.join(socialDir, 'Connectors');
        try {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.json')) {
                const id = f.replace('.json', '');
                if (!memory.connectors.has(id)) {
                  try {
                    const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                    memory.connectors.set(parsed.connectorId || id, parsed);
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      return [...memory.connectors.values()];
    },
  };
}
