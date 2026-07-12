import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveSummonProfile } = require("../lib/summon-profile.cjs");

const home = os.homedir();
const expected = [
  ["claude-code", path.join(home, ".claude"), "claude"],
  ["cline", path.join(home, ".cline"), "cline"],
  ["codex", path.join(home, ".codex"), "codex"],
  ["antigravity", path.join(home, ".gemini"), "agy"],
  ["kilo-code", path.join(home, ".kilocode"), "kilo"],
  ["openclaw", path.join(home, ".openclaw"), "openclaw"],
  ["pi", path.join(home, ".pi"), "pi"],
  ["hermes", path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "hermes"), "hermes"],
];

test("built-in agents summon from their requested homes with their requested CLIs", () => {
  for (const [id, cwd, command] of expected) {
    assert.deepEqual(resolveSummonProfile({ id, gateway: {} }), { cwd, command });
  }
});

test("legacy Copilot slot summons Codex instead of Copilot", () => {
  assert.deepEqual(resolveSummonProfile({
    id: "copilot",
    gateway: { home: path.join(home, ".copilot"), trigger: "copilot" },
  }), { cwd: path.join(home, ".codex"), command: "codex" });
});

test("custom agents retain their trusted configured summon profile", () => {
  assert.deepEqual(resolveSummonProfile({
    id: "custom-agent",
    gateway: { home: "C:\\Agents\\Custom", trigger: "custom-cli --interactive" },
  }), { cwd: "C:\\Agents\\Custom", command: "custom-cli --interactive" });
});
