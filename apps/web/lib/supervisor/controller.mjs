import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { writeJsonAtomic } from '../durable-config.mjs';
import { isPathAllowed, redactSecrets } from '../access-policy-engine.mjs';
import * as work from '../work-lifecycle.mjs';
import { createProviderRegistry } from './providers.mjs';
import { createWorktreeManager } from './worktrees.mjs';
import { contextCatalog, prepareContext, saveContext, CONTEXT_LIMITS } from './context.mjs';
import { MAX_REPAIR_ROUNDS, ROLES, SAFE_ID, validatePlan, parseStructured, selectProvider, promptFor } from './planner.mjs';

const terminal = new Set(['READY_FOR_QA', 'FAILED', 'CANCELLED']);
const stopped = run => terminal.has(run.status) || run.paused || ['WAITING_APPROVAL', 'NEEDS_HUMAN'].includes(run.status);
const iso = () => new Date().toISOString();
const copy = value => JSON.parse(JSON.stringify(value));
const clamp = (value, fallback, min, max) => Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function createSupervisor({ stateDir, vaultPath, approvalQueue, workStore, listProjects = () => [] }) {
  if (!stateDir || !approvalQueue || !workStore) throw new Error('Supervisor needs private state, work lifecycle and approvals');
  fs.mkdirSync(stateDir, { recursive: true });
  const lockPath = path.join(stateDir, 'owner.json');
  if (fs.existsSync(lockPath)) {
    const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('Invalid Supervisor ownership record; manual reconciliation required');
    let gone = false;
    try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') gone = true; }
    if (!gone) throw new Error('Another Supervisor owner may still be running');
    fs.unlinkSync(lockPath);
  }
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: iso() }), { flag: 'wx', mode: 0o600 });
  const stateFile = path.join(stateDir, 'supervisor.json');
  const artifactsRoot = path.join(stateDir, 'artifacts');
  fs.mkdirSync(artifactsRoot, { recursive: true });
  const runs = new Map(), active = new Map();
  const worktrees = createWorktreeManager({ root: path.join(stateDir, 'managed') });
  let closing = false, ticking = false, creation = false, timer;
  let recoveryError = null;
  function redact(value) {
    let output = redactSecrets(value).replace(/\b(?:sk-|xai-)[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .replace(/((?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)\s*=\s*)[^\s]+/gi, '$1[REDACTED]');
    for (const [key, secret] of Object.entries(process.env)) if (/token|secret|password|api.?key/i.test(key) && secret?.length >= 8) output = output.split(secret).join('[REDACTED]');
    return output;
  }
  const clean = value => JSON.parse(JSON.stringify(value, (key, item) => typeof item === 'string' ? redact(item) : item));
  function persist() { writeJsonAtomic(stateFile, { version: 1, runs: [...runs.values()] }, { backup: true }); }
  function mirror(run) {
    let canonical = workStore.getRun(run.id);
    if (!canonical) return;
    const target = run.status === 'READY_FOR_QA' ? 'VERIFYING' : ['FAILED'].includes(run.status) ? 'FAILED'
      : ['CANCELLED', 'NEEDS_HUMAN'].includes(run.status) ? 'INTERRUPTED' : run.paused || ['WAITING_APPROVAL', 'WAITING_CAPACITY'].includes(run.status) ? 'PAUSED' : 'RUNNING';
    if (canonical.status === 'STARTING' && target !== 'FAILED' && target !== 'INTERRUPTED') canonical = work.transitionRun(canonical, 'RUNNING');
    if (canonical.status !== target && work.RUN_TRANSITIONS[canonical.status]?.has(target)) canonical = work.transitionRun(canonical, target, { reason: run.nextAction });
    workStore.saveRun({ ...canonical, supervisorStatus: run.status, workUnitIds: run.units.map(u => `${run.id}-${u.id}`) });
    let mission = workStore.getMission(run.missionId);
    if (mission) {
      if (mission.status === 'DRAFT') mission = work.transitionMission(mission, 'PLANNED');
      if (mission.status === 'PLANNED' && run.executionApproved) mission = work.transitionMission(mission, 'ACTIVE');
      const desired = run.status === 'READY_FOR_QA' ? 'VERIFYING' : run.status === 'CANCELLED' ? 'CANCELLED'
        : run.status === 'FAILED' ? 'FAILED' : run.paused || run.status === 'NEEDS_HUMAN' ? 'PAUSED' : run.executionApproved ? 'ACTIVE' : 'PLANNED';
      if (mission.status === 'PAUSED' && desired === 'VERIFYING') mission = work.transitionMission(mission, 'ACTIVE');
      if (mission.status !== desired && work.MISSION_TRANSITIONS[mission.status]?.has(desired)) mission = work.transitionMission(mission, desired, { reason: run.nextAction, actor: 'supervisor' });
      workStore.saveMission({ ...mission, activeRunId: run.id, contractRef: run.contractId, supervisorStatus: run.status });
    }
    for (const unit of run.units) workStore.saveWorkUnit({ ...work.createWorkUnit({ workUnitId: `${run.id}-${unit.id}`, runId: run.id, title: unit.objective,
      dependencies: unit.dependencies.map(id => `${run.id}-${id}`), status: unit.status, assignedWorker: unit.providerId || 'unassigned', attempt: unit.attempts }),
      supervisorRole: unit.role, ownedPaths: unit.ownedPaths, artifactRefs: unit.artifacts || [] });
  }
  function save(run) { run.updatedAt = iso(); persist(); mirror(run); }
  function event(run, type, message) {
    run.events.push(clean({ at: iso(), type, message: String(message).slice(0, 4000) }));
    if (run.events.length > 500) run.events.splice(0, run.events.length - 500);
    save(run);
  }
  function phase(run, status, message) {
    run.status = status; run.phase = status; run.nextAction = message || ''; event(run, 'phase', message || status);
  }
  function artifact(run, name, kind, content) {
    const id = `artifact-${randomUUID()}`;
    const dir = path.join(artifactsRoot, run.id);
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${id}.txt`);
    const text = redact(typeof content === 'string' ? content : JSON.stringify(clean(content), null, 2));
    if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error('Artifact exceeds 4 MB; manual collection required');
    fs.writeFileSync(target, text, { mode: 0o600, flag: 'wx' });
    const record = { id, name, kind, path: target, createdAt: iso() };
    run.artifacts.push(record); save(run); return record;
  }
  const providers = createProviderRegistry({ stateDir: path.join(stateDir, 'providers'), onEvent: () => {} });
  try {
    if (fs.existsSync(stateFile)) {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.runs)) throw new Error('Unsupported Supervisor state');
      for (const run of data.runs) {
        if (!SAFE_ID.test(run.id) || !Array.isArray(run.units) || !Array.isArray(run.events)) throw new Error('Invalid durable Supervisor record');
        runs.set(run.id, run);
        if (!terminal.has(run.status)) {
          run.paused = true; run.recoveryRequired = true; run.integrating = false;
          for (const unit of run.units) if (unit.status === 'RUNNING') unit.status = 'BLOCKED';
          if (run.approval?.status === 'pending') run.approval.status = 'expired';
          run.status = 'NEEDS_HUMAN'; run.phase = run.status;
          run.nextAction = 'Interrupted run preserved. Reconcile prior processes and external effects before explicitly resuming.';
        }
      }
      persist();
    }
  } catch (error) { recoveryError = `Supervisor state could not be loaded: ${error.message}`; }

  function get(id) { const run = runs.get(id); if (!run) throw Object.assign(new Error('Run not found'), { statusCode: 404 }); return run; }
  function approval(run) {
    const record = approvalQueue.request({ type: 'supervisor-local-execution', target: run.id, actor: 'dashboard',
      consequence: `Run local workers for ${run.repositoryPath} at ${run.baseline}. Allowed paths: ${run.units.filter(u => u.role === 'BODY').map(u => `${u.id}: ${u.ownedPaths.join(', ')}`).join('; ')}. Changes stay in managed worktrees. No push, publishing or production actions.` });
    run.approval = record; run.approvalHistory ||= []; run.approvalHistory.push(copy(record)); run.executionApproved = false;
    phase(run, 'WAITING_APPROVAL', record.consequence);
  }
  function ensureAction(run) { if (recoveryError) throw new Error(recoveryError); if (closing) throw new Error('Supervisor is shutting down'); if (terminal.has(run.status)) throw new Error('Run is terminal'); }
  function choose(run, unit) {
    const capacity = providers.snapshot().map(p => ({ ...p, runningJobs: Math.max(p.runningJobs,
      [...active.values()].filter(job => job.providerId === p.id).length) }));
    const selected = selectProvider(capacity, run, unit.role);
    if (!selected) return null;
    if (run.assignments[unit.role] && run.assignments[unit.role] !== selected.id) {
      unit.handoff = { from: run.assignments[unit.role], to: selected.id, objective: unit.objective, artifacts: unit.artifacts || [], reason: 'Previous provider unavailable', at: iso() };
      artifact(run, `${unit.id} provider handoff`, 'handoff', unit.handoff);
    }
    run.assignments[unit.role] = selected.id;
    return selected;
  }
  function neededUnits(run, unit) {
    const ids = new Set();
    const include = id => { if (ids.has(id)) return; ids.add(id); run.units.find(u => u.id === id)?.dependencies.forEach(include); };
    unit.dependencies.forEach(include);
    return run.units.filter(u => ids.has(u.id) && u.role === 'BODY');
  }
  async function workspace(run, unit) {
    if (unit.worktreePath) return unit.worktreePath;
    let base = run.baseline;
    const dependencies = neededUnits(run, unit);
    if (dependencies.length) {
      const snapshot = await worktrees.integrate({ runId: run.id, unitId: `deps-${unit.id}-${unit.attempts}`, repositoryPath: run.repositoryPath,
        baseline: run.baseline, workers: dependencies.map(u => ({ id: u.id, path: u.worktreePath, baseline: u.baseline, ownedPaths: u.ownedPaths })) });
      if (snapshot.conflicts.length) { run.conflicts = snapshot.conflicts; throw new Error('Dependency integration conflict'); }
      base = snapshot.commit;
    }
    const created = await worktrees.create({ runId: run.id, unitId: `${unit.id}-${unit.attempts}`, repositoryPath: run.repositoryPath, baseline: base });
    unit.worktreePath = created.path; unit.baseline = base; unit.branch = created.branch; save(run);
    return created.path;
  }
  async function dispatch(run, unit, selected) {
    const key = `${run.id}:${unit.id}`;
    unit.status = 'RUNNING'; unit.providerId = selected.id; unit.attempts += 1;
    active.set(key, { runId: run.id, unitId: unit.id, providerId: selected.id });
    try {
      phase(run, unit.role === 'HEAD' ? 'PLANNING' : unit.role === 'TAIL' ? 'REVIEWING' : unit.repairFindings ? 'REPAIRING' : 'RUNNING', `${selected.name} assigned to ${unit.id}`);
      const cwd = unit.role === 'TAIL' ? run.integration.path : await workspace(run, unit);
      if (closing || run.cancelRequested || run.status === 'CANCELLED') { unit.status = 'CANCELLED'; return; }
      const result = await providers.execute(selected.id, { runId: run.id, unitId: unit.id, role: unit.role, cwd, prompt: promptFor(run, unit), images: (run.context || []).filter(item => item.image).map(item => item.path), timeoutMs: 20 * 60 * 1000,
        onEvent: e => event(run, 'provider', typeof e === 'string' ? e : JSON.stringify(e)) });
      unit.result = clean({ runId: run.id, agentId: selected.id, role: unit.role, filesChanged: [], artifacts: [], reviewFindings: [],
        ...result, verification: { status: 'NOT_RUN', evidence: [] } });
      unit.artifacts ||= [];
      unit.artifacts.push(artifact(run, `${unit.id} result`, 'result', unit.result).id);
      if (run.status === 'CANCELLED' || run.cancelRequested || closing) { unit.status = 'CANCELLED'; return; }
      if (result.status !== 'completed') {
        if (result.status === 'rate_limited' && result.safeToRetry === true && unit.attempts < 3) {
          const changes = unit.role === 'BODY' ? await worktrees.collect({ path: unit.worktreePath, baseline: unit.baseline, ownedPaths: unit.ownedPaths }) : null;
          if (!changes || (!changes.hasChanges && !changes.violations.length)) {
            unit.status = 'PENDING'; unit.handoff = { reason: 'Native quota failure before tool execution', priorProvider: selected.id, artifacts: unit.artifacts, at: iso() };
            phase(run, 'WAITING_CAPACITY', 'Quota exhausted before execution. Waiting for an eligible provider or cooldown.'); return;
          }
        }
        unit.status = 'BLOCKED';
        phase(run, 'NEEDS_HUMAN', `${unit.id} ended ${result.status}. Artifacts preserved. Reconcile effects before retrying or switching providers.`);
        return;
      }
      if (unit.role === 'HEAD') {
        const planned = validatePlan(parseStructured(result), { single: run.executionMode === 'review' });
        unit.status = 'COMPLETED'; run.units.push(...planned); approval(run);
      } else if (unit.role === 'BODY') {
        const changes = await worktrees.collect({ path: unit.worktreePath, baseline: unit.baseline, ownedPaths: unit.ownedPaths });
        unit.result.filesChanged = changes.filesChanged; unit.result.commit = changes.commit;
        unit.artifacts.push(artifact(run, `${unit.id} changes`, 'change-manifest', { filesChanged: changes.filesChanged, violations: changes.violations }).id);
        unit.artifacts.push(artifact(run, `${unit.id} patch`, 'git-diff', changes.diff).id);
        workStore.saveEvidence(work.createEvidence({ missionId: run.missionId, runId: run.id, workUnitId: `${run.id}-${unit.id}`, kind: 'OUTPUT_CHECK', evidenceClass: 'VERIFIED',
          provenance: 'supervisor-git-collection', data: { filesChanged: changes.filesChanged, verification: 'NOT_RUN' } }));
        if (changes.violations.length) throw new Error(`Worker exceeded file ownership: ${JSON.stringify(changes.violations)}`);
        let output; try { output = parseStructured(result); } catch { output = null; }
        if (!output || output.blocked !== false || !changes.hasChanges) {
          unit.status = 'BLOCKED'; phase(run, 'NEEDS_HUMAN', `${unit.id}: ${!changes.hasChanges ? 'No workspace changes observed' : 'Worker completion needs reconciliation'}`); return;
        }
        unit.status = 'COMPLETED'; event(run, 'collected', `${unit.id}: ${changes.filesChanged.length} changed files collected; QA not run`);
      } else {
        const reviewedTree = await worktrees.inspect(run.integration.path);
        if (reviewedTree.dirty || reviewedTree.baseline !== run.integration.commit) throw new Error('Review changed the integration workspace; human reconciliation required');
        const report = parseStructured(result);
        if (!Array.isArray(report.findings) || report.findings.length > 100) throw new Error('Reviewer returned invalid findings');
        const bodyUnits = run.units.filter(u => u.role === 'BODY');
        for (const finding of report.findings) {
          if (!finding || !bodyUnits.some(u => u.id === finding.unitId) || typeof finding.message !== 'string' || finding.message.length > 4000 || typeof finding.file !== 'string') throw new Error('Reviewer findings need a responsible unit, file and bounded evidence');
        }
        unit.result.reviewFindings = clean(report.findings); unit.status = 'COMPLETED';
        if (!report.findings.length) finish(run);
        else if (run.repairRound >= MAX_REPAIR_ROUNDS) phase(run, 'NEEDS_HUMAN', 'Repair limit reached; inspect reviewer findings');
        else {
          run.repairRound += 1;
          for (const target of bodyUnits.filter(u => report.findings.some(f => f.unitId === u.id))) {
            target.previousResults ||= []; target.previousResults.push(target.result);
            target.repairFindings = clean(report.findings.filter(f => f.unitId === target.id));
            target.status = 'PENDING';
          }
          // Rebuild descendants on updated dependency snapshots, preserving old worktrees.
          for (const dependent of bodyUnits) if (dependent.status === 'COMPLETED' && neededUnits(run, dependent).some(u => u.status === 'PENDING')) {
            dependent.previousResults ||= []; dependent.previousResults.push(dependent.result);
            dependent.previousWorktrees ||= []; dependent.previousWorktrees.push(dependent.worktreePath);
            dependent.worktreePath = null; dependent.status = 'PENDING';
          }
          run.previousIntegrations ||= []; run.previousIntegrations.push(run.integration);
          run.integration = null;
          phase(run, 'REPAIRING', `Focused repair round ${run.repairRound} of ${MAX_REPAIR_ROUNDS}`);
        }
      }
    } catch (error) {
      if (run.status !== 'CANCELLED') { unit.status = 'BLOCKED'; run.error = redactSecrets(error.message); phase(run, 'NEEDS_HUMAN', run.error); }
    } finally { active.delete(key); save(run); }
  }
  function finish(run) {
    run.verification = { status: 'NOT_RUN', evidence: [] };
    phase(run, 'READY_FOR_QA', 'Implementation collected in the integration worktree. Independent QA and approval to apply changes to the original checkout are pending.');
    const handoff = work.createHandoff({ missionId: run.missionId, runId: run.id, fromWorkerId: 'supervisor', toWorkerId: 'independent-qa',
      stateSnapshot: { integration: run.integration, units: run.units.map(u => ({ id: u.id, status: u.status, artifacts: u.artifacts || [] })), verification: run.verification }, nextAction: run.nextAction });
    workStore.saveHandoff(handoff); artifact(run, 'QA handoff', 'handoff', handoff);
  }
  async function integrate(run) {
    run.integrating = true;
    try {
      phase(run, 'INTEGRATING', 'Collecting changes into a separate integration worktree');
      run.integrationAttempt = (run.integrationAttempt || 0) + 1;
      save(run);
      const output = await worktrees.integrate({ runId: run.id, unitId: `integration-${run.integrationAttempt}`, repositoryPath: run.repositoryPath, baseline: run.baseline,
        workers: run.units.filter(u => u.role === 'BODY').map(u => ({ id: u.id, path: u.worktreePath, baseline: u.baseline, ownedPaths: u.ownedPaths })) });
      run.integration = output; run.conflicts = output.conflicts;
      artifact(run, `Integration round ${run.repairRound}`, 'integration', output);
      if (run.status === 'CANCELLED' || run.cancelRequested || closing) return;
      if (output.conflicts.length) { phase(run, 'NEEDS_HUMAN', 'Integration conflicts require a scoped human decision'); return; }
      if (run.executionMode === 'single') finish(run);
      else run.units.push({ id: `review-${run.repairRound}`, objective: 'Review integrated implementation', role: 'TAIL', status: 'PENDING', dependencies: run.units.filter(u => u.role === 'BODY').map(u => u.id), ownedPaths: [], attempts: 0 });
    } catch (error) { if (run.status !== 'CANCELLED') { run.error = redactSecrets(error.message); phase(run, 'NEEDS_HUMAN', run.error); } }
    finally { run.integrating = false; save(run); }
  }
  async function tick() {
    if (ticking || closing || recoveryError) return;
    ticking = true;
    try {
      for (const run of runs.values()) {
        if (stopped(run) || run.integrating) continue;
        const running = [...active.values()].filter(a => a.runId === run.id).length;
        if (active.size >= 3 || running >= run.maxConcurrency) continue;
        if (os.freemem() < 512 * 1024 * 1024) { if (run.status !== 'WAITING_CAPACITY') phase(run, 'WAITING_CAPACITY', 'Waiting for at least 512 MB free memory'); continue; }
        const pending = run.units.filter(u => ['PENDING', 'READY'].includes(u.status));
        for (const unit of pending) {
          if (active.size >= 3 || [...active.values()].filter(a => a.runId === run.id).length >= run.maxConcurrency) break;
          if (!unit.dependencies.every(id => run.units.some(u => u.id === id && u.status === 'COMPLETED'))) continue;
          if (unit.role !== 'HEAD' && !run.executionApproved) continue;
          const selected = choose(run, unit);
          if (!selected) { if (!running && run.status !== 'WAITING_CAPACITY') phase(run, 'WAITING_CAPACITY', `No eligible provider for ${unit.role}. Check availability or change assignment.`); continue; }
          // Reserve synchronously before the first asynchronous workspace operation.
          void dispatch(run, unit, selected).catch(error => { run.error = redactSecrets(error.message); run.status = 'NEEDS_HUMAN'; run.paused = true; try { save(run); } catch {} });
        }
        if (!run.integration && run.executionApproved && ![...active.values()].some(a => a.runId === run.id)
          && run.units.some(u => u.role === 'BODY') && run.units.filter(u => u.role === 'BODY').every(u => u.status === 'COMPLETED')) void integrate(run);
      }
    } finally { ticking = false; }
  }
  timer = setInterval(() => { void tick().catch(() => {}); }, 1500); timer.unref();

  return {
    async providerList() { await providers.discover(); return providers.snapshot(); },
    configureProvider(id, input) { return providers.configure(id, input); },
    async contextCatalog() { return { items: await contextCatalog(), limits: CONTEXT_LIMITS }; },
    inspectProject(input) { return worktrees.inspect(input.repositoryPath, input.branch || ''); },
    config() { return { maxConcurrency: 3, maxRepairRounds: MAX_REPAIR_ROUNDS, projects: listProjects(), limitations: [
      'Independent QA is not run by Supervisor V1.', 'Git worktrees separate changes; they are not OS security sandboxes.',
      'WSL execution is unavailable until a separate reviewed adapter is configured. Windows paths are never translated automatically.',
      'Publishing, pushing, deployment, deletion and spending are not authorized by a local execution approval.',
      ...(recoveryError ? [recoveryError] : [])] }; },
    list() { return [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(run => ({ id: run.id, objective: run.objective, projectId: run.projectId,
      status: run.status, phase: run.phase, paused: run.paused, createdAt: run.createdAt, updatedAt: run.updatedAt })); },
    get(id) { return copy(get(id)); },
    async create(input) {
      if (recoveryError) throw new Error(recoveryError);
      if (closing || creation) throw new Error('Supervisor is busy creating a run; retry after it finishes');
      if (runs.size >= 200) throw new Error('Supervisor history limit reached; archive private state before creating more runs');
      if ([...runs.values()].filter(r => !terminal.has(r.status)).length >= 20) throw new Error('Maximum 20 open runs');
      creation = true;
      try {
        if (typeof input.objective !== 'string' || !input.objective.trim() || input.objective.length > 12000) throw new Error('Objective must contain 1 to 12000 characters');
        if (!['AUTO', 'MANUAL'].includes(input.mode || 'AUTO')) throw new Error('Invalid assignment mode');
        if (!['single', 'review', 'parallel'].includes(input.executionMode || 'review')) throw new Error('Invalid execution mode');
        const project = listProjects().find(p => p.id === input.projectId);
        const repositoryPath = input.repositoryPath || project?.repositoryPath;
        if (typeof repositoryPath !== 'string' || !path.isAbsolute(repositoryPath) || repositoryPath.length > 1024) throw new Error('Select an absolute repository path');
        const canonical = fs.realpathSync(repositoryPath);
        const access = isPathAllowed(canonical, { allowed_roots: [canonical] });
        if (!access.allowed) throw new Error(access.reason);
        if (input.newWorktree === false) throw new Error('Supervisor requires an isolated worktree');
        const inspected = await worktrees.inspect(canonical, input.branch || '');
        const contextEntries = prepareContext(input.context, input.context?.some(item => item?.catalogId) ? await contextCatalog() : []);
        if (inspected.dirty) throw new Error('Repository has uncommitted changes. Commit or preserve them before starting an isolated run; Supervisor will not discard them.');
        const available = await providers.discover();
        const assignments = {}, locks = {};
        for (const role of ROLES) {
          if (input.assignments?.[role] && !available.some(p => p.id === input.assignments[role])) throw new Error(`Unknown provider for ${role}`);
          assignments[role] = input.assignments?.[role] || null; locks[role] = input.locks?.[role] === true;
          if (locks[role] && !assignments[role]) throw new Error(`Locked ${role} requires a provider`);
          if (input.mode === 'MANUAL' && (input.executionMode !== 'single' || role === 'BODY') && !assignments[role]) throw new Error(`Manual assignment requires ${role}`);
        }
        const id = `sup-${randomUUID()}`;
        const projectId = input.projectId || `repo-${createHash('sha256').update(canonical.toLowerCase()).digest('hex').slice(0, 12)}`;
        if (!SAFE_ID.test(projectId)) throw new Error('Invalid project ID');
        const run = { id, objective: redactSecrets(input.objective.trim()), projectId, repositoryPath: inspected.repositoryPath, baseline: inspected.baseline,
          sourceBranch: inspected.branch, status: 'CREATED', phase: 'CREATED', mode: input.mode || 'AUTO', executionMode: input.executionMode || 'review', assignments, locks,
          maxConcurrency: clamp(input.maxConcurrency, 2, 1, 3), repairRound: 0, paused: false, executionApproved: false,
          context: saveContext(stateDir, id, contextEntries), newWorktree: true,
          units: [], artifacts: [], events: [], conflicts: [], createdAt: iso(), updatedAt: iso(), verification: { status: 'NOT_RUN', evidence: [] } };
        const mission = workStore.saveMission(work.createMission({ projectId, title: run.objective.slice(0, 160), goal: run.objective }));
        run.missionId = mission.missionId;
        const contract = workStore.saveWorkContract(work.createWorkContract({ missionId: run.missionId, objective: run.objective, scope: [canonical],
          exclusions: ['push', 'publish', 'deploy', 'spend', 'production-database', 'user-data-deletion'], authorizedCapabilities: ['read-only-planning'], requiredEvidence: ['EXECUTION', 'OUTPUT_CHECK'] }));
        run.contractId = contract.contractId;
        workStore.saveRun(work.createRun({ runId: id, missionId: run.missionId, contractId: run.contractId, workerId: 'supervisor' }));
        if (run.executionMode === 'single') run.units = validatePlan({ units: [{ id: 'unit-1', objective: run.objective, ownedPaths: ['.'], dependencies: [] }] });
        else run.units = [{ id: 'plan', objective: 'Plan authorized task', role: 'HEAD', status: 'PENDING', dependencies: [], ownedPaths: [], attempts: 0 }];
        runs.set(id, run); save(run);
        if (run.executionMode === 'single') approval(run); else phase(run, 'READY', 'Queued for read-only planning');
        return copy(run);
      } finally { creation = false; }
    },
    async action(id, action, input = {}) {
      const run = get(id); ensureAction(run);
      if (action === 'pause') { run.paused = true; event(run, 'pause', 'Scheduling paused; existing workers may finish'); }
      else if (action === 'cancel') {
        run.paused = true; run.cancelRequested = true;
        phase(run, 'NEEDS_HUMAN', 'Stopping owned workers. Worktrees and artifacts retained.');
        try {
          const cancellation = await providers.cancel(id);
          if (cancellation?.retained || cancellation?.errors?.length) throw new Error('One or more owned processes have not confirmed cancellation');
        }
        catch (error) { run.error = redact(error.message); phase(run, 'NEEDS_HUMAN', 'Worker cancellation could not be confirmed. Inspect process ownership before continuing.'); throw error; }
        for (const unit of run.units) if (unit.status !== 'COMPLETED') unit.status = 'CANCELLED';
        phase(run, 'CANCELLED', 'Owned worker cancellation completed. Worktrees and artifacts retained.');
      } else if (action === 'resume') {
        if ([...active.values()].some(a => a.runId === id)) throw new Error('Wait for active workers to settle before resuming');
        if (run.status === 'NEEDS_HUMAN' && input.reconcile !== true) throw new Error('Explicit reconciliation confirmation is required before retry');
        if (run.conflicts.length) throw new Error('Integration conflicts are preserved. Start a new scoped run after resolving the source changes.');
        if (run.repairRound >= MAX_REPAIR_ROUNDS && run.units.some(u => u.role === 'TAIL' && u.status === 'COMPLETED' && u.result?.reviewFindings?.length)) throw new Error('Repair budget exhausted. Create a focused follow-up task using the retained findings.');
        const reconciliation = await providers.reconcile?.(id);
        if (reconciliation && reconciliation.status !== 'RECONCILED') throw new Error(reconciliation.diagnostic || 'Prior provider process ownership is still unknown');
        for (const unit of run.units) if (unit.status === 'BLOCKED') {
          if (unit.attempts >= 3) throw new Error('Retry limit reached; create a new scoped task');
          unit.handoff = { priorResult: unit.result || null, artifacts: unit.artifacts || [], reconciliation: 'human-confirmed', at: iso() };
          unit.status = 'PENDING';
        }
        run.paused = false; run.error = null; run.recoveryRequired = false; run.cancelRequested = false;
        if (run.integration && run.units.filter(u => u.role === 'BODY').every(u => u.status === 'COMPLETED') && !run.units.some(u => u.role === 'TAIL' && u.status !== 'COMPLETED')) {
          run.previousIntegrations ||= []; run.previousIntegrations.push(run.integration); run.integration = null;
        }
        if (!run.executionApproved && run.units.some(u => u.role === 'BODY')) approval(run);
        else phase(run, 'READY', 'Resumed after human reconciliation');
      } else if (action === 'approval') {
        if (run.status !== 'WAITING_APPROVAL' || run.approval?.status !== 'pending') throw new Error('No pending execution approval');
        if (!['approved', 'rejected'].includes(input.decision)) throw new Error('Invalid approval decision');
        run.approval = approvalQueue.decide(run.approval.id, { decision: input.decision, actor: 'dashboard-human' });
        run.approvalHistory ||= []; run.approvalHistory.push(copy(run.approval));
        if (input.decision === 'rejected') { run.paused = true; phase(run, 'NEEDS_HUMAN', 'Local execution was rejected'); }
        else {
          const granted = approvalQueue.authorize(run.approval.id, { type: 'supervisor-local-execution', target: id, actor: 'supervisor' });
          if (!granted.allowed) throw new Error('Execution approval expired or mismatched');
          run.approval = approvalQueue.get(run.approval.id); run.executionApproved = true;
          run.approvalHistory.push(copy(run.approval));
          const contract = workStore.getWorkContract(run.contractId);
          workStore.saveWorkContract({ ...contract, status: 'APPROVED', approvedBy: 'dashboard-human', approvedAt: iso(), authorizedCapabilities: ['read-only-planning', 'managed-worktree-write', 'managed-integration'] });
          phase(run, 'READY', 'Local execution approved');
        }
      } else if (action === 'reassign') {
        if (!ROLES.includes(input.role)) throw new Error('Invalid role');
        if (run.units.some(u => u.role === input.role && u.status === 'RUNNING')) throw new Error('Pause and wait for the active worker before changing its provider');
        await providers.discover();
        const selected = selectProvider(providers.snapshot(), { ...run, assignments: { ...run.assignments, [input.role]: input.providerId }, locks: { ...run.locks, [input.role]: true } }, input.role);
        if (!selected) throw new Error('Replacement provider is not eligible for this role');
        artifact(run, 'Manual provider handoff', 'handoff', { role: input.role, from: run.assignments[input.role], to: selected.id, objective: run.objective, at: iso() });
        run.assignments[input.role] = selected.id; event(run, 'reassign', `${input.role} assigned to ${selected.name}; role lock preserved`);
      } else throw new Error('Unknown run action');
      return copy(run);
    },
    readArtifact(runId, artifactId) {
      const run = get(runId); const entry = run.artifacts.find(a => a.id === artifactId);
      if (!entry) throw Object.assign(new Error('Artifact not found'), { statusCode: 404 });
      const target = fs.realpathSync(entry.path), allowed = fs.realpathSync(path.join(artifactsRoot, runId));
      const relative = path.relative(allowed, target);
      if (relative.startsWith('..') || path.isAbsolute(relative) || fs.statSync(target).size > 4 * 1024 * 1024) throw new Error('Artifact outside allowed scope');
      return { artifact: entry, content: fs.readFileSync(target, 'utf8') };
    },
    async shutdown() {
      closing = true; clearInterval(timer);
      for (const run of runs.values()) if (!terminal.has(run.status)) { run.paused = true; phase(run, 'NEEDS_HUMAN', 'Application stopped; reconcile interrupted work before resuming'); }
      await providers.shutdown();
      const deadline = Date.now() + 10000;
      while ((active.size || [...runs.values()].some(run => run.integrating)) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      if (active.size || [...runs.values()].some(run => run.integrating)) throw new Error('Supervisor still has unsettled operations; ownership record retained for recovery');
      // Only this live owner can release the runtime lease.
      if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid === process.pid) fs.unlinkSync(lockPath);
    },
  };
}
