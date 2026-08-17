import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createCampaign,
  transitionCampaign,
  createPlatformVariant,
  createPublicationJob,
  transitionPublicationJob,
  createPublicationReceipt,
  createAnalyticsSnapshot,
  createConnectorProfile,
  createPublishingStore,
  computeIdempotencyKey,
} from '../lib/publishing-domain.mjs';

test('Campaign domain enforces target platform validation and strict lifecycle transitions', () => {
  assert.throws(() => createCampaign({ objective: '' }), /objective is required/);
  assert.throws(() => createCampaign({ objective: 'Launch' }), /projectId is required/);
  assert.throws(() => createCampaign({ objective: 'Launch', projectId: 'p-1', targetPlatforms: ['myspace'] }), /valid target platform is required/);

  let campaign = createCampaign({
    projectId: 'p-1',
    objective: 'Launch Rempeyek v2.5',
    targetPlatforms: ['Twitter', 'LinkedIn'],
    offer: 'Free 14-day trial',
    CTA: 'Sign up today',
  });

  assert.equal(campaign.status, 'DRAFT');
  assert.deepEqual(campaign.targetPlatforms, ['twitter', 'linkedin']);

  campaign = transitionCampaign(campaign, 'GENERATED');
  campaign = transitionCampaign(campaign, 'ADAPTED');
  campaign = transitionCampaign(campaign, 'PREFLIGHT');
  campaign = transitionCampaign(campaign, 'APPROVAL_REQUIRED');
  campaign = transitionCampaign(campaign, 'APPROVED');
  campaign = transitionCampaign(campaign, 'QUEUED');
  campaign = transitionCampaign(campaign, 'PUBLISHING');
  campaign = transitionCampaign(campaign, 'LIVE');
  assert.equal(campaign.status, 'LIVE');

  assert.throws(() => transitionCampaign(campaign, 'DRAFT'), /Illegal campaign state transition/);
});

test('PlatformVariant encapsulates platform-specific copy, media, ratio, and metadata', () => {
  assert.throws(() => createPlatformVariant({ platform: 'twitter' }), /campaignId is required/);
  assert.throws(() => createPlatformVariant({ campaignId: 'c-1', platform: 'telegram' }), /Unsupported platform/);

  const variant = createPlatformVariant({
    campaignId: 'c-1',
    platform: 'twitter',
    copy: 'Announcing Rempeyek 2.5! Real agent continuity is here.',
    ratio: '16:9',
    metadata: { hashtags: ['#Rempeyek', '#AI'] },
  });

  assert.equal(variant.platform, 'twitter');
  assert.equal(variant.ratio, '16:9');
  assert.equal(variant.validationState, 'VALID');
  assert.equal(variant.approvalState, 'PENDING');
  assert.deepEqual(variant.metadata.hashtags, ['#Rempeyek', '#AI']);
});

test('PublicationJob computes stable deterministic idempotency keys and enforces state machine', () => {
  const job = createPublicationJob({
    campaignId: 'c-1',
    variantId: 'v-1',
    platform: 'twitter',
    accountRef: 'twitter-main',
    attempt: 0,
  });

  assert.equal(job.status, 'QUEUED');
  assert.equal(job.attempt, 0);

  const key1 = computeIdempotencyKey({ jobId: job.jobId, variantId: 'v-1', platform: 'twitter', accountRef: 'twitter-main', attempt: 0 });
  assert.equal(job.idempotencyKey, key1);

  let transitioned = transitionPublicationJob(job, 'PUBLISHING', { attemptIncrement: true });
  assert.equal(transitioned.status, 'PUBLISHING');
  assert.equal(transitioned.attempt, 1);

  transitioned = transitionPublicationJob(transitioned, 'RETRYABLE_FAILED', { reason: 'Rate limit 429' });
  assert.equal(transitioned.status, 'RETRYABLE_FAILED');
  assert.equal(transitioned.failureReason, 'Rate limit 429');

  transitioned = transitionPublicationJob(transitioned, 'QUEUED');
  transitioned = transitionPublicationJob(transitioned, 'PUBLISHING', { attemptIncrement: true });
  assert.equal(transitioned.attempt, 2);

  transitioned = transitionPublicationJob(transitioned, 'LIVE', { externalId: 'ext-12345' });
  assert.equal(transitioned.status, 'LIVE');
  assert.equal(transitioned.providerRef, 'ext-12345');
});

test('PublicationReceipt and AnalyticsSnapshot preserve truthful provider evidence', () => {
  const receipt = createPublicationReceipt({
    jobId: 'job-1',
    platform: 'linkedin',
    provider: 'linkedin-api',
    externalPostId: 'urn:li:share:987654321',
    externalUrl: 'https://linkedin.com/feed/update/urn:li:share:987654321',
    rawStatusClass: 'PUBLISHED',
  });

  assert.equal(receipt.platform, 'linkedin');
  assert.equal(receipt.externalPostId, 'urn:li:share:987654321');
  assert.ok(receipt.publishedAt);

  const analytics = createAnalyticsSnapshot({
    receiptId: receipt.receiptId,
    metrics: { impressions: 1500, clicks: 87, engagements: 120 },
    provider: 'linkedin-analytics-v2',
  });

  assert.equal(analytics.metrics.impressions, 1500);
  assert.equal(analytics.metrics.clicks, 87);
  assert.equal(analytics.provider, 'linkedin-analytics-v2');
});

test('ConnectorProfile safeguards credentials with indirect handles', () => {
  const connector = createConnectorProfile({
    platform: 'twitter',
    accountName: 'official_rempeyek',
    status: 'CONNECTED',
    credentialRef: '$SECRET_TWITTER_OAUTH_TOKEN',
  });

  assert.equal(connector.platform, 'twitter');
  assert.equal(connector.status, 'CONNECTED');
  assert.equal(connector.credentialRef, '$SECRET_TWITTER_OAUTH_TOKEN');
  assert.ok(!JSON.stringify(connector).includes('bearer'));
});

test('PublishingStore provides atomic persistence for social entities', () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-social-store-'));
  try {
    const store = createPublishingStore({ vaultRoot: tmpVault });

    const campaign = store.saveCampaign(createCampaign({ projectId: 'p-1', objective: 'Grow community', targetPlatforms: ['twitter'] }));
    const variant = store.savePlatformVariant(createPlatformVariant({ campaignId: campaign.campaignId, platform: 'twitter', copy: 'Join our community!' }));
    const job = store.savePublicationJob(createPublicationJob({ campaignId: campaign.campaignId, variantId: variant.variantId, platform: 'twitter' }));
    const receipt = store.savePublicationReceipt(createPublicationReceipt({ jobId: job.jobId, platform: 'twitter', externalPostId: 'tweet-999' }));

    assert.equal(store.getCampaign(campaign.campaignId).objective, 'Grow community');
    assert.equal(store.getPlatformVariant(variant.variantId).platform, 'twitter');
    assert.equal(store.getPublicationJob(job.jobId).platform, 'twitter');
    assert.equal(store.getReceiptForJob(job.jobId).externalPostId, 'tweet-999');

    // Verify directory persistence
    assert.ok(fs.existsSync(path.join(tmpVault, 'Social', 'Campaigns', `${campaign.campaignId}.json`)));
    assert.ok(fs.existsSync(path.join(tmpVault, 'Social', 'Jobs', `${job.jobId}.json`)));
    assert.ok(fs.existsSync(path.join(tmpVault, 'Social', 'Receipts', `${receipt.receiptId}.json`)));
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});
