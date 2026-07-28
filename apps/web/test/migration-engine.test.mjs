import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import { createMigrationEngine } from '../lib/migration-engine.mjs';

test('Migration Engine', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-test-'));
  const configDir = path.join(tmpDir, 'config');
  const vaultPath = path.join(tmpDir, 'vault');
  const backupsDir = path.join(tmpDir, 'backups');
  const migrationsDir = path.join(tmpDir, 'migrations');

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.mkdirSync(migrationsDir, { recursive: true });

  const engine = createMigrationEngine({ configDir, vaultPath, backupsDir });

  // Create a dummy migration file
  const migration1Path = path.join(migrationsDir, '001-test.mjs');
  fs.writeFileSync(migration1Path, `
    export const version = 1;
    export const description = 'Test migration 1';
    export const reversible = true;
    export async function up({ vaultPath }) {
      const fs = await import('node:fs');
      fs.writeFileSync(vaultPath + '/test1.txt', 'done');
    }
    export async function down({ vaultPath }) {
      const fs = await import('node:fs');
      if (fs.existsSync(vaultPath + '/test1.txt')) {
        fs.unlinkSync(vaultPath + '/test1.txt');
      }
    }
    export async function validate({ vaultPath }) {
      const fs = await import('node:fs');
      return { valid: fs.existsSync(vaultPath + '/test1.txt'), errors: [] };
    }
  `);

  await t.test('status with pending migration', async () => {
    const st = await engine.status(migrationsDir);
    assert.strictEqual(st.currentVersion, 0);
    assert.strictEqual(st.pendingCount, 1);
  });

  await t.test('dry-run', async () => {
    const dr = await engine.dryRun(migrationsDir);
    assert.strictEqual(dr.wouldRun.length, 1);
    assert.strictEqual(dr.wouldUpdateTo, 1);
  });

  await t.test('run migration', async () => {
    const result = await engine.run(migrationsDir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.executed.length, 1);
    assert.strictEqual(fs.existsSync(path.join(vaultPath, 'test1.txt')), true);
  });

  await t.test('idempotent re-run', async () => {
    const result = await engine.run(migrationsDir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.executed.length, 0);
  });

  await t.test('journal creation', async () => {
    const journal = engine.getMigrationJournal();
    assert.strictEqual(journal.currentVersion, 1);
    assert.strictEqual(journal.migrations.length, 1);
  });

  await t.test('backup creation', async () => {
    const backupDirs = fs.readdirSync(backupsDir);
    assert.strictEqual(backupDirs.length, 1);
    assert.ok(backupDirs[0].startsWith('pre-migration-1-'));
  });

  await t.test('lock file handling', async () => {
    fs.writeFileSync(path.join(configDir, '.migration-lock'), 'lock');
    await assert.rejects(async () => {
      await engine.run(migrationsDir);
    }, /locked/);
    fs.unlinkSync(path.join(configDir, '.migration-lock'));
  });

  await t.test('rollback', async () => {
    const res = await engine.rollback(0, migrationsDir);
    assert.strictEqual(res.success, true);
    assert.strictEqual(fs.existsSync(path.join(vaultPath, 'test1.txt')), false);
    const st = await engine.status(migrationsDir);
    assert.strictEqual(st.currentVersion, 0);
  });
});
