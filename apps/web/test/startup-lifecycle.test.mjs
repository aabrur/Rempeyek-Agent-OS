import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createStartupLifecycle } from '../lib/startup-lifecycle.mjs';

test('createStartupLifecycle', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-test-'));
  const configDir = path.join(tmpDir, 'config');
  const vaultPath = path.join(tmpDir, 'vault');
  const agentsDir = path.join(tmpDir, 'agents');

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(vaultPath, { recursive: true });

  await t.test('missing manifest', () => {
    const lifecycle = createStartupLifecycle({ configDir, vaultPath, agentsDir });
    const report = lifecycle.run();
    assert.strictEqual(report.status, 'uninitialized');
    assert.strictEqual(report.checks.manifest.status, 'missing');
  });

  await t.test('healthy startup', () => {
    fs.writeFileSync(path.join(configDir, 'runtime-manifest.json'), '{}');
    fs.writeFileSync(path.join(configDir, 'family-registry.json'), '{}');
    fs.writeFileSync(path.join(configDir, 'project-registry.json'), '{}');
    fs.mkdirSync(path.join(configDir, 'graphify'), { recursive: true });
    fs.mkdirSync(path.join(configDir, 'memory'), { recursive: true });

    const lifecycle = createStartupLifecycle({ configDir, vaultPath, agentsDir });
    const report = lifecycle.run();
    assert.strictEqual(report.status, 'healthy');
    assert.strictEqual(report.checks.manifest.status, 'ok');
    assert.strictEqual(report.checks.registries.status, 'ok');
  });

  await t.test('interrupted session recovery', () => {
    const activeDir = path.join(vaultPath, 'Sessions', 'Active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'session1.json'), JSON.stringify({ id: '1', status: 'active' }));

    const lifecycle = createStartupLifecycle({ configDir, vaultPath, agentsDir });
    const report = lifecycle.run();

    assert.strictEqual(report.checks.sessions.status, 'recovered');
    assert.strictEqual(report.checks.sessions.interruptedCount, 1);

    const interruptedDir = path.join(vaultPath, 'Sessions', 'Interrupted');
    assert.strictEqual(fs.existsSync(path.join(interruptedDir, 'session1.json')), true);

    const recovered = JSON.parse(fs.readFileSync(path.join(interruptedDir, 'session1.json'), 'utf8'));
    assert.strictEqual(recovered.status, 'interrupted');
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
