import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyRuntimeSettings,
  clearOwnedLogs,
  diagnosticsSnapshot,
  runtimeSettingsSnapshot,
} from "../lib/runtime-settings.mjs";

test("runtime snapshot exposes paths and provider names but never values", () => {
  const snapshot = runtimeSettingsSnapshot({
    stateRoot: "C:\\Users\\test\\AppData\\Local\\Rempeyek-Agent-OS",
    vaultPath: "D:\\Vault",
    logDir: "C:\\Users\\test\\AppData\\Local\\Rempeyek-Agent-OS\\telemetry\\logs",
    config: {
      agency: "Test Agency",
      settings: { logRetentionDays: 14, anonymousTelemetry: false },
      agents: [{ gateway: { envAllow: ["OPENAI_API_KEY"] } }],
    },
    env: { OPENAI_API_KEY: "must-not-leak" },
    backupExists: true,
    backupPath: "C:\\state\\agents.config.json.bak",
    logFiles: ["codex.log"],
    approvalAuditCount: 7,
  });
  assert.equal(snapshot.settings.logRetentionDays, 14);
  assert.deepEqual(snapshot.providerVariables, [{
    name: "OPENAI_API_KEY",
    detected: true,
  }]);
  assert.equal(JSON.stringify(snapshot).includes("must-not-leak"), false);
  assert.equal(snapshot.backups.length, 1);
  assert.equal(Object.hasOwn(snapshot, "tombstones"), false);
  assert.deepEqual(snapshot.logFiles, ["codex.log"]);
  assert.equal(snapshot.approvalAuditCount, 7);
});

test("runtime patch accepts only bounded retention and telemetry preference", () => {
  const config = { agents: [], settings: {} };
  assert.deepEqual(applyRuntimeSettings(config, {
    logRetentionDays: 60,
    anonymousTelemetry: true,
    injected: "no",
  }).settings, { logRetentionDays: 60, anonymousTelemetry: true });
  assert.throws(
    () => applyRuntimeSettings(config, { logRetentionDays: 0 }),
    /1 and 365/,
  );
});

test("Clear Logs deletes only named files directly inside the owned log directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-logs-"));
  const logDir = path.join(root, "logs");
  fs.mkdirSync(logDir);
  fs.writeFileSync(path.join(logDir, "codex.log"), "owned");
  fs.writeFileSync(path.join(root, "keep.txt"), "keep");
  try {
    const result = clearOwnedLogs({
      logDir,
      confirmedNames: ["codex.log"],
    });
    assert.deepEqual(result.removed, ["codex.log"]);
    assert.equal(fs.existsSync(path.join(root, "keep.txt")), true);
    assert.throws(
      () => clearOwnedLogs({ logDir, confirmedNames: ["../keep.txt"] }),
      /invalid log name/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("diagnostics replaces the home path, caps events, and excludes secret values", () => {
  const result = diagnosticsSnapshot({
    home: "C:\\Users\\test",
    version: { version: "2.2.0" },
    platform: "win32",
    paths: {
      stateRoot: "C:\\Users\\test\\AppData\\Local\\Rempeyek-Agent-OS",
    },
    lifecycle: [{ id: "codex", profile: "registered", software: "installed" }],
    providerVariables: [{
      name: "OPENAI_API_KEY",
      detected: true,
      value: "must-not-leak",
    }],
    recentErrors: Array.from({ length: 55 }, (_, index) => ({
      level: "error",
      message: `C:\\Users\\test\\failure-${index}`,
      secret: "must-not-leak",
    })),
  });
  assert.equal(JSON.stringify(result).includes("C:\\\\Users\\\\test"), false);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  assert.match(result.paths.stateRoot, /%USERPROFILE%/);
  assert.equal(result.recentErrors.length, 50);
});
