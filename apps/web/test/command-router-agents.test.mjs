import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We test the command router's /agents and /rempeyek-status commands
// by importing the unified command router directly.
import { createUnifiedCommandRouter } from '../lib/unified-command-router.mjs';

describe('/agents command', () => {
  let tmpDir;
  let router;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-agents-test-'));
    const env = {
      LOCALAPPDATA: tmpDir,
      USERPROFILE: tmpDir,
      AGENT_STATE_DIR: path.join(tmpDir, 'state')
    };
    router = createUnifiedCommandRouter({ env, agents: [] });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty node list on /agents status', async () => {
    const resp = await router.executeCommand({ command: '/agents', operation: 'status' });
    assert.strictEqual(resp.success, true);
    assert.ok(Array.isArray(resp.result.nodes));
  });

  it('should discover agents from home directory', async () => {
    // Create a fake .gemini dir
    fs.mkdirSync(path.join(tmpDir, '.gemini'), { recursive: true });
    const resp = await router.executeCommand({ command: '/agents', operation: 'discover' });
    assert.strictEqual(resp.success, true);
    assert.ok(resp.result.discovered.length > 0);
    const gemini = resp.result.discovered.find(d => d.provider === 'gemini');
    assert.ok(gemini, 'Should discover .gemini directory');
    assert.strictEqual(gemini.path, path.join(tmpDir, '.gemini'));
  });

  it('should register a new agent', async () => {
    const resp = await router.executeCommand({
      command: '/agents',
      operation: 'register',
      arguments: { agentId: 'test-agent', name: 'Test Agent', provider: 'claude' }
    });
    assert.strictEqual(resp.success, true);
    assert.strictEqual(resp.result.registered.agent_id, 'test-agent');
    assert.ok(resp.result.registered.node_id.startsWith('Node-'));
  });

  it('should require agentId for register', async () => {
    const resp = await router.executeCommand({
      command: '/agents',
      operation: 'register',
      arguments: {}
    });
    assert.strictEqual(resp.success, false);
    assert.ok(resp.error.includes('agentId'));
  });

  it('should enable and disable agents', async () => {
    // First register
    await router.executeCommand({
      command: '/agents',
      operation: 'register',
      arguments: { agentId: 'toggle-agent', name: 'Toggle', provider: 'gemini' }
    });

    // Disable
    const disableResp = await router.executeCommand({
      command: '/agents',
      operation: 'disable',
      arguments: { nodeId: 'Node-1' }
    });
    assert.strictEqual(disableResp.success, true);
    assert.strictEqual(disableResp.result.status, 'inactive');

    // Enable
    const enableResp = await router.executeCommand({
      command: '/agents',
      operation: 'enable',
      arguments: { nodeId: 'Node-1' }
    });
    assert.strictEqual(enableResp.success, true);
    assert.strictEqual(enableResp.result.status, 'active');
  });

  it('should return health for registered agents', async () => {
    await router.executeCommand({
      command: '/agents',
      operation: 'register',
      arguments: { agentId: 'health-agent', name: 'Health Test' }
    });
    const resp = await router.executeCommand({ command: '/agents', operation: 'health' });
    assert.strictEqual(resp.success, true);
    assert.ok(resp.result.nodes.length > 0);
    assert.ok(resp.result.nodes[0].node_id);
    assert.ok(['ok', 'missing'].includes(resp.result.nodes[0].identity));
  });
});

describe('/rempeyek-status command', () => {
  let tmpDir;
  let router;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-status-test-'));
    const env = {
      LOCALAPPDATA: tmpDir,
      USERPROFILE: tmpDir,
      AGENT_STATE_DIR: path.join(tmpDir, 'state')
    };
    router = createUnifiedCommandRouter({ env, agents: [] });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return comprehensive status', async () => {
    const resp = await router.executeCommand({ command: '/rempeyek-status' });
    assert.strictEqual(resp.success, true);
    const s = resp.result;
    assert.ok(s.application);
    assert.ok(s.runtime);
    assert.ok(s.vault);
    assert.ok(s.agents);
    assert.ok(s.skills !== undefined);
    assert.ok(s.memory !== undefined);
    assert.ok(s.graphify !== undefined);
    assert.ok(s.security !== undefined);
  });

  it('should report uninitialized runtime without manifest', async () => {
    const resp = await router.executeCommand({ command: '/rempeyek-status' });
    assert.strictEqual(resp.result.runtime.status, 'uninitialized');
  });
});
