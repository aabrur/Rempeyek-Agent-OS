import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveSummonProfile } = require("../lib/summon-profile.cjs");

test("resolveSummonProfile prefers install home over shared OS workdir", () => {
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
  assert.equal(profile.cwd, "C:\\Users\\user\\.custom");
  assert.equal(profile.home, "C:\\Users\\user\\.custom");
  assert.equal(profile.command, "custom");
});

test("resolveSummonProfile uses built-in kilo home when gateway has only workdir", () => {
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
  assert.match(profile.cwd.replace(/\\/g, "/"), /\.kilocode$/);
  assert.notEqual(profile.cwd, stateRoot);
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
