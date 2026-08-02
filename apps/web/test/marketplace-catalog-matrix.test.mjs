import test from "node:test";
import assert from "node:assert/strict";
import { MARKETPLACE_ENTRIES, marketplaceEntry } from "../lib/marketplace-manifest.mjs";
import { resolveAdapter, resolveProbe } from "../lib/process-adapters.mjs";

test("Marketplace entries contain 21 agents plus the two Hypertaks entries", () => {
  const expectedIds = [
    "claude-code",
    "codex",
    "kilo-code",
    "cline",
    "pi",
    "antigravity",
    "hermes",
    "openclaw",
    "github-copilot-cli",
    "opencode",
    "aider",
    "goose",
    "openhands",
    "qwen-code",
    "kimi-code",
    "mistral-vibe",
    "cursor-agent",
    "crush",
    "crimson-odyssey",
    "grok-build",
    "command-code",
    "hypertaks-agent",
    "hypertaks-founder",
  ];

  for (const id of expectedIds) {
    const entry = marketplaceEntry(id);
    assert.ok(entry, `entry ${id} should exist in marketplace`);
    assert.ok(entry.name, `${id} must have a display name`);
    assert.ok(entry.officialUrl, `${id} must have an official URL`);
  }
  assert.deepEqual(marketplaceEntry("grok-build").installers.map(adapter => adapter.package), ["@xai-official/grok"]);
  assert.deepEqual(marketplaceEntry("command-code").installers.map(adapter => adapter.package), ["command-code@latest"]);
  assert.equal(marketplaceEntry("gemini-cli"), null);
  assert.equal(marketplaceEntry("grok-build").agent.trigger, "grok");
  assert.equal(marketplaceEntry("command-code").agent.trigger, "cmdc");

  // Ensure Hypertaks Agent is a plugin and Hypertaks Founder is a skill, not agent CLIs
  const hypertaksPlugin = marketplaceEntry("hypertaks-agent");
  assert.equal(hypertaksPlugin.kind, "plugin");

  const hypertaksSkill = marketplaceEntry("hypertaks-founder");
  assert.equal(hypertaksSkill.kind, "skill");
});

test("Kilo Code has user-facing alias kilocode and upstream trigger kilo", () => {
  const kilo = marketplaceEntry("kilo-code");
  assert.ok(kilo);
  assert.equal(kilo.agent.trigger, "kilo");
  assert.equal(kilo.agent.launcherAlias || "kilocode", "kilocode");
});

test("processAdapters resolves adapters for npm, winget, uv, pipx, and git-source", () => {
  const npmEntry = marketplaceEntry("claude-code");
  const npmAdapter = resolveAdapter({ entry: npmEntry, adapterId: "npm", action: "install", platform: "win32" });
  assert.ok(npmAdapter);
  assert.equal(npmAdapter.program, "npm.cmd");

  const wingetEntry = marketplaceEntry("crush");
  const wingetAdapter = resolveAdapter({ entry: wingetEntry, adapterId: "winget", action: "install", platform: "win32" });
  assert.ok(wingetAdapter);
  assert.equal(wingetAdapter.program, "winget.exe");

  const uvEntry = marketplaceEntry("mistral-vibe");
  const uvAdapter = resolveAdapter({ entry: uvEntry, adapterId: "uv", action: "install", platform: "win32" });
  assert.ok(uvAdapter);
  assert.equal(uvAdapter.program, "uv.exe");
});
