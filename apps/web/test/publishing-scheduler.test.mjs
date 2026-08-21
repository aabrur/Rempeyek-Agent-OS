import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCampaign,
  createPlatformVariant,
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
import { createApprovalQueue } from '../lib/approval-queue.mjs';

test('PublishingScheduler queues multi-platform campaign and processes jobs', async () => {
  const store = createPublishingStore();
  const gateway = createPublishingGateway({ store });
  const scheduler = createPublishingScheduler({ gateway, store });

  const campaign = store.saveCampaign(createCampaign({
    projectId: 'p-1',
    objective: 'Announce Launch',
    targetPlatforms: ['twitter', 'linkedin'],
  }));

  const { jobs } = await scheduler.scheduleCampaign(campaign);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].status, 'QUEUED');
  assert.equal(jobs[1].status, 'QUEUED');

  const { campaign: processed, results } = await scheduler.processCampaign(campaign.campaignId);
  assert.equal(processed.status, 'LIVE');
  assert.equal(results.length, 2);
  assert.equal(results[0].status, 'LIVE');
  assert.equal(results[1].status, 'LIVE');
  assert.ok(results[0].receipt.externalPostId);
  assert.ok(results[1].receipt.externalPostId);
});

test('Partial success handling: one failing platform does not republish successful platform on retry', async () => {
  const store = createPublishingStore();
  // Provider configured to fail ONLY on linkedin
  const provider = createSandboxPublishingProvider({ failurePlatform: 'linkedin', failureType: 'RETRYABLE' });
  const gateway = createPublishingGateway({ provider, store });
  const scheduler = createPublishingScheduler({ gateway, store });

  const campaign = store.saveCampaign(createCampaign({
    projectId: 'p-1',
    objective: 'Multi-destination distribution test',
    targetPlatforms: ['twitter', 'linkedin'],
  }));

  await scheduler.scheduleCampaign(campaign);

  // First run: Twitter succeeds, LinkedIn fails
  const firstPass = await scheduler.processCampaign(campaign.campaignId);
  assert.equal(firstPass.campaign.status, 'PARTIAL_SUCCESS');

  const twitterJob = store.listJobsForCampaign(campaign.campaignId).find(j => j.platform === 'twitter');
  const linkedinJob = store.listJobsForCampaign(campaign.campaignId).find(j => j.platform === 'linkedin');

  assert.equal(twitterJob.status, 'LIVE');
  assert.equal(linkedinJob.status, 'RETRYABLE_FAILED');
  assert.equal(linkedinJob.attempt, 1);

  const originalTwitterReceipt = store.getReceiptForJob(twitterJob.jobId);
  assert.ok(originalTwitterReceipt);

  // Fix the provider so LinkedIn will now succeed on retry
  provider.failurePlatform = null;

  // Retry failed jobs
  const secondPass = await scheduler.retryFailedJobs(campaign.campaignId);
  assert.equal(secondPass.campaign.status, 'LIVE');

  const twitterAfterRetry = store.getPublicationJob(twitterJob.jobId);
  const linkedinAfterRetry = store.getPublicationJob(linkedinJob.jobId);

  // Twitter job was untouched and skipped
  assert.equal(twitterAfterRetry.status, 'LIVE');
  assert.equal(twitterAfterRetry.attempt, 1);
  assert.equal(store.getReceiptForJob(twitterJob.jobId).receiptId, originalTwitterReceipt.receiptId);

  // LinkedIn succeeded on attempt 2
  assert.equal(linkedinAfterRetry.status, 'LIVE');
  assert.equal(linkedinAfterRetry.attempt, 2);
  assert.ok(store.getReceiptForJob(linkedinJob.jobId));
});

test('Approval Queue blocks unauthorized execution until explicitly authorized', async () => {
  const store = createPublishingStore();
  const gateway = createPublishingGateway({ store });
  const approvalQueue = createApprovalQueue();
  const scheduler = createPublishingScheduler({ gateway, store, approvalQueue });

  const campaign = store.saveCampaign(createCampaign({
    projectId: 'p-1',
    objective: 'High-visibility corporate memo',
    targetPlatforms: ['twitter'],
  }));

  const { jobs } = await scheduler.scheduleCampaign(campaign, { approvalRef: 'pending-approval-token' });
  const job = jobs[0];

  // Try processing without granting approval -> becomes BLOCKED
  const blockedPass = await scheduler.processCampaign(campaign.campaignId);
  assert.equal(blockedPass.campaign.status, 'FAILED');
  assert.equal(store.getPublicationJob(job.jobId).status, 'BLOCKED');

  // Request & grant real approval in queue
  const request = approvalQueue.request({
    type: 'social.publish.execute',
    target: job.jobId,
    consequence: 'Publish tweet externally',
    actor: 'founder',
  });
  approvalQueue.decide(request.id, { decision: 'approved', actor: 'founder' });

  // Update job with valid approval ref
  const approvedJob = store.getPublicationJob(job.jobId);
  approvedJob.approvalRef = request.id;
  approvedJob.status = 'QUEUED';
  store.savePublicationJob(approvedJob);

  const approvedPass = await scheduler.processCampaign(campaign.campaignId);
  assert.equal(approvedPass.campaign.status, 'LIVE');
  assert.equal(store.getPublicationJob(job.jobId).status, 'LIVE');
});

test('Scheduler fail-closes when approvalRef exists but no approval queue is configured', async () => {
  const store = createPublishingStore();
  const gateway = createPublishingGateway({ store });
  const scheduler = createPublishingScheduler({ gateway, store });

  const campaign = store.saveCampaign(createCampaign({
    projectId: 'p-1',
    objective: 'Must not publish without an approval queue',
    targetPlatforms: ['twitter'],
  }));

  const { jobs } = await scheduler.scheduleCampaign(campaign, { approvalRef: 'orphan-approval-ref' });
  const pass = await scheduler.processCampaign(campaign.campaignId);
  assert.equal(store.getPublicationJob(jobs[0].jobId).status, 'BLOCKED');
  assert.equal(pass.results[0].status, 'BLOCKED');
  assert.match(String(pass.results[0].error), /no approval queue configured/i);
});

test('Publishing context packet is bounded, clean, and records memory outcomes', () => {
  const campaign = createCampaign({
    projectId: 'p-apollo',
    objective: 'Deploy continuous AI workflows',
    offer: 'Free beta',
    targetPlatforms: ['twitter'],
  });
  const variant = createPlatformVariant({
    campaignId: campaign.campaignId,
    platform: 'twitter',
    copy: 'Deploy continuous AI workflows! Free beta.',
  });

  const packet = buildPublishingContext({
    campaign,
    variant,
    nextAction: 'Publish to Twitter',
  });

  assert.equal(packet.campaign.id, campaign.campaignId);
  assert.equal(packet.variant.platform, 'twitter');
  assert.equal(packet.nextAction, 'Publish to Twitter');
  assert.ok(!JSON.stringify(packet).includes('token'));

  const outcome = recordPublishingOutcome({
    campaign,
    results: [
      { job: { jobId: 'j-1', platform: 'twitter' }, status: 'LIVE', receipt: { platform: 'twitter', externalPostId: 't-123' } },
    ],
  });

  assert.ok(outcome.summaryText.includes('published live to twitter'));
  assert.ok(outcome.memoryLine.includes('⚡auto'));
  assert.equal(outcome.evidenceRecords.length, 1);
});
