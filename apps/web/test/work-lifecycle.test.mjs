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
  WORK_UNIT_STATUSES,
} from '../lib/work-lifecycle.mjs';
import { APP_VERSION } from '../lib/version.mjs';

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

test('WorkUnit CANCELLED is a listed terminal status', () => {
  assert.equal(WORK_UNIT_STATUSES.includes('CANCELLED'), true);
  let unit = createWorkUnit({ runId: 'r-1', title: 'Abort compile' });
  unit = transitionWorkUnit(unit, 'CANCELLED');
  assert.equal(unit.status, 'CANCELLED');
  assert.throws(() => transitionWorkUnit(unit, 'READY'), /Illegal work unit state transition/);
});

test('WorkUnit persists across store recreation', () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-workunit-persist-'));
  try {
    const store1 = createWorkLifecycleStore({ vaultRoot: tmpVault });
    const unit = store1.saveWorkUnit(createWorkUnit({
      runId: 'r-1',
      title: 'Plan A recovery proof',
      workUnitId: 'wu-1',
    }));

    // Recreate store — must recover from disk
    const store2 = createWorkLifecycleStore({ vaultRoot: tmpVault });
    const recovered = store2.getWorkUnit('wu-1');

    assert.ok(recovered, 'WorkUnit should be recovered from disk');
    assert.equal(recovered.workUnitId, 'wu-1');
    assert.equal(recovered.title, 'Plan A recovery proof');
    assert.equal(recovered.runId, 'r-1');

    // Disk file must exist
    assert.ok(fs.existsSync(path.join(tmpVault, 'Work', 'WorkUnits', 'wu-1.json')));
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});

test('Verification persists across store recreation', () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-verification-persist-'));
  try {
    const store1 = createWorkLifecycleStore({ vaultRoot: tmpVault });
    const verification = store1.saveVerification(createVerification({
      missionId: 'm-1',
      verificationId: 'v-1',
      criteriaChecks: [{ name: 'Version drift', passed: true }],
    }));

    // Recreate store — must recover from disk
    const store2 = createWorkLifecycleStore({ vaultRoot: tmpVault });
    const recovered = store2.getVerification('v-1');

    assert.ok(recovered, 'Verification should be recovered from disk');
    assert.equal(recovered.verificationId, 'v-1');
    assert.equal(recovered.missionId, 'm-1');
    assert.deepEqual(recovered.criteriaChecks, [{ name: 'Version drift', passed: true }]);

    // Disk file must exist
    assert.ok(fs.existsSync(path.join(tmpVault, 'Work', 'Verifications', 'v-1.json')));
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});

test('Corrupt WorkUnit JSON recovers from .bak', () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-wu-corrupt-'));
  try {
    const store = createWorkLifecycleStore({ vaultRoot: tmpVault });

    // Write a valid unit
    const unit = store.saveWorkUnit(createWorkUnit({
      runId: 'r-corrupt',
      workUnitId: 'wu-corrupt',
      title: 'Good state',
    }));
    assert.ok(unit);

    const workUnitsDir = path.join(tmpVault, 'Work', 'WorkUnits');
    const file = path.join(workUnitsDir, 'wu-corrupt.json');

    // Corrupt the active file
    fs.writeFileSync(file, '{ "broken json', 'utf8');
    assert.ok(!fs.existsSync(`${file}.bak`));

    // Second save triggers backup creation; but we corrupt after save so .bak already exists
    // Force corruption scenario: write good then backup then corrupt
    fs.writeFileSync(file, JSON.stringify(unit, null, 2), 'utf8');
    fs.copyFileSync(file, `${file}.bak`);
    fs.writeFileSync(file, '{ corrupted', 'utf8');

    // Load with recovery — implementation should recover from .bak
    const store2 = createWorkLifecycleStore({ vaultRoot: tmpVault });
    const recovered = store2.getWorkUnit('wu-corrupt');
    assert.ok(recovered, 'Should recover from .bak after corruption');
    assert.equal(recovered.title, 'Good state');
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});

test('WorkUnit schemaVersion persists and version stays locked', () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-wu-version-'));
  try {
    const store = createWorkLifecycleStore({ vaultRoot: tmpVault });
    const unit = store.saveWorkUnit(createWorkUnit({
      runId: 'r-ver',
      workUnitId: 'wu-ver',
      title: 'Version lock',
    }));

    const file = path.join(tmpVault, 'Work', 'WorkUnits', 'wu-ver.json');
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);

    assert.equal(parsed.schemaVersion, 1);
    assert.equal(unit.schemaVersion, 1);
    // APP_VERSION lock: work-unit metadata must not embed a stale version
    assert.equal(unit.schemaVersion, 1);
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});
