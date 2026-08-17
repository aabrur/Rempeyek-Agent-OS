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
} from '../lib/work-lifecycle.mjs';

test('Dogfood 1: Complete Work Continuity Lifecycle across worker failure and application restart', () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-dogfood-work-'));
  try {
    let store = createWorkLifecycleStore({ vaultRoot: tmpVault });

    // Step 1 & 2: Goal -> Mission
    let mission = store.saveMission(createMission({
      projectId: 'apollo',
      title: 'Deploy Production Kernel v2.5',
      goal: 'Achieve work continuity and zero secret leakage',
    }));
    assert.equal(mission.status, 'DRAFT');

    mission = transitionMission(mission, 'PLANNED', { reason: 'Requirements defined', actor: 'founder' });
    store.saveMission(mission);
    assert.equal(mission.status, 'PLANNED');

    // Step 3: Work Contract
    const contract = store.saveWorkContract(createWorkContract({
      missionId: mission.missionId,
      objective: 'Compile and verify kernel artifacts',
      definitionOfDone: ['Build passes', 'Tests pass', 'Audit verified'],
      authorizedCapabilities: ['filesystem.write', 'process.execute'],
      tier: 'Hyper',
    }));
    assert.equal(contract.tier, 'Hyper');

    // Step 4: Run with Worker A
    let run = store.saveRun(createRun({
      missionId: mission.missionId,
      contractId: contract.contractId,
      workerId: 'worker-codex',
    }));
    run = transitionRun(run, 'RUNNING');
    store.saveRun(run);
    assert.equal(run.status, 'RUNNING');

    mission = transitionMission(mission, 'ACTIVE', { reason: 'Run started' });
    mission.activeRunId = run.runId;
    store.saveMission(mission);

    // Step 5: Work Unit 1 execution by Worker A
    let unit1 = store.saveWorkUnit(createWorkUnit({
      runId: run.runId,
      title: 'Compile kernel modules',
      assignedWorker: 'worker-codex',
    }));
    unit1 = transitionWorkUnit(unit1, 'RUNNING');
    unit1 = transitionWorkUnit(unit1, 'COMPLETED');
    store.saveWorkUnit(unit1);

    const ev1 = store.saveEvidence(createEvidence({
      workUnitId: unit1.workUnitId,
      missionId: mission.missionId,
      runId: run.runId,
      kind: 'EXECUTION',
      evidenceClass: 'VERIFIED',
      data: { buildTimeMs: 420, artifacts: ['kernel.bin'] },
    }));
    assert.equal(ev1.evidenceClass, 'VERIFIED');

    // Step 6: Worker Crash / Interruption Simulation
    run = transitionRun(run, 'INTERRUPTED', { reason: 'Process killed by OS memory pressure' });
    store.saveRun(run);
    assert.equal(run.status, 'INTERRUPTED');

    // Step 7: Handoff to Worker B
    const handoff = store.saveHandoff(createHandoff({
      missionId: mission.missionId,
      runId: run.runId,
      fromWorkerId: 'worker-codex',
      toWorkerId: 'worker-conductor',
      stateSnapshot: { completedUnitIds: [unit1.workUnitId] },
      unresolvedBlockers: [],
      nextAction: 'Execute test verification suite',
    }));
    assert.equal(handoff.toWorkerId, 'worker-conductor');
    assert.equal(handoff.nextAction, 'Execute test verification suite');

    // Step 8: Resume Run with Worker B
    run = transitionRun(run, 'RUNNING');
    run.workerId = 'worker-conductor';
    store.saveRun(run);
    assert.equal(run.status, 'RUNNING');

    let unit2 = store.saveWorkUnit(createWorkUnit({
      runId: run.runId,
      title: 'Execute test verification suite',
      dependencies: [unit1.workUnitId],
      assignedWorker: 'worker-conductor',
    }));
    unit2 = transitionWorkUnit(unit2, 'RUNNING');
    unit2 = transitionWorkUnit(unit2, 'COMPLETED');
    store.saveWorkUnit(unit2);

    store.saveEvidence(createEvidence({
      workUnitId: unit2.workUnitId,
      missionId: mission.missionId,
      runId: run.runId,
      kind: 'OUTPUT_CHECK',
      evidenceClass: 'VERIFIED',
      data: { testsPassed: 42, testsFailed: 0 },
    }));

    // Step 9: Verification Gate
    const verification = store.saveVerification(createVerification({
      missionId: mission.missionId,
      runId: run.runId,
      criteriaChecks: [
        { name: 'Build modules', passed: true },
        { name: 'Test suite', passed: true },
      ],
      verifiedBy: 'system-verifier',
    }));
    assert.equal(verification.status, 'PASSED');

    // Step 10: Complete Run and Mission
    run = transitionRun(run, 'VERIFYING');
    run = transitionRun(run, 'COMPLETED');
    store.saveRun(run);

    mission = transitionMission(mission, 'VERIFYING');
    mission = transitionMission(mission, 'COMPLETED', { reason: 'All criteria verified' });
    store.saveMission(mission);
    assert.equal(mission.status, 'COMPLETED');

    // Step 11: Simulate Application Restart (re-instantiate store from disk)
    const restartedStore = createWorkLifecycleStore({ vaultRoot: tmpVault });
    const recoveredMission = restartedStore.getMission(mission.missionId);
    const recoveredContract = restartedStore.getWorkContract(contract.contractId);
    const recoveredRun = restartedStore.getRun(run.runId);
    const recoveredEvidence = restartedStore.listEvidenceForMission(mission.missionId);
    const latestHandoff = restartedStore.getLatestHandoff(mission.missionId);

    assert.equal(recoveredMission.title, 'Deploy Production Kernel v2.5');
    assert.equal(recoveredMission.status, 'COMPLETED');
    assert.equal(recoveredContract.tier, 'Hyper');
    assert.equal(recoveredRun.status, 'COMPLETED');
    assert.equal(recoveredEvidence.length, 2);
    assert.equal(latestHandoff.toWorkerId, 'worker-conductor');
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});
