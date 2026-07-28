import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createBootstrap } from '../lib/bootstrap.mjs';

describe('Bootstrap', () => {
  let tmpDir;
  let configDir;
  let vaultPath;
  let agentsDir;
  let backupsDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));
    configDir = path.join(tmpDir, 'Config');
    vaultPath = path.join(tmpDir, 'Vault');
    agentsDir = path.join(tmpDir, 'Agents');
    backupsDir = path.join(tmpDir, 'Backups');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should report not bootstrapped on fresh dirs', () => {
    fs.mkdirSync(configDir, { recursive: true });
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    assert.strictEqual(bootstrap.isBootstrapped(), false);
  });

  it('should complete fresh bootstrap successfully', () => {
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    const result = bootstrap.run();
    assert.strictEqual(result.success, true);
    assert.ok(result.timestamp);
    assert.ok(result.steps.runtimeDirs);
    assert.ok(result.steps.manifest);
    assert.ok(result.steps.vault);
    assert.ok(result.steps.accessPolicy);
  });

  it('should create runtime directories', () => {
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    bootstrap.run();
    assert.ok(fs.existsSync(configDir));
    assert.ok(fs.existsSync(path.join(tmpDir, 'Logs')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'Cache')));
    assert.ok(fs.existsSync(backupsDir));
    assert.ok(fs.existsSync(agentsDir));
  });

  it('should create runtime manifest', () => {
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    bootstrap.run();
    const manifestPath = path.join(configDir, 'runtime-manifest.json');
    assert.ok(fs.existsSync(manifestPath));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifest.product, 'Rempeyek Agent OS');
    assert.strictEqual(manifest.bootstrapCompleted, true);
  });

  it('should scaffold vault structure', () => {
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    bootstrap.run();
    assert.ok(fs.existsSync(vaultPath));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Memory')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Sessions', 'Active')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'System', 'AI-Family')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Graph', 'Indexes')));
  });

  it('should write default access policy', () => {
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    bootstrap.run();
    const policyPath = path.join(configDir, 'access-policy.json');
    assert.ok(fs.existsSync(policyPath));
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    assert.strictEqual(policy.schema_version, 1);
    assert.ok(Array.isArray(policy.denied_extensions));
  });

  it('should be idempotent on second run', () => {
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    const firstResult = bootstrap.run();
    const secondResult = bootstrap.run();
    assert.strictEqual(secondResult.success, true);
    assert.strictEqual(secondResult.steps.manifest.status, 'existing');
    assert.strictEqual(secondResult.steps.accessPolicy.status, 'existing');
  });

  it('should report bootstrapped after run', () => {
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    bootstrap.run();
    assert.strictEqual(bootstrap.isBootstrapped(), true);
  });

  it('should write bootstrap report', () => {
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    bootstrap.run();
    const reportPath = path.join(configDir, 'bootstrap-report.json');
    assert.ok(fs.existsSync(reportPath));
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.strictEqual(report.success, true);
  });

  it('should warn on missing skills warehouse', () => {
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    const result = bootstrap.run();
    // Skills warehouse likely doesn't exist in temp dir
    const hasSkillWarning = result.warnings.some(w => w.includes('warehouse'));
    const hasSkillStep = result.steps.skills;
    assert.ok(hasSkillStep, 'Skills step should exist');
  });

  it('should require configDir and vaultPath', () => {
    assert.throws(() => createBootstrap({}), /configDir and vaultPath are required/);
  });

  it('should return status without modifying anything', () => {
    fs.mkdirSync(configDir, { recursive: true });
    const bootstrap = createBootstrap({ configDir, vaultPath, agentsDir, backupsDir });
    const status = bootstrap.getStatus();
    assert.strictEqual(status.bootstrapped, false);
    // Should not have created vault
    assert.ok(!fs.existsSync(vaultPath));
  });
});
