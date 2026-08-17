import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveSummonProfile } = require("../lib/summon-profile.cjs");

const home = os.homedir();
const stateRoot = path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Rempeyek-Agent-OS");

const expected = [
  ["claude-code", path.join(home, ".claude"), "claude"],
  ["cline", path.join(home, ".cline"), "cline"],
  ["codex", path.join(home, ".codex"), "codex"],
  ["antigravity", path.join(home, ".gemini"), "agy"],
  ["kilo-code", path.join(home, ".kilocode"), "kilo"],
  ["openclaw", path.join(home, ".openclaw"), "openclaw"],
  ["pi", path.join(home, ".pi", "agent"), "pi"],
  ["hermes", path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "hermes"), "hermes"],
  ["grok-build", path.join(home, ".grok"), "grok"],
  ["command-code", path.join(home, ".commandcode"), "cmdc"],
];

test("built-in agents summon inside Rempeyek Agent OS state directory with their requested CLIs", () => {
  for (const [id, homeDir, command] of expected) {
    const profile = resolveSummonProfile({ id, gateway: {} }, { stateRoot });
    assert.equal(profile.cwd, stateRoot);
    assert.equal(profile.command, command);
    assert.equal(profile.home, homeDir);
  }
});

test("legacy Copilot slot summons Codex inside Rempeyek Agent OS directory", () => {
  const profile = resolveSummonProfile({
    id: "copilot",
    gateway: { home: path.join(home, ".copilot"), trigger: "copilot" },
  }, { stateRoot });
  assert.equal(profile.cwd, stateRoot);
  assert.equal(profile.command, "codex");
  assert.equal(profile.home, path.join(home, ".codex"));
});

test("custom agents summon inside Rempeyek Agent OS directory with their configured command", () => {
  const profile = resolveSummonProfile({
    id: "custom-agent",
    gateway: { home: "C:\\Agents\\Custom", trigger: "custom-cli --interactive" },
  }, { stateRoot });
  assert.equal(profile.cwd, stateRoot);
  assert.equal(profile.command, "custom-cli --interactive");
  assert.equal(profile.home, "C:\\Agents\\Custom");
});
