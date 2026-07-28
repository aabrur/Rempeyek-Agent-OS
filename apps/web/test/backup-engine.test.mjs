import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createBackupEngine } from '../lib/backup-engine.mjs';

test('backup-engine', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-engine-test-'));
  const configDir = path.join(tmpDir, 'config');
  const vaultPath = path.join(tmpDir, 'vault');
  const backupsDir = path.join(tmpDir, 'backups');

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.join(vaultPath, 'Memory', 'Shared'), { recursive: true });
  fs.mkdirSync(path.join(vaultPath, 'Graph', 'Indexes'), { recursive: true });

  const engine = createBackupEngine({ configDir, vaultPath, backupsDir });

  // Create dummy files
  fs.writeFileSync(path.join(configDir, 'runtime-manifest.json'), JSON.stringify({ version: 1 }), 'utf-8');
  fs.writeFileSync(path.join(configDir, 'family-registry.json'), JSON.stringify({ families: [] }), 'utf-8');
  fs.writeFileSync(path.join(vaultPath, 'Memory', 'Shared', 'index.json'), JSON.stringify({ idx: 1 }), 'utf-8');

  let backupId;

  await t.test('createBackup', () => {
    const backup = engine.createBackup({ label: 'init' });
    assert.ok(backup.backupId);
    assert.strictEqual(backup.label, 'init');
    assert.strictEqual(backup.files.length, 3);
    backupId = backup.backupId;
  });

  await t.test('listBackups', () => {
    const list = engine.listBackups();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].backupId, backupId);
  });

  await t.test('verifyBackup', () => {
    const res = engine.verifyBackup(backupId);
    assert.strictEqual(res.valid, true);
  });

  await t.test('getBackupSize', () => {
    const size = engine.getBackupSize(backupId);
    assert.ok(size > 0);
  });

  await t.test('restorePreview', () => {
    // Modify a file to see preview
    fs.writeFileSync(path.join(configDir, 'runtime-manifest.json'), JSON.stringify({ version: 2 }), 'utf-8');
    const preview = engine.restorePreview(backupId);

    assert.strictEqual(preview.length, 3);
    const modifiedFile = preview.find(p => p.target.endsWith('runtime-manifest.json'));
    assert.strictEqual(modifiedFile.action, 'overwrite');

    const unchangedFile = preview.find(p => p.target.endsWith('family-registry.json'));
    assert.strictEqual(unchangedFile.action, 'skip');
  });

  await t.test('restore', () => {
    const res = engine.restore(backupId);
    assert.strictEqual(res.success, true);

    // Check if reverted
    const content = JSON.parse(fs.readFileSync(path.join(configDir, 'runtime-manifest.json'), 'utf-8'));
    assert.strictEqual(content.version, 1);
  });

  await t.test('corrupt backup detection', () => {
    const manifest = engine.listBackups()[0];
    const firstFile = manifest.files[0];

    // Corrupt file
    const filePath = path.join(backupsDir, backupId, firstFile.relativePath);
    fs.writeFileSync(filePath, 'corrupted data', 'utf-8');

    const res = engine.verifyBackup(backupId);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes('Checksum mismatch'));

    // Preview should throw
    assert.throws(() => {
      engine.restorePreview(backupId);
    }, /Cannot preview invalid backup/);
  });

  // cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
