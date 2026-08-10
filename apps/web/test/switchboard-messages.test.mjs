import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createSwitchboardMessage,
  markSwitchboardRead,
  readSwitchboardMessages,
  saveSwitchboardMessages,
  unreadForAgent,
  agentSkillTargets,
} from "../lib/switchboard.mjs";
import {
  deriveGatewayActions,
  resolveRuntimeAdapter,
  BUILT_IN_SERVICE_COMMANDS,
} from "../lib/process-adapters.mjs";

test("switchboard messages persist and mark read", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-msg-"));
  const msg = createSwitchboardMessage({
    fromAgentId: "user",
    toAgentId: "hermes",
    message: "Check BTC momentum",
  });
  assert.equal(msg.error, undefined);
  saveSwitchboardMessages(dir, [msg]);
  const loaded = readSwitchboardMessages(dir);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].status, "unread");
  assert.equal(unreadForAgent(loaded, "hermes").length, 1);

  const marked = markSwitchboardRead(loaded, { agentId: "hermes" });
  assert.equal(marked.updated, true);
  saveSwitchboardMessages(dir, marked.messages);
  assert.equal(unreadForAgent(readSwitchboardMessages(dir), "hermes").length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("hermes and openclaw expose reviewed gateway service commands", () => {
  assert.ok(BUILT_IN_SERVICE_COMMANDS.hermes);
  assert.ok(BUILT_IN_SERVICE_COMMANDS.openclaw);

  const hermesRun = resolveRuntimeAdapter({
    agent: { id: "hermes", gateway: { trigger: "hermes" } },
    action: "gateway-run",
  });
  assert.equal(hermesRun.available, true);
  assert.deepEqual(hermesRun.command, { program: "hermes", args: ["gateway", "run"] });
  assert.equal(hermesRun.verification, "built-in-service");

  const openclawStatus = resolveRuntimeAdapter({
    agent: { id: "openclaw", gateway: { trigger: "openclaw" } },
    action: "status",
  });
  assert.equal(openclawStatus.available, true);
  assert.deepEqual(openclawStatus.command, {
    program: "openclaw",
    args: ["gateway", "status"],
  });

  const actions = deriveGatewayActions({
    id: "hermes",
    gateway: { trigger: "hermes", actions: [] },
  });
  assert.ok(actions.includes("run"));
  assert.ok(actions.includes("start"));
  assert.ok(actions.includes("status"));
});

test("task agents still gateway-run via bare trigger", () => {
  const run = resolveRuntimeAdapter({
    agent: { id: "command-code", gateway: { trigger: "cmdc" } },
    action: "gateway-run",
  });
  assert.equal(run.available, true);
  assert.deepEqual(run.command, { program: "cmdc", args: [] });
});

test("agent skill targets include agents-standard and host dirs", () => {
  const targets = agentSkillTargets(
    { id: "claude-code", gateway: { home: "C:\\\\Users\\\\demo\\\\.claude" } },
    "C:\\\\Users\\\\demo",
  );
  assert.ok(targets.some(t => t.includes(".agents")));
  assert.ok(targets.some(t => t.includes(".claude")));
});
