import {
  createPlatformVariant,
  createPublicationReceipt,
  createAnalyticsSnapshot,
  SUPPORTED_PLATFORMS,
} from './publishing-domain.mjs';

export const PLATFORM_LIMITS = Object.freeze({
  twitter: { maxChars: 280, maxHashtags: 5, allowedRatios: ['16:9', '1:1', '4:5'], titleRequired: false },
  linkedin: { maxChars: 3000, maxHashtags: 10, allowedRatios: ['1:1', '16:9', '4:5'], titleRequired: false },
  youtube: { maxChars: 5000, maxTitleChars: 100, maxHashtags: 15, allowedRatios: ['16:9', '9:16'], titleRequired: true },
  tiktok: { maxChars: 2200, maxHashtags: 15, allowedRatios: ['9:16'], titleRequired: false },
  facebook: { maxChars: 5000, maxHashtags: 10, allowedRatios: ['1:1', '16:9', '4:5'], titleRequired: false },
  instagram: { maxChars: 2200, maxHashtags: 30, allowedRatios: ['1:1', '4:5', '9:16'], titleRequired: false },
});

export function adaptToPlatform({ campaign, platform, format = 'post' }) {
  if (!campaign) throw new Error('campaign is required');
  const targetPlatform = String(platform || '').toLowerCase().trim();
  if (!SUPPORTED_PLATFORMS.includes(targetPlatform)) {
    throw new Error(`Unsupported target platform: ${targetPlatform}`);
  }

  const baseObjective = campaign.objective || '';
  const baseOffer = campaign.offer ? `\n\nOffer: ${campaign.offer}` : '';
  const baseCTA = campaign.CTA || 'Learn more';
  const rawCopy = `${baseObjective}${baseOffer}`;

  let copy = '';
  let title = null;
  let description = null;
  let ratio = '1:1';
  const hashtags = [];

  switch (targetPlatform) {
    case 'twitter': {
      // Twitter needs punchy concise copy
      ratio = format === 'video' ? '16:9' : '1:1';
      const shortObjective = baseObjective.slice(0, 180);
      copy = `${shortObjective}\n\n👉 ${baseCTA}`;
      hashtags.push('#Rempeyek', '#AI');
      break;
    }
    case 'linkedin': {
      // LinkedIn professional thought leadership format
      ratio = '1:1';
      title = `${baseObjective.slice(0, 60)} | Strategy & Execution`;
      copy = `💡 **Key Insight**\n\n${baseObjective}\n\n${campaign.offer ? `🔹 What you get: ${campaign.offer}\n\n` : ''}📌 Next Steps:\n${baseCTA}`;
      hashtags.push('#Innovation', '#BusinessContinuity', '#Leadership');
      break;
    }
    case 'youtube': {
      // YouTube video / Shorts
      const isShort = format === 'short' || format === 'shorts';
      ratio = isShort ? '9:16' : '16:9';
      title = `${baseObjective.slice(0, 75)} | Official Guide`;
      description = `In this video, we break down: ${baseObjective}\n\n${baseOffer}\n\nAction: ${baseCTA}\n\nSubscribe for more updates!`;
      copy = description;
      hashtags.push('#Tech', '#Tutorial', '#Automation');
      break;
    }
    case 'tiktok': {
      // TikTok vertical hook
      ratio = '9:16';
      copy = `🔥 Watch this: ${baseObjective.slice(0, 140)}\n\nDrop a comment if you agree! 👇 ${baseCTA}`;
      hashtags.push('#TechTok', '#FYP', '#Automation');
      break;
    }
    case 'meta':
    case 'facebook':
    case 'instagram': {
      // Instagram / Facebook visual-first post
      ratio = targetPlatform === 'instagram' ? '4:5' : '1:1';
      copy = `${baseObjective}\n\n${campaign.offer ? `✨ Offer: ${campaign.offer}\n\n` : ''}🔗 Link in bio: ${baseCTA}`;
      hashtags.push('#Productivity', '#Workflow', '#AIAgents');
      break;
    }
  }

  const variant = createPlatformVariant({
    campaignId: campaign.campaignId,
    platform: targetPlatform,
    format,
    copy,
    title,
    description,
    ratio,
    metadata: {
      hashtags,
      mentions: [],
      customCTA: baseCTA,
    },
  });

  return validatePlatformVariant(variant);
}

export function validatePlatformVariant(variant) {
  if (!variant || !variant.platform) {
    return { ...variant, validationState: 'INVALID', errors: ['Invalid variant structure'] };
  }

  const platform = variant.platform;
  const limits = PLATFORM_LIMITS[platform] || { maxChars: 2000, allowedRatios: ['1:1'] };
  const errors = [];

  const copy = String(variant.copy || '').trim();
  if (!copy) {
    errors.push(`Variant for ${platform} cannot have empty copy`);
  }

  if (copy.length > limits.maxChars) {
    errors.push(`Character count (${copy.length}) exceeds ${platform} limit (${limits.maxChars})`);
  }

  if (limits.titleRequired && (!variant.title || !String(variant.title).trim())) {
    errors.push(`Title is required for ${platform}`);
  }

  if (limits.maxTitleChars && variant.title && variant.title.length > limits.maxTitleChars) {
    errors.push(`Title length (${variant.title.length}) exceeds ${platform} limit (${limits.maxTitleChars})`);
  }

  if (limits.allowedRatios && variant.ratio && !limits.allowedRatios.includes(variant.ratio)) {
    errors.push(`Ratio '${variant.ratio}' is not allowed on ${platform} (supported: ${limits.allowedRatios.join(', ')})`);
  }

  const valid = errors.length === 0;
  return {
    ...variant,
    validationState: valid ? 'VALID' : 'INVALID',
    errors,
  };
}

export function createSandboxPublishingProvider({
  latencyMs = 0,
  shouldFail = false,
  failurePlatform = null,
  failureType = 'RETRYABLE',
  publishedPosts = new Map(),
} = {}) {
  return {
    name: 'sandbox-publishing-provider',
    latencyMs,
    shouldFail,
    failurePlatform,
    failureType,
    publishedPosts,

    async publish(job, variant, { connectorConfig = {} } = {}) {
      if (this.latencyMs > 0) {
        await new Promise(r => setTimeout(r, this.latencyMs));
      }

      const platform = job.platform;
      const isFailedTarget = this.shouldFail || (this.failurePlatform && this.failurePlatform === platform);
      if (isFailedTarget) {
        const err = new Error(`Sandbox simulated ${this.failureType} error on ${platform}`);
        err.failureType = this.failureType;
        err.retryable = this.failureType === 'RETRYABLE';
        err.platform = platform;
        throw err;
      }

      const externalPostId = `ext-${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const externalUrl = `https://sandbox.rempeyek.local/${platform}/posts/${externalPostId}`;

      const receipt = createPublicationReceipt({
        jobId: job.jobId,
        platform,
        provider: 'sandbox-provider',
        externalPostId,
        externalUrl,
        rawStatusClass: 'PUBLISHED',
        evidenceRefs: [`evd-${job.jobId}`],
      });

      this.publishedPosts.set(externalPostId, {
        job,
        variant,
        receipt,
        publishedAt: receipt.publishedAt,
        status: 'LIVE',
      });

      return receipt;
    },

    async checkStatus(externalPostId) {
      if (this.latencyMs > 0) await new Promise(r => setTimeout(r, this.latencyMs));
      const record = this.publishedPosts.get(externalPostId);
      if (!record) return { status: 'UNKNOWN', verified: false };
      return {
        status: record.status,
        verified: record.status === 'LIVE',
        externalPostId,
      };
    },

    async delete(externalPostId) {
      if (this.latencyMs > 0) await new Promise(r => setTimeout(r, this.latencyMs));
      const exists = this.publishedPosts.has(externalPostId);
      if (exists) {
        this.publishedPosts.delete(externalPostId);
        return { ok: true, externalPostId, deleted: true };
      }
      return { ok: false, externalPostId, error: 'Post not found' };
    },

    async fetchAnalytics(externalPostId) {
      if (this.latencyMs > 0) await new Promise(r => setTimeout(r, this.latencyMs));
      const record = this.publishedPosts.get(externalPostId);
      if (!record) throw new Error(`Post ${externalPostId} not found`);

      return {
        externalPostId,
        metrics: {
          impressions: 1240,
          engagements: 89,
          clicks: 34,
          shares: 12,
          likes: 45,
        },
        provider: 'sandbox-provider',
        capturedAt: new Date().toISOString(),
      };
    },
  };
}

export function createPublishingGateway({
  provider = createSandboxPublishingProvider(),
  store = null,
} = {}) {
  if (!provider) throw new Error('provider is required for PublishingGateway');

  return {
    providerName: provider.name || 'generic-provider',

    generateVariants(campaign) {
      if (!campaign) throw new Error('campaign is required');
      const platforms = campaign.targetPlatforms || ['twitter', 'linkedin'];
      const variants = platforms.map(platform => adaptToPlatform({ campaign, platform }));
      if (store) {
        for (const v of variants) store.savePlatformVariant(v);
      }
      return variants;
    },

    preflightCheck(variant) {
      return validatePlatformVariant(variant);
    },

    async executePublication(job, variant, { connectorConfig = {}, approvalId = null } = {}) {
      if (!job) throw new Error('job is required');
      if (!variant) throw new Error('variant is required');

      // Preflight verification before publish
      const validation = validatePlatformVariant(variant);
      if (validation.validationState !== 'VALID') {
        const error = new Error(`Preflight check failed: ${validation.errors.join(', ')}`);
        error.validationErrors = validation.errors;
        throw error;
      }

      const receipt = await provider.publish(job, variant, { connectorConfig });
      if (store) {
        store.savePublicationReceipt(receipt);
      }
      return receipt;
    },

    async verifyPublication(externalPostId) {
      return await provider.checkStatus(externalPostId);
    },

    async fetchAnalytics(receipt) {
      if (!receipt || !receipt.externalPostId) throw new Error('receipt with externalPostId is required');
      const data = await provider.fetchAnalytics(receipt.externalPostId);
      const snapshot = createAnalyticsSnapshot({
        receiptId: receipt.receiptId,
        metrics: data.metrics,
        provider: provider.name,
      });
      if (store) {
        store.saveAnalyticsSnapshot(snapshot);
      }
      return snapshot;
    },
  };
}
