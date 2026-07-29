import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { resolveCanonicalPath, getDefaultSystemPaths, isPathAllowed, redactSecrets } from '../lib/access-policy-engine.mjs';
import { initializeAIFamilyRegistry } from '../lib/ai-family-registry.mjs';
import { createSharedMemoryEngine } from '../lib/shared-memory-engine.mjs';
import { createSkillsSyncEngine } from '../lib/skills-sync-engine.mjs';
import { createGraphifyUnifiedEngine } from '../lib/graphify-unified-engine.mjs';
import { createUnifiedCommandRouter } from '../lib/unified-command-router.mjs';
import { initializeHypertaksUnifiedSystem } from '../lib/hypertaks-unified-system.mjs';

test('access-policy-engine resolves paths, enforces denylist, and redacts secrets', () => {
  const paths = getDefaultSystemPaths();
  assert.ok(paths.runtimeRoot);
  assert.ok(paths.sharedVault);

  const sshCheck = isPathAllowed(path.join(paths.home, '.ssh', 'id_rsa'));
  assert.equal(sshCheck.allowed, false);

  const safeCheck = isPathAllowed(path.join(paths.runtimeRoot, 'Vault', '00-Inbox', 'test.md'));
  assert.equal(safeCheck.allowed, true);

  const redacted = redactSecrets('my password: "secret-123" and sk-12345678901234567890123456789012');
  assert.ok(redacted.includes('[REDACTED]'));
  assert.ok(redacted.includes('[REDACTED_API_KEY]'));
});

test('ai-family-registry assigns deterministic Node-IDs and creates directory structure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-family-test-'));
  try {
    const vaultPath = path.join(tmpDir, 'Vault');
    const agentsDir = path.join(tmpDir, 'Agents');

    const agents = [
      { id: 'hermes', name: 'Hermes', role: 'Crypto Agent' },
      { id: 'claude-code', name: 'Claude Code', role: 'Coding Specialist' }
    ];

    const registry = initializeAIFamilyRegistry({ vaultPath, agentsDir, agents });
    assert.equal(registry.nodes.length, 2);
    assert.equal(registry.nodes[0].node_id, 'Node-1');
    assert.equal(registry.nodes[1].node_id, 'Node-2');

    assert.ok(fs.existsSync(path.join(vaultPath, 'System', 'AI-Family', 'family-registry.json')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'System', 'AI-Family', 'AI-Family.md')));
    assert.ok(fs.existsSync(path.join(agentsDir, 'Node-1', 'identity.json')));
    assert.ok(fs.existsSync(path.join(agentsDir, 'Node-2', 'identity.json')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('shared-memory-engine manages session lifecycle and handoffs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-memory-test-'));
  try {
    const vaultPath = path.join(tmpDir, 'Vault');
    const agentsDir = path.join(tmpDir, 'Agents');

    const sharedMemory = createSharedMemoryEngine({ vaultPath, agentsDir });

    const session = sharedMemory.startSession({
      nodeId: 'Node-1',
      agentId: 'hermes',
      taskId: 'task-101',
      taskSummary: 'Implement unified memory'
    });

    assert.ok(session.session_id);
    assert.equal(session.node_id, 'Node-1');
    assert.ok(fs.existsSync(path.join(vaultPath, 'Sessions', 'Active', `${session.session_id}.json`)));

    sharedMemory.recordDecision(session.session_id, { title: 'Use JSON L', rationale: 'For fast parsing' });

    const { session: endedSession, handoffPath } = sharedMemory.endSession(session.session_id, {
      status: 'completed',
      completedSummary: 'Successfully implemented unified memory',
      nextAction: 'Sync skills'
    });

    assert.equal(endedSession.status, 'completed');
    assert.ok(fs.existsSync(handoffPath));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Sessions', 'Completed', `${session.session_id}.json`)));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('skills-sync-engine discovers, matches capabilities, and syncs skills', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-skills-test-'));
  try {
    const warehouseDir = path.join(tmpDir, '.skills');
    const vaultPath = path.join(tmpDir, 'Vault');
    const agentsDir = path.join(tmpDir, 'Agents');

    // Create a mock skill in warehouse
    const mockSkillDir = path.join(warehouseDir, 'mock-skill');
    fs.mkdirSync(mockSkillDir, { recursive: true });
    fs.writeFileSync(path.join(mockSkillDir, 'SKILL.md'), '---\nname: mock-skill\ndescription: Mock skill for testing\ncapabilities: [coding]\n---\n', 'utf8');

    const skillsEngine = createSkillsSyncEngine({ centralWarehouseDir: warehouseDir, vaultPath, agentsDir });
    const discovered = skillsEngine.discoverWarehouseSkills();
    assert.equal(discovered.length, 1);
    assert.equal(discovered[0].skill_id, 'mock-skill');
    assert.equal(discovered[0].trust_status, 'unreviewed');

    // Unreviewed skills must NOT sync
    const initialSync = skillsEngine.syncSkillsToNodes({
      nodes: [{ node_id: 'Node-1', capabilities: ['coding'] }]
    });
    assert.strictEqual(initialSync.assignments['Node-1'].includes('mock-skill'), false);
    assert.strictEqual(fs.existsSync(path.join(agentsDir, 'Node-1', 'skills', 'mock-skill', 'SKILL.md')), false);

    // Review skill to trusted
    const reviewed = skillsEngine.reviewSkill('mock-skill', 'trusted');
    assert.equal(reviewed.trust_status, 'trusted');

    // Now trusted skill syncs cleanly
    const trustedSync = skillsEngine.syncSkillsToNodes({
      nodes: [{ node_id: 'Node-1', capabilities: ['coding'] }]
    });
    assert.ok(trustedSync.assignments['Node-1'].includes('mock-skill'));
    assert.ok(fs.existsSync(path.join(agentsDir, 'Node-1', 'skills', 'mock-skill', 'SKILL.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('graphify-unified-engine registers projects, indexes documents, and builds reports', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-graphify-test-'));
  try {
    const vaultPath = path.join(tmpDir, 'Vault');
    const graphifyEngine = createGraphifyUnifiedEngine({ vaultPath });
    graphifyEngine.initializeGraph();

    // Create mock project files
    const projDir = path.join(tmpDir, 'mock-project');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'README.md'), '# Mock Project', 'utf8');

    graphifyEngine.registerProject({
      projectId: 'mock-project',
      name: 'Mock Project',
      sourcePath: projDir
    });

    const scanResult = graphifyEngine.scanProject('mock-project');
    assert.ok(scanResult.totalNodes >= 2);
    assert.ok(fs.existsSync(path.join(vaultPath, 'Graph', 'Reports', 'GRAPH_REPORT.md')));
    assert.ok(fs.existsSync(path.join(vaultPath, '.graphify', 'graph.json')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('unified-command-router executes /obsidian, /obsidian-vault, /shared-memory, /graphify, and /skills', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-router-test-'));
  try {
    const env = { ...process.env, AGENT_STATE_DIR: path.join(tmpDir, 'Rempeyek-Agent-OS') };
    const router = createUnifiedCommandRouter({ env, agents: [{ id: 'hermes', name: 'Hermes' }] });

    const resObsidian = await router.executeCommand({ command: '/obsidian' });
    assert.equal(resObsidian.success, true);

    const resVault = await router.executeCommand({ command: '/obsidian-vault', operation: 'status' });
    assert.equal(resVault.success, true);

    const resMemory = await router.executeCommand({ command: '/shared-memory', operation: 'read' });
    assert.equal(resMemory.success, true);

    const resGraphify = await router.executeCommand({ command: '/graphify', operation: 'status' });
    assert.equal(resGraphify.success, true);

    const resSkills = await router.executeCommand({ command: '/skills', operation: 'discover' });
    assert.equal(resSkills.success, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('initializeHypertaksUnifiedSystem bootstraps full Rempeyek Agent OS environment', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-bootstrap-test-'));
  try {
    const env = { ...process.env, AGENT_STATE_DIR: path.join(tmpDir, 'Rempeyek-Agent-OS') };
    const system = initializeHypertaksUnifiedSystem({ env, agents: [{ id: 'hermes', name: 'Hermes' }] });

    assert.ok(fs.existsSync(system.paths.sharedVault));
    assert.ok(fs.existsSync(system.paths.agentsRuntimeState));
    assert.ok(fs.existsSync(path.join(system.paths.sharedVault, 'System', 'AI-Family', 'family-registry.json')));
    assert.ok(fs.existsSync(path.join(system.paths.systemConfig, 'access-policy.json')));

    const health = system.getVaultHealth();
    assert.equal(health.exists, true);
    assert.equal(health.writable, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
