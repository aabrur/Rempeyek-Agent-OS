import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as migration002 from '../lib/migrations/002-unified-memory-neural-fabric.mjs';

describe('Desktop Update Migration 002', () => {
  let tmpDir;
  let vaultPath;
  let configDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-002-test-'));
    vaultPath = path.join(tmpDir, 'Vault');
    configDir = path.join(tmpDir, 'Config');
    fs.mkdirSync(vaultPath, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should have correct version metadata', () => {
    assert.strictEqual(migration002.version, 2);
    assert.strictEqual(migration002.reversible, true);
    assert.ok(migration002.description);
  });

  it('should create required directory structure on up()', async () => {
    const result = await migration002.up({ configDir, vaultPath });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.version, 2);

    assert.ok(fs.existsSync(path.join(vaultPath, 'Memory', 'Shared')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Sessions', 'Active')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Sessions', 'Completed')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Sessions', 'Interrupted')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Graph', 'Indexes')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'System', 'AI-Family')));
  });

  it('should update manifest version on up()', async () => {
    const manifestPath = path.join(configDir, 'runtime-manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ applicationVersion: '2.2.3', runtimeSchemaVersion: 1 }, null, 2),
      'utf8'
    );

    await migration002.up({ configDir, vaultPath });

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(updated.applicationVersion, '2.3.4');
    assert.strictEqual(updated.runtimeSchemaVersion, 2);
  });

  it('should validate migration state', async () => {
    await migration002.up({ configDir, vaultPath });
    const validation = await migration002.validate({ configDir, vaultPath });
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  it('should perform safe rollback on down() without deleting user notes', async () => {
    const manifestPath = path.join(configDir, 'runtime-manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ applicationVersion: '2.2.3', runtimeSchemaVersion: 1 }, null, 2),
      'utf8'
    );

    const userNotePath = path.join(vaultPath, 'MyImportantNote.md');
    fs.writeFileSync(userNotePath, '# My Note\nImportant user data', 'utf8');

    const obsidianDir = path.join(vaultPath, '.obsidian');
    fs.mkdirSync(obsidianDir, { recursive: true });
    fs.writeFileSync(path.join(obsidianDir, 'workspace.json'), '{}', 'utf8');

    await migration002.up({ configDir, vaultPath });
    const downResult = await migration002.down({ configDir, vaultPath });

    assert.strictEqual(downResult.success, true);
    assert.ok(fs.existsSync(userNotePath), 'User note MUST remain intact after rollback');
    assert.ok(fs.existsSync(obsidianDir), '.obsidian MUST remain intact after rollback');

    const restoredManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(restoredManifest.memorySchemaVersion, 1);
    assert.strictEqual(restoredManifest.graphSchemaVersion, 1);
  });
});
