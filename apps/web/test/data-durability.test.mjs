import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadDurableJson, stripBom, writeJsonAtomic } from "../lib/durable-config.mjs";
import { createBackupEngine } from "../lib/backup-engine.mjs";
import { createMigrationEngine } from "../lib/migration-engine.mjs";
import { createDesktopSettingsStore } from "../../desktop/desktop-settings.mjs";

function createSandbox() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "durability-test-"));
  const configDir = path.join(tmpDir, "Config");
  const vaultPath = path.join(tmpDir, "Vault");
  const backupsDir = path.join(tmpDir, "Backups");
  const quarantineDir = path.join(configDir, "Quarantine");

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });

  return {
    tmpDir,
    configDir,
    vaultPath,
    backupsDir,
    quarantineDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test("stripBom strips UTF-8 byte order mark \\uFEFF", () => {
  assert.equal(stripBom("\uFEFF{\"key\":\"val\"}"), "{\"key\":\"val\"}");
  assert.equal(stripBom("{\"key\":\"val\"}"), "{\"key\":\"val\"}");
});

test("loadDurableJson recovers from truncated JSON using valid .bak and quarantines corrupt file", () => {
  const box = createSandbox();
  try {
    const filePath = path.join(box.configDir, "test-config.json");
    const bakPath = `${filePath}.bak`;

    // Active file is truncated JSON
    fs.writeFileSync(filePath, "{\"agents\": [{\"id\": \"a1\"");
    // Known-good .bak file
    fs.writeFileSync(bakPath, JSON.stringify({ agents: [{ id: "a1", name: "Agent 1" }] }, null, 2));

    const res = loadDurableJson(filePath, {
      validator: data => { if (!Array.isArray(data.agents)) throw new Error("invalid agents"); },
      fallback: () => ({ agents: [] }),
      quarantineDir: box.quarantineDir,
    });

    assert.equal(res.recovered, true);
    assert.equal(res.source, "backup");
    assert.equal(res.data.agents[0].name, "Agent 1");

    // Verify corrupt file was preserved in quarantine
    const quarantined = fs.readdirSync(box.quarantineDir);
    assert.ok(quarantined.length > 0);
    assert.ok(quarantined[0].includes("test-config.json.corrupt"));
  } finally {
    box.cleanup();
  }
});

test("loadDurableJson handles malformed JSON and corrupt .bak by quarantining both and creating minimum fallback", () => {
  const box = createSandbox();
  try {
    const filePath = path.join(box.configDir, "bad-config.json");
    const bakPath = `${filePath}.bak`;

    fs.writeFileSync(filePath, "INVALID_JSON_CONTENT");
    fs.writeFileSync(bakPath, "{ALSO_MALFORMED");

    const res = loadDurableJson(filePath, {
      validator: data => { if (!Array.isArray(data.agents)) throw new Error("invalid agents"); },
      fallback: () => ({ agents: [{ id: "fallback-agent" }] }),
      quarantineDir: box.quarantineDir,
    });

    assert.equal(res.recovered, true);
    assert.equal(res.source, "fallback");
    assert.equal(res.data.agents[0].id, "fallback-agent");

    // Both files quarantined
    const quarantined = fs.readdirSync(box.quarantineDir);
    assert.ok(quarantined.length >= 2);
  } finally {
    box.cleanup();
  }
});

test("writeJsonAtomic performs atomic write with fsync and cleans up temp files on error", () => {
  const box = createSandbox();
  try {
    const filePath = path.join(box.configDir, "atomic-test.json");
    const success = writeJsonAtomic(filePath, { status: "ok" }, { backup: true });
    assert.equal(success, true);
    assert.equal(fs.existsSync(filePath), true);

    const read = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assert.equal(read.status, "ok");

    // Verify no leftover .tmp files
    const tmpFiles = fs.readdirSync(box.configDir).filter(f => f.endsWith(".tmp"));
    assert.equal(tmpFiles.length, 0);
  } finally {
    box.cleanup();
  }
});

test("desktopSettingsStore recovers from corrupt settings file using .bak or default fallback", () => {
  const box = createSandbox();
  try {
    const settingsPath = path.join(box.configDir, "desktop-settings.json");
    const bakPath = `${settingsPath}.bak`;

    fs.writeFileSync(settingsPath, "TRUNCATED_SETTINGS");
    fs.writeFileSync(bakPath, JSON.stringify({ autoCheck: false, updateChannel: "preview" }));

    const store = createDesktopSettingsStore(settingsPath);
    const read = store.read();

    assert.equal(read.autoCheck, false);
    assert.equal(read.updateChannel, "preview");

    // Verify corrupt original preserved
    const quarantine = path.join(box.configDir, "Quarantine");
    assert.ok(fs.existsSync(quarantine));
  } finally {
    box.cleanup();
  }
});

test("backupEngine requires checksum, rejects corrupted backup restore, and performs two-phase atomic restore", () => {
  const box = createSandbox();
  try {
    const targetFile = path.join(box.configDir, "family-registry.json");
    fs.writeFileSync(targetFile, JSON.stringify({ agents: [{ id: "original" }] }, null, 2));

    const engine = createBackupEngine({
      configDir: box.configDir,
      vaultPath: box.vaultPath,
      backupsDir: box.backupsDir,
    });

    const backup = engine.createBackup({ label: "durability-test" });
    assert.ok(backup.backupId);
    assert.equal(backup.metadataVersion, 1);
    assert.ok(backup.files[0].checksum);

    // Verify valid backup restores cleanly
    fs.writeFileSync(targetFile, JSON.stringify({ agents: [{ id: "mutated" }] }, null, 2));
    const restoreResult = engine.restore(backup.backupId);
    assert.equal(restoreResult.success, true);
    const restoredData = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    assert.equal(restoredData.agents[0].id, "original");

    // Corrupt the backup file
    const backupDir = path.join(box.backupsDir, backup.backupId);
    const backedUpFile = path.join(backupDir, backup.files[0].relativePath);
    fs.writeFileSync(backedUpFile, JSON.stringify({ agents: [{ id: "TAMPERED" }] }));

    // Verify corrupted backup is rejected
    const verify = engine.verifyBackup(backup.backupId);
    assert.equal(verify.valid, false);

    assert.throws(() => {
      engine.restore(backup.backupId);
    }, /Cannot restore invalid backup/);
  } finally {
    box.cleanup();
  }
});

test("migrationEngine recovers from stale lock (>60s) and handles migration validation failure", async () => {
  const box = createSandbox();
  try {
    const lockPath = path.join(box.configDir, ".migration-lock");
    // Write stale lock timestamp (2 minutes ago)
    fs.writeFileSync(lockPath, (Date.now() - 120000).toString());

    const migrationsDir = path.join(box.tmpDir, "migrations");
    fs.mkdirSync(migrationsDir, { recursive: true });

    // Create a migration file that fails validation on up, but down reverts it
    const migFile = path.join(migrationsDir, "001-failing-migration.mjs");
    fs.writeFileSync(
      migFile,
      `
      import fs from "node:fs";
      import path from "node:path";
      export const version = 1;
      export const description = "Failing validation migration";
      export const reversible = true;
      export async function up({ configDir }) {
        fs.writeFileSync(path.join(configDir, "migrated.flag"), "true");
      }
      export async function down({ configDir }) {
        const flag = path.join(configDir, "migrated.flag");
        if (fs.existsSync(flag)) fs.unlinkSync(flag);
      }
      export async function validate({ configDir }) {
        const hasFlag = fs.existsSync(path.join(configDir, "migrated.flag"));
        return { valid: !hasFlag, errors: hasFlag ? ["Schema integrity violation"] : [] };
      }
      `
    );

    const engine = createMigrationEngine({
      configDir: box.configDir,
      vaultPath: box.vaultPath,
      backupsDir: box.backupsDir,
    });

    await assert.rejects(async () => {
      await engine.run(migrationsDir);
    }, /Validation failed for migration 1/);

    const journal = engine.getMigrationJournal();
    assert.equal(journal.migrations.length, 1);
    assert.equal(journal.migrations[0].status, "failed");
    assert.equal(journal.migrations[0].rollbackStatus, "verified");

    // Lock file must be cleaned up
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    box.cleanup();
  }
});
