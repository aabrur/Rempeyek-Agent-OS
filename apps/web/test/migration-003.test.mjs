import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as migration003 from '../lib/migrations/003-work-continuity-social-publishing.mjs';

test('Migration 003 executes up(), creates required directories, updates manifest, and validates', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-mig-003-'));
  try {
    const configDir = path.join(tmpDir, 'Config');
    const vaultPath = path.join(tmpDir, 'Vault');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(vaultPath, { recursive: true });

    // Seed manifest v2
    const manifestPath = path.join(configDir, 'runtime-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ runtimeSchemaVersion: 2 }, null, 2), 'utf8');

    // Run up()
    const upRes = await migration003.up({ configDir, vaultPath });
    assert.equal(upRes.success, true);
    assert.equal(upRes.version, 3);

    // Verify directories created
    assert.ok(fs.existsSync(path.join(vaultPath, 'Work', 'Missions')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Work', 'Contracts')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Work', 'Runs')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Social', 'Campaigns')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Social', 'Jobs')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Social', 'Receipts')));
    assert.ok(fs.existsSync(path.join(vaultPath, 'Social', 'Connectors', 'registry.json')));

    // Verify manifest updated
    const updatedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(updatedManifest.runtimeSchemaVersion, 3);
    assert.equal(updatedManifest.workSchemaVersion, 1);
    assert.equal(updatedManifest.publishingSchemaVersion, 1);

    // Validate passes
    const validation = await migration003.validate({ configDir, vaultPath });
    assert.equal(validation.valid, true);

    // Run down()
    const downRes = await migration003.down({ configDir, vaultPath });
    assert.equal(downRes.success, true);
    assert.equal(downRes.rolledBackTo, 2);

    const rolledBackManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(rolledBackManifest.runtimeSchemaVersion, 2);
    assert.equal(rolledBackManifest.workSchemaVersion, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
