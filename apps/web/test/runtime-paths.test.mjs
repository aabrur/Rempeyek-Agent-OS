import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ensureEmptyConfig, resolveRuntimePaths } = require("../lib/runtime-paths.cjs");

test("clean Windows install keeps config, vault, telemetry, and avatars outside source", () => {
  const root = "C:\\src\\rempeyek";
  const paths = resolveRuntimePaths({
    env: { LOCALAPPDATA: "C:\\Users\\guest\\AppData\\Local" },
    root,
    home: "C:\\Users\\guest",
    platform: "win32",
    exists: () => false,
  });

  assert.equal(paths.legacyConfig, false);
  assert.equal(paths.stateRoot, "C:\\Users\\guest\\AppData\\Local\\Rempeyek-Agent-OS");
  assert.equal(paths.configPath, path.win32.join(paths.stateRoot, "agents.config.json"));
  assert.equal(paths.vaultPath, path.win32.join(paths.stateRoot, "Vault"));
  assert.equal(paths.telemetryDir, path.win32.join(paths.stateRoot, "telemetry"));
  assert.equal(paths.avatarDir, path.win32.join(paths.stateRoot, "avatars"));
  assert.equal(paths.receiptDir, path.win32.join(paths.stateRoot, "receipts"));
  assert.equal(paths.installCacheDir, path.win32.join(paths.stateRoot, "install-cache"));
  assert.equal(paths.tombstoneDir, path.win32.join(paths.stateRoot, "tombstones"));
  assert.equal(paths.bundleRoot, path.win32.join(root, "marketplace", "bundles"));
  for (const value of [
    paths.configPath,
    paths.vaultPath,
    paths.telemetryDir,
    paths.avatarDir,
    paths.receiptDir,
    paths.installCacheDir,
    paths.tombstoneDir,
  ]) {
    assert.equal(value.toLowerCase().startsWith(root.toLowerCase()), false);
  }
});

test("explicit config, vault, and state paths win", () => {
  const paths = resolveRuntimePaths({
    env: {
      AGENT_STATE_DIR: "D:\\AgentState",
      AGENTS_CONFIG: "D:\\Config\\agents.json",
      VAULT_PATH: "E:\\My Vault",
    },
    root: "C:\\src\\rempeyek",
    home: "C:\\Users\\guest",
    platform: "win32",
    exists: () => false,
  });

  assert.equal(paths.stateRoot, "D:\\AgentState");
  assert.equal(paths.configPath, "D:\\Config\\agents.json");
  assert.equal(paths.vaultPath, "E:\\My Vault");
});

test("existing ignored repository config remains compatible without using public avatars", () => {
  const root = "C:\\src\\rempeyek";
  const legacyConfig = path.win32.join(root, "agents.config.json");
  const paths = resolveRuntimePaths({
    env: {}, root, home: "C:\\Users\\owner", platform: "win32",
    exists: candidate => candidate === legacyConfig || candidate === path.win32.join(root, "Obsidian Vault"),
  });

  assert.equal(paths.legacyConfig, true);
  assert.equal(paths.configPath, legacyConfig);
  assert.equal(paths.vaultPath, path.win32.join(root, "Obsidian Vault"));
  assert.equal(paths.telemetryDir, path.win32.join(root, "telemetry"));
  assert.equal(paths.avatarDir, path.win32.join(root, "runtime", "avatars"));
  const managedState = "C:\\Users\\owner\\AppData\\Local\\Rempeyek-Agent-OS";
  assert.equal(paths.receiptDir, path.win32.join(managedState, "receipts"));
  assert.equal(paths.installCacheDir, path.win32.join(managedState, "install-cache"));
  assert.equal(paths.tombstoneDir, path.win32.join(managedState, "tombstones"));
  assert.equal(paths.receiptDir.toLowerCase().startsWith(root.toLowerCase()), false);
  assert.equal(paths.installCacheDir.toLowerCase().startsWith(root.toLowerCase()), false);
  assert.equal(paths.tombstoneDir.toLowerCase().startsWith(root.toLowerCase()), false);
});

test("bundle root follows the supplied source or packaged app root", () => {
  const source = resolveRuntimePaths({
    env: { LOCALAPPDATA: "C:\\State" },
    root: "C:\\src\\rempeyek",
    home: "C:\\Users\\guest",
    platform: "win32",
    exists: () => false,
  });
  const packaged = resolveRuntimePaths({
    env: { LOCALAPPDATA: "C:\\State" },
    root: "D:\\Program Files\\Rempeyek\\resources\\app-root",
    home: "C:\\Users\\guest",
    platform: "win32",
    exists: () => false,
  });
  assert.equal(source.bundleRoot, "C:\\src\\rempeyek\\marketplace\\bundles");
  assert.equal(
    packaged.bundleRoot,
    "D:\\Program Files\\Rempeyek\\resources\\app-root\\marketplace\\bundles",
  );
});

test("missing config bootstraps a valid zero-agent registry", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-config-"));
  const configPath = path.join(tmp, "nested", "agents.config.json");
  try {
    const config = ensureEmptyConfig(configPath, { home: path.join(tmp, "home"), agency: "REMPEYEK AGENT OS" });
    assert.deepEqual(config, { agency: "REMPEYEK AGENT OS", workdir: path.join(tmp, "home"), agents: [] });
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), config);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
