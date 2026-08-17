import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createMission,
  transitionMission,
  createWorkContract,
  createRun,
  transitionRun,
  createWorkUnit,
  transitionWorkUnit,
  createEvidence,
  createVerification,
  createHandoff,
  createWorkLifecycleStore,
  MISSION_STATUSES,
  RUN_STATUSES,
} from '../lib/work-lifecycle.mjs';

test('Mission lifecycle enforces deterministic state transitions and validation', () => {
  assert.throws(() => createMission({ title: '' }), /title is required/);
  assert.throws(() => createMission({ title: 'Test' }), /projectId is required/);

  let mission = createMission({ projectId: 'proj-1', title: 'Ship feature' });
  assert.equal(mission.status, 'DRAFT');

  mission = transitionMission(mission, 'PLANNED', { reason: 'Planning complete', actor: 'planner' });
  assert.equal(mission.status, 'PLANNED');
  assert.equal(mission.lastTransition.from, 'DRAFT');

  mission = transitionMission(mission, 'ACTIVE', { reason: 'Starting run', actor: 'conductor' });
  assert.equal(mission.status, 'ACTIVE');

  mission = transitionMission(mission, 'VERIFYING', { reason: 'Ready for verification' });
  assert.equal(mission.status, 'VERIFYING');

  mission = transitionMission(mission, 'COMPLETED', { reason: 'Verified successfully' });
  assert.equal(mission.status, 'COMPLETED');

  // Terminal state cannot transition
  assert.throws(() => transitionMission(mission, 'ACTIVE'), /Illegal mission state transition/);
});

test('WorkContract enforces required objective, capabilities, and definition of done', () => {
  assert.throws(() => createWorkContract({ missionId: 'm-1' }), /objective is required/);
  assert.throws(() => createWorkContract({ objective: 'Build API' }), /missionId is required/);

  const contract = createWorkContract({
    missionId: 'm-1',
    objective: 'Build API endpoints',
    definitionOfDone: ['Tests pass', 'API docs written'],
    authorizedCapabilities: ['filesystem.write', 'process.execute'],
    tier: 'Prime',
  });

  assert.equal(contract.objective, 'Build API endpoints');
  assert.equal(contract.status, 'PROPOSED');
  assert.equal(contract.definitionOfDone.length, 2);
  assert.equal(contract.tier, 'Prime');
});

test('Run lifecycle handles interruption, failure, and recovery', () => {
  let run = createRun({ missionId: 'm-1', contractId: 'c-1', workerId: 'worker-a' });
  assert.equal(run.status, 'STARTING');

  run = transitionRun(run, 'RUNNING');
  assert.equal(run.status, 'RUNNING');

  // Interrupted when session ends abruptly
  run = transitionRun(run, 'INTERRUPTED', { reason: 'Worker crashed' });
  assert.equal(run.status, 'INTERRUPTED');
  assert.equal(run.interruptedReason, 'Worker crashed');

  // Recovery restarts the run
  run = transitionRun(run, 'RUNNING');
  assert.equal(run.status, 'RUNNING');

  run = transitionRun(run, 'VERIFYING');
  run = transitionRun(run, 'COMPLETED');
  assert.equal(run.status, 'COMPLETED');
  assert.ok(run.endedAt);
});

test('WorkUnit tracks attempt increments and dependency state', () => {
  let unit = createWorkUnit({ runId: 'r-1', title: 'Compile assets', maxAttempts: 2 });
  assert.equal(unit.status, 'PENDING');
  assert.equal(unit.attempt, 0);

  unit = transitionWorkUnit(unit, 'READY');
  unit = transitionWorkUnit(unit, 'RUNNING');
  assert.equal(unit.attempt, 1);

  unit = transitionWorkUnit(unit, 'RETRYING');
  unit = transitionWorkUnit(unit, 'RUNNING');
  assert.equal(unit.attempt, 2);

  unit = transitionWorkUnit(unit, 'COMPLETED');
  assert.equal(unit.status, 'COMPLETED');
});

test('Evidence and Verification evaluate criteria truth', () => {
  const ev = createEvidence({
    workUnitId: 'u-1',
    missionId: 'm-1',
    kind: 'EXECUTION',
    evidenceClass: 'VERIFIED',
    data: { exitCode: 0, stdout: 'All tests passed' },
    provenance: 'npm-test-runner',
  });
  assert.equal(ev.evidenceClass, 'VERIFIED');
  assert.equal(ev.data.exitCode, 0);

  const passingVerification = createVerification({
    missionId: 'm-1',
    criteriaChecks: [
      { name: 'Unit tests', passed: true },
      { name: 'Lint check', passed: true },
    ],
  });
  assert.equal(passingVerification.status, 'PASSED');

  const failingVerification = createVerification({
    missionId: 'm-1',
    criteriaChecks: [
      { name: 'Unit tests', passed: true },
      { name: 'Security audit', passed: false, error: 'Vulnerability found' },
    ],
  });
  assert.equal(failingVerification.status, 'FAILED');
});

test('Handoff preserves cross-worker continuity context', () => {
  const handoff = createHandoff({
    missionId: 'm-1',
    fromWorkerId: 'worker-1',
    toWorkerId: 'worker-2',
    stateSnapshot: { completedUnits: ['u-1', 'u-2'], activeUnit: 'u-3' },
    unresolvedBlockers: ['OAuth rate limit'],
    nextAction: 'Retry u-3 with exponential backoff',
  });

  assert.equal(handoff.fromWorkerId, 'worker-1');
  assert.equal(handoff.toWorkerId, 'worker-2');
  assert.deepEqual(handoff.unresolvedBlockers, ['OAuth rate limit']);
  assert.equal(handoff.nextAction, 'Retry u-3 with exponential backoff');
});

test('WorkLifecycleStore persists and recovers state atomically', () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-work-store-'));
  try {
    const store = createWorkLifecycleStore({ vaultRoot: tmpVault });

    const mission = store.saveMission(createMission({ projectId: 'proj-alpha', title: 'Launch Alpha' }));
    const contract = store.saveWorkContract(createWorkContract({ missionId: mission.missionId, objective: 'Deploy' }));
    const run = store.saveRun(createRun({ missionId: mission.missionId, contractId: contract.contractId }));
    const handoff = store.saveHandoff(createHandoff({
      missionId: mission.missionId,
      runId: run.runId,
      fromWorkerId: 'w-1',
      toWorkerId: 'w-2',
      nextAction: 'Continue deployment',
    }));

    // Verify recovery
    assert.equal(store.getMission(mission.missionId).title, 'Launch Alpha');
    assert.equal(store.getWorkContract(contract.contractId).objective, 'Deploy');
    assert.equal(store.getRun(run.runId).missionId, mission.missionId);
    assert.equal(store.getLatestHandoff(mission.missionId).nextAction, 'Continue deployment');

    // Verify disk persistence
    assert.ok(fs.existsSync(path.join(tmpVault, 'Work', 'Missions', `${mission.missionId}.json`)));
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});
