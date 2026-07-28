import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildUnifiedMemoryGraph } from '../lib/unified-memory-graph.mjs';

describe('Unified Memory Graph', () => {
  let tmpDir;
  let vaultPath;
  let configDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-mem-test-'));
    vaultPath = path.join(tmpDir, 'Vault');
    configDir = path.join(tmpDir, 'Config');
    fs.mkdirSync(vaultPath, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should build unified graph with valid schema version', () => {
    const graph = buildUnifiedMemoryGraph({ vaultPath, rootDir: tmpDir, configDir });
    assert.strictEqual(graph.schemaVersion, 1);
    assert.ok(graph.generatedAt);
    assert.ok(graph.sourceRevision);
    assert.ok(Array.isArray(graph.nodes));
    assert.ok(Array.isArray(graph.edges));
    assert.ok(graph.stats);
    assert.ok(graph.health);
  });

  it('should include vault notes in graph', () => {
    fs.writeFileSync(path.join(vaultPath, 'TestNote.md'), '# Test Note\n[[TargetNote]]\n', 'utf8');
    fs.writeFileSync(path.join(vaultPath, 'TargetNote.md'), '# Target Note\n', 'utf8');

    const graph = buildUnifiedMemoryGraph({ vaultPath, rootDir: tmpDir, configDir });
    const testNode = graph.nodes.find(n => n.id === 'TestNote.md');
    const targetNode = graph.nodes.find(n => n.id === 'TargetNote.md');

    assert.ok(testNode, 'TestNote node should exist');
    assert.ok(targetNode, 'TargetNote node should exist');
    assert.strictEqual(testNode.type, 'vault-note');
  });

  it('should include AI Family agent nodes from registry', () => {
    const familyDir = path.join(vaultPath, 'System', 'AI-Family');
    fs.mkdirSync(familyDir, { recursive: true });
    fs.writeFileSync(
      path.join(familyDir, 'family-registry.json'),
      JSON.stringify({
        nodes: [
          { node_id: 'Node-1', agent_id: 'claude-sub', display_name: 'Claude Agent', provider: 'claude', status: 'active' }
        ]
      }, null, 2),
      'utf8'
    );

    const graph = buildUnifiedMemoryGraph({ vaultPath, rootDir: tmpDir, configDir });
    const agentNode = graph.nodes.find(n => n.id === 'Agent:Node-1');
    assert.ok(agentNode, 'Agent node should exist');
    assert.strictEqual(agentNode.type, 'agent');
    assert.strictEqual(agentNode.label, 'Claude Agent');
  });

  it('should include project nodes from project registry', () => {
    const projDir = path.join(vaultPath, 'System');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(
      path.join(projDir, 'project-registry.json'),
      JSON.stringify({
        projects: [
          { project_id: 'p1', name: 'Project One', source_path: tmpDir, indexing_enabled: true }
        ]
      }, null, 2),
      'utf8'
    );

    const graph = buildUnifiedMemoryGraph({ vaultPath, rootDir: tmpDir, configDir });
    const projNode = graph.nodes.find(n => n.id === 'Project:p1');
    assert.ok(projNode, 'Project node should exist');
    assert.strictEqual(projNode.type, 'project');
  });

  it('should include session nodes from Vault/Sessions', () => {
    const activeDir = path.join(vaultPath, 'Sessions', 'Active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(
      path.join(activeDir, 'sess-123.json'),
      JSON.stringify({ session_id: 'sess-123', node_id: 'Node-1', started_at: new Date().toISOString(), status: 'active' }),
      'utf8'
    );

    const graph = buildUnifiedMemoryGraph({ vaultPath, rootDir: tmpDir, configDir });
    const sessNode = graph.nodes.find(n => n.id === 'Session:sess-123');
    assert.ok(sessNode, 'Session node should exist');
    assert.strictEqual(sessNode.type, 'session');
  });

  it('should include shared memory nodes from Vault/Memory/Shared/index.json', () => {
    const sharedDir = path.join(vaultPath, 'Memory', 'Shared');
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.writeFileSync(
      path.join(sharedDir, 'index.json'),
      JSON.stringify({
        memories: [
          { memory_id: 'mem-1', title: 'Architecture Standard', type: 'standard', status: 'active', confidence: 'verified' }
        ]
      }, null, 2),
      'utf8'
    );

    const graph = buildUnifiedMemoryGraph({ vaultPath, rootDir: tmpDir, configDir });
    const memNode = graph.nodes.find(n => n.id === 'Memory:mem-1');
    assert.ok(memNode, 'Shared memory node should exist');
    assert.strictEqual(memNode.type, 'shared-memory');
  });

  it('should project repo source files under Repo/', () => {
    const appsDir = path.join(tmpDir, 'apps', 'web');
    fs.mkdirSync(appsDir, { recursive: true });
    fs.writeFileSync(path.join(appsDir, 'index.js'), 'console.log("test");', 'utf8');

    const graph = buildUnifiedMemoryGraph({ vaultPath, rootDir: tmpDir, configDir });
    const codeNode = graph.nodes.find(n => n.id === 'Repo/apps/web/index.js');
    assert.ok(codeNode, 'Repo source node should exist');
    assert.strictEqual(codeNode.type, 'application-module');
    assert.strictEqual(codeNode.scope, 'source');
  });
});
