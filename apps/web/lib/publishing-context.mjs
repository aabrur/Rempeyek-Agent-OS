import { createEvidence } from './work-lifecycle.mjs';

export function buildPublishingContext({
  campaign,
  variant,
  workContract = null,
  brandContext = null,
  priorEvidence = [],
  activeJob = null,
  nextAction = null,
} = {}) {
  if (!campaign) throw new Error('campaign is required');

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    campaign: {
      id: campaign.campaignId,
      projectId: campaign.projectId,
      objective: campaign.objective,
      audience: campaign.audience,
      offer: campaign.offer,
      CTA: campaign.CTA,
      targetPlatforms: campaign.targetPlatforms,
      status: campaign.status,
    },
    workContract: workContract ? {
      id: workContract.contractId,
      objective: workContract.objective,
      definitionOfDone: workContract.definitionOfDone,
      authorizedCapabilities: workContract.authorizedCapabilities,
      tier: workContract.tier,
    } : null,
    variant: variant ? {
      id: variant.variantId,
      platform: variant.platform,
      format: variant.format,
      copy: variant.copy,
      title: variant.title,
      ratio: variant.ratio,
      metadata: variant.metadata,
      validationState: variant.validationState,
    } : null,
    activeJob: activeJob ? {
      id: activeJob.jobId,
      platform: activeJob.platform,
      status: activeJob.status,
      attempt: activeJob.attempt,
      maxAttempts: activeJob.maxAttempts,
      failureReason: activeJob.failureReason,
    } : null,
    brandGuidelines: brandContext ? {
      tone: brandContext.tone || 'Professional & authoritative',
      hashtags: brandContext.hashtags || [],
      voiceRules: brandContext.voiceRules || [],
    } : null,
    priorEvidence: Array.isArray(priorEvidence) ? priorEvidence.slice(-5) : [],
    nextAction: nextAction ? String(nextAction).trim() : (campaign.status === 'LIVE' ? 'Monitor post performance' : 'Complete publishing queue'),
  };
}

export function recordPublishingOutcome({
  campaign,
  results = [],
  store = null,
  vaultProjectStore = null,
  workerName = 'Publisher',
} = {}) {
  if (!campaign) throw new Error('campaign is required');

  const liveResults = results.filter(r => r.status === 'LIVE');
  const failedResults = results.filter(r => r.status !== 'LIVE');
  const timestamp = new Date().toISOString();
  const dateShort = timestamp.slice(0, 16).replace('T', ' ');

  // Create structured evidence
  const evidenceRecords = [];
  for (const item of results) {
    if (item.receipt) {
      const ev = createEvidence({
        workUnitId: item.job?.workUnitId || `pub-unit-${item.job?.jobId}`,
        missionId: campaign.missionId || `msn-${campaign.campaignId}`,
        kind: 'PROVIDER_RECEIPT',
        evidenceClass: 'VERIFIED',
        data: {
          platform: item.receipt.platform,
          externalPostId: item.receipt.externalPostId,
          externalUrl: item.receipt.externalUrl,
          publishedAt: item.receipt.publishedAt,
        },
        provenance: item.receipt.provider,
      });
      if (store?.saveEvidence) {
        store.saveEvidence(ev);
      }
      evidenceRecords.push(ev);
    }
  }

  // Summary statement for memory & decisions
  let summaryText = '';
  if (liveResults.length > 0 && failedResults.length === 0) {
    summaryText = `Campaign '${campaign.objective.slice(0, 40)}' published live to ${liveResults.map(r => r.job.platform).join(', ')}`;
  } else if (liveResults.length > 0 && failedResults.length > 0) {
    summaryText = `Campaign '${campaign.objective.slice(0, 40)}' partially live on ${liveResults.map(r => r.job.platform).join(', ')}; failed on ${failedResults.map(r => r.job.platform).join(', ')}`;
  } else {
    summaryText = `Campaign '${campaign.objective.slice(0, 40)}' failed to publish on ${failedResults.map(r => r.job.platform).join(', ')}`;
  }

  const memoryLine = `- **${dateShort}** · ${workerName} - ${summaryText} ⚡auto`;

  if (vaultProjectStore && campaign.projectId) {
    try {
      vaultProjectStore.appendActivity(campaign.projectId, {
        id: `evt-pub-${Date.now()}`,
        projectId: campaign.projectId,
        at: timestamp,
        actor: workerName,
        summary: summaryText,
      });
    } catch {}
  }

  return {
    summaryText,
    memoryLine,
    evidenceRecords,
  };
}
