import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRuntimeManifest } from '../lib/runtime-manifest.mjs';

describe('runtime-manifest', () => {
  let tmpDir;
  let manifestManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-test-'));
    manifestManager = createRuntimeManifest(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detectInstallationState returns fresh when dir does not exist', () => {
    const notExistDir = path.join(tmpDir, 'not-exist');
    const mgr = createRuntimeManifest(notExistDir);
    assert.strictEqual(mgr.detectInstallationState(), 'fresh');
  });

  it('detectInstallationState returns fresh when dir exists but empty', () => {
    assert.strictEqual(manifestManager.detectInstallationState(), 'fresh');
  });

  it('detectInstallationState returns partial when dir has files but no manifest', () => {
    fs.writeFileSync(path.join(tmpDir, 'some-file.txt'), 'hello');
    assert.strictEqual(manifestManager.detectInstallationState(), 'partial');
  });

  it('detectInstallationState returns legacy when dir has old config files', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}');
    assert.strictEqual(manifestManager.detectInstallationState(), 'legacy');
  });

  it('creates manifest', () => {
    const data = manifestManager.create({
      mode: 'installed',
      platform: 'win32',
      architecture: 'x64',
      applicationVersion: '1.0.0',
      vaultPath: '/vault'
    });

    assert.strictEqual(data.mode, 'installed');
    assert.ok(data.installationId);
    assert.strictEqual(data.vaultPath, '/vault');
    assert.ok(manifestManager.exists());
  });

  it('reads manifest', () => {
    manifestManager.create({ mode: 'test' });
    const data = manifestManager.read();
    assert.ok(data);
    assert.strictEqual(data.mode, 'test');
  });

  it('returns null on read if corrupted', () => {
    fs.writeFileSync(path.join(tmpDir, 'runtime-manifest.json'), '{ invalid json }');
    assert.strictEqual(manifestManager.read(), null);
    assert.strictEqual(manifestManager.detectInstallationState(), 'corrupted');
  });

  it('updates manifest', () => {
    manifestManager.create({ mode: 'test' });
    const updated = manifestManager.update({ bootstrapCompleted: true });
    assert.strictEqual(updated.bootstrapCompleted, true);

    const data = manifestManager.read();
    assert.strictEqual(data.bootstrapCompleted, true);
  });

  it('validates manifest', () => {
    manifestManager.create({
      mode: 'installed',
      platform: 'win32',
      architecture: 'x64',
      applicationVersion: '1.0.0',
      vaultPath: '/vault'
    });
    const validation = manifestManager.validate();
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  it('detects existing state', () => {
    manifestManager.create({
      mode: 'installed',
      platform: 'win32',
      architecture: 'x64',
      applicationVersion: '1.0.0',
      vaultPath: '/vault'
    });
    assert.strictEqual(manifestManager.detectInstallationState(), 'existing');
  });

  it('detects portable state', () => {
    manifestManager.create({
      mode: 'portable',
      platform: 'win32',
      architecture: 'x64',
      applicationVersion: '1.0.0',
      vaultPath: '/vault'
    });
    assert.strictEqual(manifestManager.detectInstallationState(), 'portable');
  });

  it('detects development state', () => {
    manifestManager.create({
      mode: 'development',
      platform: 'win32',
      architecture: 'x64',
      applicationVersion: '1.0.0',
      vaultPath: '/vault'
    });
    assert.strictEqual(manifestManager.detectInstallationState(), 'development');
  });

  it('uses atomic writes (does not leave tmp file)', () => {
    manifestManager.create({ mode: 'test' });
    assert.strictEqual(fs.existsSync(path.join(tmpDir, 'runtime-manifest.json.tmp')), false);
  });
});
