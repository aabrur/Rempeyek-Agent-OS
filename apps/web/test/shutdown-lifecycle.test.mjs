import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createShutdownLifecycle } from '../lib/shutdown-lifecycle.mjs';

test('createShutdownLifecycle', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shutdown-test-'));
  const configDir = path.join(tmpDir, 'config');
  const vaultPath = path.join(tmpDir, 'vault');
  const agentsDir = path.join(tmpDir, 'agents');

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'runtime-manifest.json'), JSON.stringify({}));

  await t.test('shutdown with no active sessions', () => {
    const lifecycle = createShutdownLifecycle({ configDir, vaultPath, agentsDir });
    const report = lifecycle.run();
    assert.strictEqual(report.interruptedSessions, 0);

    const manifest = JSON.parse(fs.readFileSync(path.join(configDir, 'runtime-manifest.json'), 'utf8'));
    assert.ok(manifest.lastShutdownAt);
  });

  await t.test('shutdown with active sessions', () => {
    const activeDir = path.join(vaultPath, 'Sessions', 'Active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'session2.json'), JSON.stringify({ id: '2', status: 'active' }));

    const lifecycle = createShutdownLifecycle({ configDir, vaultPath, agentsDir });
    const report = lifecycle.run();

    assert.strictEqual(report.interruptedSessions, 1);

    const interruptedDir = path.join(vaultPath, 'Sessions', 'Interrupted');
    assert.strictEqual(fs.existsSync(path.join(interruptedDir, 'session2.json')), true);
    assert.strictEqual(fs.existsSync(path.join(activeDir, 'session2.json')), false);

    const interrupted = JSON.parse(fs.readFileSync(path.join(interruptedDir, 'session2.json'), 'utf8'));
    assert.strictEqual(interrupted.status, 'interrupted');
    assert.ok(interrupted.interrupted_at);
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
