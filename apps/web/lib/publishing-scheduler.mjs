import {
  createPublicationJob,
  transitionPublicationJob,
  transitionCampaign,
  computeIdempotencyKey,
} from './publishing-domain.mjs';

export function createPublishingScheduler({
  gateway,
  store,
  approvalQueue = null,
  maxAttempts = 3,
} = {}) {
  if (!gateway) throw new Error('gateway is required for PublishingScheduler');
  if (!store) throw new Error('store is required for PublishingScheduler');

  return {
    async scheduleCampaign(campaign, { approvalRef = null, scheduledFor = null } = {}) {
      if (!campaign || !campaign.campaignId) throw new Error('Valid campaign is required');

      let variants = store.listVariantsForCampaign(campaign.campaignId);
      if (variants.length === 0) {
        variants = gateway.generateVariants(campaign);
      }

      const existingJobs = store.listJobsForCampaign(campaign.campaignId);
      const jobs = [];

      for (const variant of variants) {
        let job = existingJobs.find(j => j.variantId === variant.variantId);
        if (!job) {
          job = createPublicationJob({
            projectId: campaign.projectId,
            missionId: campaign.missionId,
            campaignId: campaign.campaignId,
            variantId: variant.variantId,
            platform: variant.platform,
            scheduledFor: scheduledFor || new Date().toISOString(),
            approvalRef,
            maxAttempts,
          });
          store.savePublicationJob(job);
        }
        jobs.push(job);
      }

      const updatedCampaign = transitionCampaign(campaign, 'QUEUED', { reason: `Queued ${jobs.length} publication jobs` });
      store.saveCampaign(updatedCampaign);

      return {
        campaign: updatedCampaign,
        jobs,
      };
    },

    async processCampaign(campaignId, { connectorConfigs = {}, approvalId = null } = {}) {
      const campaign = store.getCampaign(campaignId);
      if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

      const jobs = store.listJobsForCampaign(campaignId);
      const variants = store.listVariantsForCampaign(campaignId);
      const results = [];

      let hasSuccess = false;
      let hasFailure = false;
      let hasRetryable = false;

      for (const job of jobs) {
        // Skip jobs already completed/LIVE
        if (job.status === 'LIVE') {
          const receipt = store.getReceiptForJob(job.jobId);
          results.push({ job, receipt, status: 'LIVE', skipped: true });
          hasSuccess = true;
          continue;
        }

        const variant = variants.find(v => v.variantId === job.variantId);
        if (!variant) {
          const failedJob = transitionPublicationJob(job, 'PERMANENT_FAILED', { reason: 'Variant not found' });
          store.savePublicationJob(failedJob);
          results.push({ job: failedJob, error: 'Variant not found', status: 'PERMANENT_FAILED' });
          hasFailure = true;
          continue;
        }

        // Check approval if required — fail-closed when approvalRef exists
        if (job.approvalRef) {
          if (!approvalQueue) {
            const blockedJob = transitionPublicationJob(job, 'BLOCKED', { reason: 'Approval required but no approval queue configured' });
            store.savePublicationJob(blockedJob);
            results.push({ job: blockedJob, error: 'Approval required but no approval queue configured', status: 'BLOCKED' });
            hasFailure = true;
            continue;
          }
          const auth = approvalQueue.authorize(job.approvalRef, {
            type: 'social.publish.execute',
            target: job.jobId,
            actor: 'publishing-scheduler',
          });
          if (!auth.allowed) {
            const blockedJob = transitionPublicationJob(job, 'BLOCKED', { reason: `Approval denied: ${auth.reason}` });
            store.savePublicationJob(blockedJob);
            results.push({ job: blockedJob, error: `Approval denied: ${auth.reason}`, status: 'BLOCKED' });
            hasFailure = true;
            continue;
          }
        }

        // Transition job to PUBLISHING
        let currentJob = transitionPublicationJob(job, 'PUBLISHING', { attemptIncrement: true });
        store.savePublicationJob(currentJob);

        try {
          const connectorConfig = connectorConfigs[job.platform] || {};
          const receipt = await gateway.executePublication(currentJob, variant, { connectorConfig });

          const liveJob = transitionPublicationJob(currentJob, 'LIVE', { externalId: receipt.externalPostId });
          store.savePublicationJob(liveJob);
          store.savePublicationReceipt(receipt);

          results.push({ job: liveJob, receipt, status: 'LIVE' });
          hasSuccess = true;
        } catch (err) {
          const isRetryable = err.retryable !== false && currentJob.attempt < currentJob.maxAttempts;
          const failureStatus = isRetryable ? 'RETRYABLE_FAILED' : 'PERMANENT_FAILED';
          const failedJob = transitionPublicationJob(currentJob, failureStatus, { reason: err.message });
          store.savePublicationJob(failedJob);

          results.push({ job: failedJob, error: err.message, status: failureStatus });
          hasFailure = true;
          if (isRetryable) hasRetryable = true;
        }
      }

      // Reconcile campaign state
      let nextCampaignStatus = 'PARTIAL_SUCCESS';
      if (hasSuccess && !hasFailure) {
        nextCampaignStatus = 'LIVE';
      } else if (!hasSuccess && hasFailure) {
        nextCampaignStatus = 'FAILED';
      } else if (hasSuccess && hasFailure) {
        nextCampaignStatus = 'PARTIAL_SUCCESS';
      }

      const reconciledCampaign = transitionCampaign(campaign, nextCampaignStatus, {
        reason: `Processed: ${results.filter(r => r.status === 'LIVE').length} live, ${results.filter(r => r.status !== 'LIVE').length} failed`,
      });
      store.saveCampaign(reconciledCampaign);

      return {
        campaign: reconciledCampaign,
        results,
      };
    },

    async retryFailedJobs(campaignId, { connectorConfigs = {} } = {}) {
      const campaign = store.getCampaign(campaignId);
      if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

      const jobs = store.listJobsForCampaign(campaignId);
      const retryableJobs = jobs.filter(j => j.status === 'RETRYABLE_FAILED' || j.status === 'BLOCKED');

      if (retryableJobs.length === 0) {
        return { message: 'No retryable failed jobs found for this campaign', jobs };
      }

      for (const job of retryableJobs) {
        // Re-queue only the failed job with fresh idempotency key
        const resetJob = transitionPublicationJob(job, 'QUEUED');
        resetJob.idempotencyKey = computeIdempotencyKey({
          jobId: resetJob.jobId,
          variantId: resetJob.variantId,
          platform: resetJob.platform,
          accountRef: resetJob.accountRef,
          attempt: resetJob.attempt,
        });
        store.savePublicationJob(resetJob);
      }

      return await this.processCampaign(campaignId, { connectorConfigs });
    },

    async recoverInterruptedJobs() {
      const allJobs = [...store.listJobsForCampaign ? [] : []];
      const recovered = [];

      for (const job of allJobs) {
        if (job.status === 'PUBLISHING') {
          // Reconcile if external receipt exists
          const receipt = store.getReceiptForJob(job.jobId);
          if (receipt && receipt.externalPostId) {
            const verification = await gateway.verifyPublication(receipt.externalPostId);
            if (verification.verified) {
              const liveJob = transitionPublicationJob(job, 'LIVE', { externalId: receipt.externalPostId });
              store.savePublicationJob(liveJob);
              recovered.push({ jobId: job.jobId, resolvedStatus: 'LIVE' });
              continue;
            }
          }
          // If no receipt, reset to QUEUED for safe retry
          const requeuedJob = transitionPublicationJob(job, 'QUEUED', { reason: 'Recovered from interrupted worker' });
          store.savePublicationJob(requeuedJob);
          recovered.push({ jobId: job.jobId, resolvedStatus: 'QUEUED' });
        }
      }

      return { recoveredCount: recovered.length, recovered };
    },
  };
}
