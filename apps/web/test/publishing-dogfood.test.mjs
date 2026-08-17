import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createCampaign,
  createPublishingStore,
} from '../lib/publishing-domain.mjs';
import {
  createSandboxPublishingProvider,
  createPublishingGateway,
} from '../lib/publishing-gateway.mjs';
import {
  createPublishingScheduler,
} from '../lib/publishing-scheduler.mjs';
import {
  buildPublishingContext,
  recordPublishingOutcome,
} from '../lib/publishing-context.mjs';
import { buildTodayProjection } from '../lib/today-projection.mjs';

test('Dogfood 2: End-to-End Multi-Platform Campaign Publishing with Simulated Destination Failure, Safe Retry, and Memory Output', async () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-dogfood-social-'));
  try {
    const store = createPublishingStore({ vaultRoot: tmpVault });

    // Step 1: Create Campaign
    const campaign = store.saveCampaign(createCampaign({
      projectId: 'apollo',
      objective: 'Launch Rempeyek Agent OS 2.5: Real Work Continuity for Autonomous Agents',
      offer: 'Download open source release today',
      CTA: 'Read the docs at docs.rempeyek.local',
      targetPlatforms: ['twitter', 'linkedin', 'youtube', 'tiktok'],
    }));

    // Step 2 & 3: Platform Adaptation & Preflight Validation
    // Initialize provider with failure injected ONLY on LinkedIn
    const provider = createSandboxPublishingProvider({
      failurePlatform: 'linkedin',
      failureType: 'RETRYABLE',
    });
    const gateway = createPublishingGateway({ provider, store });
    const scheduler = createPublishingScheduler({ gateway, store });

    // Step 4: Schedule Campaign
    const { campaign: scheduledCampaign, jobs } = await scheduler.scheduleCampaign(campaign);
    assert.equal(scheduledCampaign.status, 'QUEUED');
    assert.equal(jobs.length, 4);

    // Verify bounded worker context
    const twitterJob = jobs.find(j => j.platform === 'twitter');
    const twitterVariant = store.getPlatformVariant(twitterJob.variantId);
    const workerContext = buildPublishingContext({
      campaign: scheduledCampaign,
      variant: twitterVariant,
      activeJob: twitterJob,
    });
    assert.equal(workerContext.campaign.targetPlatforms.length, 4);
    assert.equal(workerContext.variant.platform, 'twitter');
    assert.ok(!JSON.stringify(workerContext).includes('token'));

    // Step 5 & 6: Execute Publishing -> Partial Success (Twitter, YouTube, TikTok succeed; LinkedIn fails)
    const firstPass = await scheduler.processCampaign(campaign.campaignId);
    assert.equal(firstPass.campaign.status, 'PARTIAL_SUCCESS');

    const liveJobsPass1 = store.listJobsForCampaign(campaign.campaignId).filter(j => j.status === 'LIVE');
    const failedJobsPass1 = store.listJobsForCampaign(campaign.campaignId).filter(j => j.status === 'RETRYABLE_FAILED');

    assert.equal(liveJobsPass1.length, 3);
    assert.equal(failedJobsPass1.length, 1);
    assert.equal(failedJobsPass1[0].platform, 'linkedin');

    // Step 7: Verify Receipts
    for (const job of liveJobsPass1) {
      const receipt = store.getReceiptForJob(job.jobId);
      assert.ok(receipt);
      assert.equal(receipt.rawStatusClass, 'PUBLISHED');
      assert.ok(receipt.externalUrl.includes('sandbox.rempeyek.local'));
    }

    const originalTwitterReceiptId = store.getReceiptForJob(twitterJob.jobId).receiptId;

    // Step 8: Safe Retry of Failed Destination
    // Provider recovers from LinkedIn issue
    provider.failurePlatform = null;

    const retryPass = await scheduler.retryFailedJobs(campaign.campaignId);
    assert.equal(retryPass.campaign.status, 'LIVE');

    // Step 9: Verify Idempotency & Untouched Success
    const twitterAfterRetry = store.getReceiptForJob(twitterJob.jobId);
    assert.equal(twitterAfterRetry.receiptId, originalTwitterReceiptId); // Never duplicated!

    const linkedinJob = store.listJobsForCampaign(campaign.campaignId).find(j => j.platform === 'linkedin');
    assert.equal(linkedinJob.status, 'LIVE');
    assert.equal(linkedinJob.attempt, 2);
    assert.ok(store.getReceiptForJob(linkedinJob.jobId));

    // Step 10: Fetch Analytics
    for (const job of store.listJobsForCampaign(campaign.campaignId)) {
      const receipt = store.getReceiptForJob(job.jobId);
      const analytics = await gateway.fetchAnalytics(receipt);
      assert.equal(analytics.receiptId, receipt.receiptId);
      assert.ok(analytics.metrics.impressions > 0);
    }

    // Step 11: Record Outcome into Memory
    const outcome = recordPublishingOutcome({
      campaign: store.getCampaign(campaign.campaignId),
      results: retryPass.results,
      store,
    });
    assert.ok(outcome.summaryText.includes('published live'));
    assert.ok(outcome.memoryLine.includes('⚡auto'));

    // Step 12: Today Projection Integration
    const today = buildTodayProjection([{
      id: 'apollo',
      status: 'active',
      updatedAt: new Date().toISOString(),
      tasks: [],
      activeCampaign: store.getCampaign(campaign.campaignId),
      publishingContinuity: {
        totalPlatforms: 4,
        livePlatforms: 4,
        status: 'LIVE',
      },
    }]);
    assert.equal(today.state, 'ready');
    assert.equal(today.activeCampaign.status, 'LIVE');
    assert.equal(today.publishingContinuity.livePlatforms, 4);

    // Step 13: Simulate Restart & Cold State Recovery
    const restartedStore = createPublishingStore({ vaultRoot: tmpVault });
    const recoveredCampaign = restartedStore.getCampaign(campaign.campaignId);
    const recoveredJobs = restartedStore.listJobsForCampaign(campaign.campaignId);
    const recoveredVariants = restartedStore.listVariantsForCampaign(campaign.campaignId);

    assert.equal(recoveredCampaign.status, 'LIVE');
    assert.equal(recoveredJobs.length, 4);
    assert.equal(recoveredVariants.length, 4);
    assert.ok(recoveredJobs.every(j => j.status === 'LIVE'));
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});
