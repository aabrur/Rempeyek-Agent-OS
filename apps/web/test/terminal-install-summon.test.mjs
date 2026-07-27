import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveSummonProfile } from "../lib/summon-profile.cjs";

test("resolveSummonProfile defaults working directory to Rempeyek state root", () => {
  const stateRoot = "C:\\AppData\\Local\\Rempeyek-Agent-OS";
  const agent = {
    id: "hermes",
    name: "Hermes",
    gateway: {
      trigger: "hermes",
      home: "C:\\Users\\user\\.hermes",
      workdir: "C:\\AppData\\Local\\Rempeyek-Agent-OS",
    },
  };

  const profile = resolveSummonProfile(agent, { stateRoot });
  assert.equal(profile.cwd, stateRoot);
  assert.equal(profile.command, "hermes");
});

test("resolveSummonProfile respects kilocode alias and default state root", () => {
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
  assert.equal(profile.cwd, stateRoot);
  assert.equal(profile.command, "kilo");
});
