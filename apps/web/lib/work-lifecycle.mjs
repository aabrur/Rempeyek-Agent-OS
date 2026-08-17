import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MISSION_STATUSES = Object.freeze([
  'DRAFT',
  'PLANNED',
  'ACTIVE',
  'PAUSED',
  'VERIFYING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export const MISSION_TRANSITIONS = Object.freeze({
  DRAFT: new Set(['PLANNED', 'CANCELLED']),
  PLANNED: new Set(['ACTIVE', 'CANCELLED']),
  ACTIVE: new Set(['PAUSED', 'VERIFYING', 'FAILED', 'CANCELLED']),
  PAUSED: new Set(['ACTIVE', 'CANCELLED']),
  VERIFYING: new Set(['COMPLETED', 'FAILED', 'ACTIVE']),
  COMPLETED: new Set([]),
  FAILED: new Set(['PLANNED', 'CANCELLED']),
  CANCELLED: new Set([]),
});

export const CONTRACT_STATUSES = Object.freeze([
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
]);

export const RUN_STATUSES = Object.freeze([
  'STARTING',
  'RUNNING',
  'PAUSED',
  'VERIFYING',
  'COMPLETED',
  'FAILED',
  'INTERRUPTED',
]);

export const RUN_TRANSITIONS = Object.freeze({
  STARTING: new Set(['RUNNING', 'FAILED', 'INTERRUPTED']),
  RUNNING: new Set(['PAUSED', 'VERIFYING', 'FAILED', 'INTERRUPTED']),
  PAUSED: new Set(['RUNNING', 'INTERRUPTED', 'FAILED']),
  VERIFYING: new Set(['COMPLETED', 'FAILED', 'RUNNING', 'INTERRUPTED']),
  COMPLETED: new Set([]),
  FAILED: new Set(['STARTING']),
  INTERRUPTED: new Set(['STARTING', 'RUNNING', 'FAILED']),
});

export const WORK_UNIT_STATUSES = Object.freeze([
  'PENDING',
  'READY',
  'RUNNING',
  'VERIFYING',
  'BLOCKED',
  'COMPLETED',
  'FAILED',
  'RETRYING',
]);

export const WORK_UNIT_TRANSITIONS = Object.freeze({
  PENDING: new Set(['READY', 'RUNNING', 'BLOCKED', 'CANCELLED']),
  READY: new Set(['RUNNING', 'BLOCKED']),
  RUNNING: new Set(['VERIFYING', 'FAILED', 'RETRYING', 'BLOCKED', 'COMPLETED']),
  VERIFYING: new Set(['COMPLETED', 'FAILED', 'RETRYING', 'RUNNING']),
  BLOCKED: new Set(['READY', 'RUNNING', 'FAILED']),
  RETRYING: new Set(['READY', 'RUNNING', 'FAILED']),
  COMPLETED: new Set([]),
  FAILED: new Set(['RETRYING', 'READY', 'RUNNING']),
});

export const EVIDENCE_KINDS = Object.freeze([
  'EXECUTION',
  'OUTPUT_CHECK',
  'PROVIDER_RECEIPT',
  'STATUS_CHECK',
  'USER_ASSERTION',
]);

export const EVIDENCE_CLASSES = Object.freeze([
  'VERIFIED',
  'INFERRED',
  'ASSUMED',
  'UNKNOWN',
]);

function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export function createMission(input = {}) {
  const title = String(input.title || '').trim();
  const projectId = String(input.projectId || '').trim();
  if (!title) throw new Error('title is required for Mission');
  if (!projectId) throw new Error('projectId is required for Mission');

  const now = new Date().toISOString();
  return {
    missionId: String(input.missionId || generateId('msn')).trim(),
    projectId,
    title,
    goal: String(input.goal || title).trim(),
    status: MISSION_STATUSES.includes(input.status) ? input.status : 'DRAFT',
    activeRunId: input.activeRunId ? String(input.activeRunId) : null,
    contractRef: input.contractRef ? String(input.contractRef) : null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function transitionMission(mission, nextStatus, { reason = '', actor = 'system' } = {}) {
  if (!mission || !mission.status) throw new Error('Invalid mission');
  if (!MISSION_STATUSES.includes(nextStatus)) {
    throw new Error(`Invalid target mission status: ${nextStatus}`);
  }
  const allowed = MISSION_TRANSITIONS[mission.status];
  if (!allowed || !allowed.has(nextStatus)) {
    throw new Error(`Illegal mission state transition: ${mission.status} -> ${nextStatus}`);
  }
  const now = new Date().toISOString();
  return {
    ...mission,
    status: nextStatus,
    updatedAt: now,
    lastTransition: {
      from: mission.status,
      to: nextStatus,
      reason: String(reason || ''),
      actor: String(actor || 'system'),
      at: now,
    },
  };
}

export function createWorkContract(input = {}) {
  const objective = String(input.objective || '').trim();
  const missionId = String(input.missionId || '').trim();
  if (!objective) throw new Error('objective is required for WorkContract');
  if (!missionId) throw new Error('missionId is required for WorkContract');

  const now = new Date().toISOString();
  return {
    contractId: String(input.contractId || generateId('cnt')).trim(),
    missionId,
    objective,
    definitionOfDone: Array.isArray(input.definitionOfDone)
      ? input.definitionOfDone.map(d => String(d).trim()).filter(Boolean)
      : [String(input.definitionOfDone || objective).trim()],
    scope: Array.isArray(input.scope) ? input.scope.map(s => String(s).trim()) : [],
    exclusions: Array.isArray(input.exclusions) ? input.exclusions.map(e => String(e).trim()) : [],
    authorizedCapabilities: Array.isArray(input.authorizedCapabilities)
      ? [...new Set(input.authorizedCapabilities.map(c => String(c).trim()).filter(Boolean))]
      : [],
    requiredEvidence: Array.isArray(input.requiredEvidence)
      ? input.requiredEvidence.map(e => String(e).trim()).filter(Boolean)
      : ['EXECUTION'],
    tier: ['Nano', 'Lite', 'Standard', 'Prime', 'Hyper', 'Omega'].includes(input.tier)
      ? input.tier
      : 'Standard',
    gateMode: ['none', 'Express', 'Deep'].includes(input.gateMode) ? input.gateMode : 'Express',
    status: CONTRACT_STATUSES.includes(input.status) ? input.status : 'PROPOSED',
    approvedBy: input.approvedBy || null,
    approvedAt: input.approvedAt || null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function createRun(input = {}) {
  const missionId = String(input.missionId || '').trim();
  const contractId = String(input.contractId || '').trim();
  if (!missionId) throw new Error('missionId is required for Run');
  if (!contractId) throw new Error('contractId is required for Run');

  const now = new Date().toISOString();
  return {
    runId: String(input.runId || generateId('run')).trim(),
    missionId,
    contractId,
    workerId: String(input.workerId || 'default-worker').trim(),
    status: RUN_STATUSES.includes(input.status) ? input.status : 'STARTING',
    workUnitIds: Array.isArray(input.workUnitIds) ? input.workUnitIds.map(String) : [],
    startedAt: input.startedAt || now,
    endedAt: input.endedAt || null,
    interruptedReason: input.interruptedReason || null,
  };
}

export function transitionRun(run, nextStatus, { reason = '' } = {}) {
  if (!run || !run.status) throw new Error('Invalid run');
  if (!RUN_STATUSES.includes(nextStatus)) {
    throw new Error(`Invalid target run status: ${nextStatus}`);
  }
  const allowed = RUN_TRANSITIONS[run.status];
  if (!allowed || !allowed.has(nextStatus)) {
    throw new Error(`Illegal run state transition: ${run.status} -> ${nextStatus}`);
  }
  const now = new Date().toISOString();
  const isTerminal = nextStatus === 'COMPLETED' || nextStatus === 'FAILED';
  return {
    ...run,
    status: nextStatus,
    endedAt: isTerminal ? now : run.endedAt,
    interruptedReason: nextStatus === 'INTERRUPTED' ? String(reason || 'Interrupted by session or worker restart') : run.interruptedReason,
  };
}

export function createWorkUnit(input = {}) {
  const title = String(input.title || '').trim();
  const runId = String(input.runId || '').trim();
  if (!title) throw new Error('title is required for WorkUnit');
  if (!runId) throw new Error('runId is required for WorkUnit');

  const now = new Date().toISOString();
  return {
    workUnitId: String(input.workUnitId || generateId('unit')).trim(),
    runId,
    title,
    dependencies: Array.isArray(input.dependencies) ? input.dependencies.map(String) : [],
    status: WORK_UNIT_STATUSES.includes(input.status) ? input.status : 'PENDING',
    attempt: Number.isInteger(input.attempt) && input.attempt >= 0 ? input.attempt : 0,
    maxAttempts: Number.isInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 3,
    assignedWorker: String(input.assignedWorker || 'primary').trim(),
    artifactRefs: Array.isArray(input.artifactRefs) ? input.artifactRefs.map(String) : [],
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String) : [],
    failureReason: input.failureReason || null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function transitionWorkUnit(unit, nextStatus, { reason = '' } = {}) {
  if (!unit || !unit.status) throw new Error('Invalid work unit');
  if (!WORK_UNIT_STATUSES.includes(nextStatus)) {
    throw new Error(`Invalid target work unit status: ${nextStatus}`);
  }
  const allowed = WORK_UNIT_TRANSITIONS[unit.status];
  if (!allowed || !allowed.has(nextStatus)) {
    throw new Error(`Illegal work unit state transition: ${unit.status} -> ${nextStatus}`);
  }
  const now = new Date().toISOString();
  let attempt = unit.attempt;
  if (nextStatus === 'RUNNING') {
    attempt = unit.attempt + 1;
  }
  return {
    ...unit,
    status: nextStatus,
    attempt,
    failureReason: nextStatus === 'FAILED' ? String(reason || 'Unknown failure') : unit.failureReason,
    updatedAt: now,
  };
}

export function createEvidence(input = {}) {
  const workUnitId = String(input.workUnitId || '').trim();
  const missionId = String(input.missionId || '').trim();
  if (!workUnitId) throw new Error('workUnitId is required for Evidence');
  if (!missionId) throw new Error('missionId is required for Evidence');

  const kind = EVIDENCE_KINDS.includes(input.kind) ? input.kind : 'EXECUTION';
  const evidenceClass = EVIDENCE_CLASSES.includes(input.evidenceClass) ? input.evidenceClass : 'VERIFIED';
  const now = new Date().toISOString();

  return {
    evidenceId: String(input.evidenceId || generateId('evd')).trim(),
    workUnitId,
    missionId,
    runId: input.runId ? String(input.runId) : null,
    kind,
    evidenceClass,
    data: input.data !== undefined ? input.data : {},
    provenance: String(input.provenance || 'local-execution').trim(),
    recordedAt: input.recordedAt || now,
    schemaVersion: 1,
  };
}

export function createVerification(input = {}) {
  const missionId = String(input.missionId || '').trim();
  if (!missionId) throw new Error('missionId is required for Verification');

  const checks = Array.isArray(input.criteriaChecks) ? input.criteriaChecks : [];
  let status = 'INCONCLUSIVE';
  if (checks.length > 0) {
    const allPassed = checks.every(c => c && c.passed === true);
    status = allPassed ? 'PASSED' : 'FAILED';
  } else if (input.status && ['PASSED', 'FAILED', 'INCONCLUSIVE'].includes(input.status)) {
    status = input.status;
  }

  const now = new Date().toISOString();
  return {
    verificationId: String(input.verificationId || generateId('vrf')).trim(),
    missionId,
    runId: input.runId ? String(input.runId) : null,
    status,
    criteriaChecks: checks,
    verifiedBy: String(input.verifiedBy || 'system-verifier').trim(),
    verifiedAt: input.verifiedAt || now,
  };
}

export function createHandoff(input = {}) {
  const missionId = String(input.missionId || '').trim();
  const fromWorkerId = String(input.fromWorkerId || '').trim();
  const toWorkerId = String(input.toWorkerId || '').trim();
  if (!missionId) throw new Error('missionId is required for Handoff');
  if (!fromWorkerId) throw new Error('fromWorkerId is required for Handoff');
  if (!toWorkerId) throw new Error('toWorkerId is required for Handoff');

  const now = new Date().toISOString();
  return {
    handoffId: String(input.handoffId || generateId('hdf')).trim(),
    missionId,
    runId: input.runId ? String(input.runId) : null,
    fromWorkerId,
    toWorkerId,
    stateSnapshot: input.stateSnapshot || {},
    unresolvedBlockers: Array.isArray(input.unresolvedBlockers)
      ? input.unresolvedBlockers.map(b => String(b).trim()).filter(Boolean)
      : [],
    nextAction: String(input.nextAction || '').trim(),
    timestamp: input.timestamp || now,
    schemaVersion: 1,
  };
}

export function createWorkLifecycleStore({ vaultRoot, stateRoot } = {}) {
  const memory = {
    missions: new Map(),
    contracts: new Map(),
    runs: new Map(),
    units: new Map(),
    evidence: new Map(),
    verifications: new Map(),
    handoffs: new Map(),
  };

  const workDir = vaultRoot ? path.join(vaultRoot, 'Work') : null;
  if (workDir) {
    for (const sub of ['Missions', 'Contracts', 'Runs', 'Evidence', 'Verifications', 'Handoffs']) {
      try { fs.mkdirSync(path.join(workDir, sub), { recursive: true }); } catch {}
    }
  }

  return {
    saveMission(mission) {
      memory.missions.set(mission.missionId, { ...mission });
      if (workDir) {
        const file = path.join(workDir, 'Missions', `${mission.missionId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(mission, null, 2), 'utf8'); } catch {}
      }
      return { ...mission };
    },
    getMission(missionId) {
      if (memory.missions.has(missionId)) return { ...memory.missions.get(missionId) };
      if (workDir) {
        const file = path.join(workDir, 'Missions', `${missionId}.json`);
        try {
          if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            memory.missions.set(missionId, parsed);
            return { ...parsed };
          }
        } catch {}
      }
      return null;
    },
    listMissions(projectId) {
      if (workDir) {
        const dir = path.join(workDir, 'Missions');
        try {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.json')) {
                const missionId = f.replace('.json', '');
                if (!memory.missions.has(missionId)) {
                  try {
                    const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                    memory.missions.set(parsed.missionId || missionId, parsed);
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      const list = [...memory.missions.values()];
      if (projectId) return list.filter(m => m.projectId === projectId);
      return list;
    },
    saveWorkContract(contract) {
      memory.contracts.set(contract.contractId, { ...contract });
      if (workDir) {
        const file = path.join(workDir, 'Contracts', `${contract.contractId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(contract, null, 2), 'utf8'); } catch {}
      }
      return { ...contract };
    },
    getWorkContract(contractId) {
      if (memory.contracts.has(contractId)) return { ...memory.contracts.get(contractId) };
      if (workDir) {
        const file = path.join(workDir, 'Contracts', `${contractId}.json`);
        try {
          if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            memory.contracts.set(contractId, parsed);
            return { ...parsed };
          }
        } catch {}
      }
      return null;
    },
    saveRun(run) {
      memory.runs.set(run.runId, { ...run });
      if (workDir) {
        const file = path.join(workDir, 'Runs', `${run.runId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(run, null, 2), 'utf8'); } catch {}
      }
      return { ...run };
    },
    getRun(runId) {
      if (memory.runs.has(runId)) return { ...memory.runs.get(runId) };
      if (workDir) {
        const file = path.join(workDir, 'Runs', `${runId}.json`);
        try {
          if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            memory.runs.set(runId, parsed);
            return { ...parsed };
          }
        } catch {}
      }
      return null;
    },
    saveWorkUnit(unit) {
      memory.units.set(unit.workUnitId, { ...unit });
      return { ...unit };
    },
    getWorkUnit(workUnitId) {
      return memory.units.get(workUnitId) ? { ...memory.units.get(workUnitId) } : null;
    },
    saveEvidence(ev) {
      memory.evidence.set(ev.evidenceId, { ...ev });
      if (workDir) {
        const file = path.join(workDir, 'Evidence', `${ev.evidenceId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(ev, null, 2), 'utf8'); } catch {}
      }
      return { ...ev };
    },
    getEvidence(evidenceId) {
      if (memory.evidence.has(evidenceId)) return { ...memory.evidence.get(evidenceId) };
      if (workDir) {
        const file = path.join(workDir, 'Evidence', `${evidenceId}.json`);
        try {
          if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            memory.evidence.set(evidenceId, parsed);
            return { ...parsed };
          }
        } catch {}
      }
      return null;
    },
    listEvidenceForMission(missionId) {
      if (workDir) {
        const dir = path.join(workDir, 'Evidence');
        try {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.json')) {
                const id = f.replace('.json', '');
                if (!memory.evidence.has(id)) {
                  try {
                    const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                    memory.evidence.set(parsed.evidenceId || id, parsed);
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      return [...memory.evidence.values()].filter(e => e.missionId === missionId);
    },
    saveVerification(verification) {
      memory.verifications.set(verification.verificationId, { ...verification });
      return { ...verification };
    },
    getVerification(verificationId) {
      return memory.verifications.get(verificationId) ? { ...memory.verifications.get(verificationId) } : null;
    },
    saveHandoff(handoff) {
      memory.handoffs.set(handoff.handoffId, { ...handoff });
      if (workDir) {
        const file = path.join(workDir, 'Handoffs', `${handoff.handoffId}.json`);
        try { fs.writeFileSync(file, JSON.stringify(handoff, null, 2), 'utf8'); } catch {}
      }
      return { ...handoff };
    },
    getLatestHandoff(missionId) {
      if (workDir) {
        const dir = path.join(workDir, 'Handoffs');
        try {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.json')) {
                const id = f.replace('.json', '');
                if (!memory.handoffs.has(id)) {
                  try {
                    const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                    memory.handoffs.set(parsed.handoffId || id, parsed);
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      const list = [...memory.handoffs.values()].filter(h => h.missionId === missionId);
      return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] || null;
    },
  };
}
