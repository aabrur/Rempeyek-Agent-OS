import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSystemDoctor } from "../lib/system-doctor.mjs";

function createTestDoctorEnvironment() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-test-"));
  const configDir = path.join(tmpDir, "Config");
  const vaultPath = path.join(tmpDir, "Vault");
  const logsPath = path.join(tmpDir, "Logs");
  const cachePath = path.join(tmpDir, "Cache");
  const backupsPath = path.join(tmpDir, "Backups");
  const tempPath = path.join(tmpDir, "Temp");

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(logsPath, { recursive: true });
  fs.mkdirSync(cachePath, { recursive: true });
  fs.mkdirSync(backupsPath, { recursive: true });
  fs.mkdirSync(tempPath, { recursive: true });

  const mockConfig = {
    agents: [
      { id: "antigravity", name: "Antigravity", trigger: "node" },
      { id: "claude-code", name: "Claude Code", trigger: "claude" },
    ],
    projects: [{ id: "proj-1", name: "Project One" }],
  };
  fs.writeFileSync(path.join(configDir, "family-registry.json"), JSON.stringify(mockConfig, null, 2));

  const mockBackupEngine = {
    available: true,
    createBackup: () => ({ backupId: "backup-test-1" }),
    listBackups: () => [{ backupId: "backup-test-1", createdAt: new Date().toISOString() }],
    verifyBackup: () => ({ valid: true }),
  };

  const mockMigrationEngine = {
    status: async () => ({ currentVersion: 2, pendingCount: 0, locked: false }),
  };

  const mockProcessManager = {
    getActiveProcesses: () => [],
    getStaleProcesses: () => [],
    cleanStaleProcesses: () => 0,
  };

  const services = {
    stateRoot: tmpDir,
    configDir,
    vaultPath,
    logsPath,
    cachePath,
    backupsPath,
    tempPath,
    isPackaged: false,
    appVersion: "2.4.1",
    serverAlive: true,
  };

  return {
    tmpDir,
    services,
    mockConfig,
    mockBackupEngine,
    mockMigrationEngine,
    mockProcessManager,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test("System Doctor runs full scan and returns structured checks for 11 categories", async () => {
  const env = createTestDoctorEnvironment();
  try {
    const doctor = createSystemDoctor({
      services: env.services,
      loadConfig: () => env.mockConfig,
      saveConfig: () => {},
      backupEngine: env.mockBackupEngine,
      migrationEngine: env.mockMigrationEngine,
      processManager: env.mockProcessManager,
    });

    const report = await doctor.scan();
    assert.equal(typeof report.timestamp, "string");
    assert.ok(Array.isArray(report.checks));
    assert.ok(report.checks.length >= 11);

    const categories = new Set(report.checks.map(c => c.category));
    assert.ok(categories.has("DESKTOP"));
    assert.ok(categories.has("LOCAL SERVICE"));
    assert.ok(categories.has("CONFIG"));
    assert.ok(categories.has("VAULT"));
    assert.ok(categories.has("MIGRATIONS"));
    assert.ok(categories.has("BACKUP"));
    assert.ok(categories.has("AGENTS"));
    assert.ok(categories.has("PROCESS MANAGER"));
    assert.ok(categories.has("MEMORY"));
    assert.ok(categories.has("UPDATER"));
    assert.ok(categories.has("TELEMETRY"));

    for (const check of report.checks) {
      assert.ok(typeof check.id === "string");
      assert.ok(["healthy", "warning", "failed", "unavailable"].includes(check.status));
      assert.ok(typeof check.summary === "string");
      assert.ok(typeof check.repairable === "boolean");
      assert.ok(["none", "low", "medium", "high"].includes(check.risk));
    }
  } finally {
    env.cleanup();
  }
});

test("System Doctor detects missing scaffolding directory and repairs safely with backup", async () => {
  const env = createTestDoctorEnvironment();
  try {
    // Intentionally remove Cache directory
    fs.rmSync(env.services.cachePath, { recursive: true, force: true });

    const doctor = createSystemDoctor({
      services: env.services,
      loadConfig: () => env.mockConfig,
      saveConfig: () => {},
      backupEngine: env.mockBackupEngine,
      migrationEngine: env.mockMigrationEngine,
      processManager: env.mockProcessManager,
    });

    const initialReport = await doctor.scan();
    const vaultCheck = initialReport.checks.find(c => c.id === "vault_scaffold");
    assert.ok(vaultCheck);
    assert.equal(vaultCheck.status, "warning");
    assert.equal(vaultCheck.repairable, true);

    // Execute repair
    const repairResult = await doctor.runRepair({
      checkId: "vault_scaffold",
      actionName: "scaffold_vault_directories",
    });

    assert.equal(repairResult.ok, true);
    assert.equal(repairResult.verifiedStatus, "healthy");

    // Second scan verifies repaired state
    const secondReport = await doctor.scan();
    const reVerifiedCheck = secondReport.checks.find(c => c.id === "vault_scaffold");
    assert.equal(reVerifiedCheck.status, "healthy");
  } finally {
    env.cleanup();
  }
});

test("System Doctor detects stale migration lock and repairs safely", async () => {
  const env = createTestDoctorEnvironment();
  try {
    const lockFile = path.join(env.services.configDir, ".migration-lock");
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 99999, lockedAt: new Date(Date.now() - 120000).toISOString() }));

    const doctor = createSystemDoctor({
      services: env.services,
      loadConfig: () => env.mockConfig,
      saveConfig: () => {},
      backupEngine: env.mockBackupEngine,
      migrationEngine: env.mockMigrationEngine,
      processManager: env.mockProcessManager,
    });

    const report = await doctor.scan();
    const lockCheck = report.checks.find(c => c.id === "migration_lock");
    assert.ok(lockCheck);
    assert.equal(lockCheck.status, "warning");

    const repairResult = await doctor.runRepair({
      checkId: "migration_lock",
      actionName: "remove_stale_migration_lock",
    });

    assert.equal(repairResult.ok, true);
    assert.equal(fs.existsSync(lockFile), false);
  } finally {
    env.cleanup();
  }
});

test("System Doctor aborts repair if pre-repair backup fails", async () => {
  const env = createTestDoctorEnvironment();
  try {
    fs.rmSync(env.services.cachePath, { recursive: true, force: true });

    const failingBackupEngine = {
      available: true,
      createBackup: () => { throw new Error("Disk full - backup failed"); },
      listBackups: () => [],
      verifyBackup: () => ({ valid: false }),
    };

    const doctor = createSystemDoctor({
      services: env.services,
      loadConfig: () => env.mockConfig,
      saveConfig: () => {},
      backupEngine: failingBackupEngine,
      migrationEngine: env.mockMigrationEngine,
      processManager: env.mockProcessManager,
    });

    const repairResult = await doctor.runRepair({
      checkId: "vault_scaffold",
      actionName: "scaffold_vault_directories",
    });

    assert.equal(repairResult.ok, false);
    assert.equal(repairResult.error.includes("backup failed"), true);
  } finally {
    env.cleanup();
  }
});
