import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveSummonProfile } = require("../lib/summon-profile.cjs");

test("resolveSummonProfile sets cwd to Rempeyek Agent OS directory while preserving agent home", () => {
  const stateRoot = "C:\\AppData\\Local\\Rempeyek-Agent-OS";
  const agent = {
    id: "custom-cli",
    name: "Custom",
    gateway: {
      trigger: "custom",
      home: "C:\\Users\\user\\.custom",
      workdir: stateRoot,
    },
  };

  const profile = resolveSummonProfile(agent, { stateRoot });
  assert.equal(profile.cwd, stateRoot);
  assert.equal(profile.home, "C:\\Users\\user\\.custom");
  assert.equal(profile.command, "custom");
});

test("resolveSummonProfile uses stateRoot for built-in agents like kilo", () => {
  const stateRoot = "C:\\AppData\\Local\\Rempeyek-Agent-OS";
  const agent = {
    id: "kilo-code",
    name: "Kilo Code",
    gateway: {
      trigger: "kilo",
      launcherAlias: "kilocode",
      workdir: stateRoot,
    },
  };

  const profile = resolveSummonProfile(agent, { stateRoot });
  assert.equal(profile.command, "kilo");
  assert.equal(profile.cwd, stateRoot);
  assert.match(profile.home.replace(/\\/g, "/"), /\.kilocode$/);
});

test("resolveSummonProfile falls back to state root when no home exists", () => {
  const stateRoot = "C:\\AppData\\Local\\Rempeyek-Agent-OS";
  const agent = {
    id: "unknown-agent",
    gateway: { trigger: "unknown", workdir: stateRoot },
  };
  const profile = resolveSummonProfile(agent, { stateRoot });
  assert.equal(profile.cwd, stateRoot);
  assert.equal(profile.command, "unknown");
});
