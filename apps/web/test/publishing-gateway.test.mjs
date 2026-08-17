import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptToPlatform,
  validatePlatformVariant,
  createSandboxPublishingProvider,
  createPublishingGateway,
  PLATFORM_LIMITS,
} from '../lib/publishing-gateway.mjs';
import {
  createCampaign,
  createPlatformVariant,
  createPublicationJob,
  createPublishingStore,
} from '../lib/publishing-domain.mjs';

test('Platform adapters tailor campaign content to native platform constraints', () => {
  const campaign = createCampaign({
    projectId: 'p-1',
    objective: 'Autonomous AI workflow orchestrator for cross-agent collaboration',
    offer: 'Get lifetime license for $49',
    CTA: 'Join early access now',
    targetPlatforms: ['twitter', 'linkedin', 'youtube', 'tiktok'],
  });

  // Twitter adaptation
  const twitterVariant = adaptToPlatform({ campaign, platform: 'twitter' });
  assert.equal(twitterVariant.platform, 'twitter');
  assert.equal(twitterVariant.validationState, 'VALID');
  assert.ok(twitterVariant.copy.length <= PLATFORM_LIMITS.twitter.maxChars);
  assert.ok(twitterVariant.copy.includes('Join early access now'));

  // LinkedIn adaptation
  const linkedinVariant = adaptToPlatform({ campaign, platform: 'linkedin' });
  assert.equal(linkedinVariant.platform, 'linkedin');
  assert.equal(linkedinVariant.validationState, 'VALID');
  assert.ok(linkedinVariant.title);
  assert.ok(linkedinVariant.copy.includes('Key Insight'));

  // YouTube adaptation
  const youtubeVariant = adaptToPlatform({ campaign, platform: 'youtube', format: 'video' });
  assert.equal(youtubeVariant.platform, 'youtube');
  assert.equal(youtubeVariant.validationState, 'VALID');
  assert.equal(youtubeVariant.ratio, '16:9');
  assert.ok(youtubeVariant.title);

  // TikTok adaptation
  const tiktokVariant = adaptToPlatform({ campaign, platform: 'tiktok' });
  assert.equal(tiktokVariant.platform, 'tiktok');
  assert.equal(tiktokVariant.validationState, 'VALID');
  assert.equal(tiktokVariant.ratio, '9:16');
});

test('Preflight validator flags character overflows, missing titles, and invalid aspect ratios', () => {
  // Empty copy
  const emptyVariant = createPlatformVariant({ campaignId: 'c-1', platform: 'twitter', copy: '' });
  const emptyCheck = validatePlatformVariant(emptyVariant);
  assert.equal(emptyCheck.validationState, 'INVALID');
  assert.ok(emptyCheck.errors.some(e => e.includes('cannot have empty copy')));

  // Twitter char limit overflow
  const longCopy = 'A'.repeat(300);
  const longVariant = createPlatformVariant({ campaignId: 'c-1', platform: 'twitter', copy: longCopy });
  const longCheck = validatePlatformVariant(longVariant);
  assert.equal(longCheck.validationState, 'INVALID');
  assert.ok(longCheck.errors.some(e => e.includes('exceeds twitter limit')));

  // YouTube missing title
  const noTitleYoutube = createPlatformVariant({ campaignId: 'c-1', platform: 'youtube', copy: 'Video description', title: null });
  const youtubeCheck = validatePlatformVariant(noTitleYoutube);
  assert.equal(youtubeCheck.validationState, 'INVALID');
  assert.ok(youtubeCheck.errors.some(e => e.includes('Title is required')));

  // TikTok invalid ratio
  const wideTikTok = createPlatformVariant({ campaignId: 'c-1', platform: 'tiktok', copy: 'Watch this', ratio: '16:9' });
  const tiktokCheck = validatePlatformVariant(wideTikTok);
  assert.equal(tiktokCheck.validationState, 'INVALID');
  assert.ok(tiktokCheck.errors.some(e => e.includes('Ratio \'16:9\' is not allowed on tiktok')));
});

test('Sandbox publishing provider simulates live publishing, verification, and analytics', async () => {
  const provider = createSandboxPublishingProvider();
  const job = createPublicationJob({ campaignId: 'c-1', variantId: 'v-1', platform: 'linkedin' });
  const variant = createPlatformVariant({ campaignId: 'c-1', platform: 'linkedin', copy: 'Great update!' });

  const receipt = await provider.publish(job, variant);
  assert.equal(receipt.platform, 'linkedin');
  assert.equal(receipt.rawStatusClass, 'PUBLISHED');
  assert.ok(receipt.externalPostId.startsWith('ext-linkedin-'));
  assert.ok(receipt.externalUrl.includes('sandbox.rempeyek.local'));

  // Verification status
  const verification = await provider.checkStatus(receipt.externalPostId);
  assert.equal(verification.verified, true);
  assert.equal(verification.status, 'LIVE');

  // Analytics
  const analytics = await provider.fetchAnalytics(receipt.externalPostId);
  assert.equal(analytics.metrics.impressions, 1240);
  assert.equal(analytics.metrics.engagements, 89);
});

test('PublishingGateway integrates variant generation, preflight checks, execution, and analytics capture', async () => {
  const store = createPublishingStore();
  const gateway = createPublishingGateway({ store });

  const campaign = createCampaign({
    projectId: 'p-1',
    objective: 'Announce v2.5 release with work continuity',
    targetPlatforms: ['twitter', 'linkedin'],
  });

  const variants = gateway.generateVariants(campaign);
  assert.equal(variants.length, 2);
  assert.equal(variants[0].validationState, 'VALID');
  assert.equal(variants[1].validationState, 'VALID');

  const twitterJob = createPublicationJob({
    campaignId: campaign.campaignId,
    variantId: variants[0].variantId,
    platform: 'twitter',
  });

  const receipt = await gateway.executePublication(twitterJob, variants[0]);
  assert.ok(receipt.receiptId);
  assert.equal(store.getPublicationReceipt(receipt.receiptId).externalPostId, receipt.externalPostId);

  const analytics = await gateway.fetchAnalytics(receipt);
  assert.equal(analytics.receiptId, receipt.receiptId);
  assert.ok(analytics.metrics.impressions > 0);
});
