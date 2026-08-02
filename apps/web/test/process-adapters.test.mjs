import assert from "node:assert/strict";
import test from "node:test";

import { marketplaceEntry } from "../lib/marketplace-manifest.mjs";
import {
  resolveAdapter,
  resolveProbe,
  resolveRuntimeAdapter,
  startResolvedProcess,
} from "../lib/process-adapters.mjs";

test("npm adapter resolves fixed Windows program and argv", () => {
  assert.deepEqual(
    resolveAdapter({
      entry: marketplaceEntry("codex"),
      adapterId: "npm",
      action: "install",
      platform: "win32",
    }),
    {
      program: "npm.cmd",
      args: ["install", "--global", "@openai/codex"],
      display: "npm install --global @openai/codex",
      probe: { program: "where.exe", args: ["codex"] },
    },
  );
});

test("npm uninstall is typed and unavailable for link-only agents", () => {
  assert.deepEqual(
    resolveAdapter({
      entry: marketplaceEntry("codex"),
      adapterId: "npm",
      action: "uninstall",
      platform: "linux",
    }),
    {
      program: "npm",
      args: ["uninstall", "--global", "@openai/codex"],
      display: "npm uninstall --global @openai/codex",
      probe: { program: "which", args: ["codex"] },
    },
  );
  assert.equal(
    resolveAdapter({
      entry: marketplaceEntry("aider"),
      adapterId: "npm",
      action: "install",
      platform: "win32",
    }),
    null,
  );
  assert.equal(
    resolveAdapter({
      entry: marketplaceEntry("crimson-odyssey"),
      adapterId: "npm",
      action: "install",
      platform: "win32",
    }),
    null,
  );
});

test("winget and uv adapters use fixed identifiers", () => {
  assert.equal(
    resolveAdapter({
      entry: marketplaceEntry("crush"),
      adapterId: "winget",
      action: "install",
      platform: "win32",
    }).program,
    "winget.exe",
  );
  assert.deepEqual(
    resolveAdapter({
      entry: marketplaceEntry("mistral-vibe"),
      adapterId: "uv",
      action: "install",
      platform: "win32",
    }).args,
    ["tool", "install", "mistral-vibe"],
  );
});

test("platform-limited adapters become official-link only", () => {
  assert.equal(
    resolveAdapter({
      entry: marketplaceEntry("cline"),
      adapterId: "npm",
      action: "install",
      platform: "win32",
    }),
    null,
  );
  assert.equal(
    resolveAdapter({
      entry: marketplaceEntry("cline"),
      adapterId: "npm",
      action: "install",
      platform: "darwin",
    }).program,
    "npm",
  );
});

test("probes contain fixed program and distinct Grok / Command Code arguments", () => {
  assert.deepEqual(resolveProbe({
    entry: marketplaceEntry("grok-build"),
    platform: "win32",
  }), {
    program: "where.exe",
    args: ["grok"],
  });
  assert.deepEqual(resolveProbe({
    entry: marketplaceEntry("command-code"),
    platform: "win32",
  }), {
    program: "where.exe",
    args: ["cmdc"],
  });
});

test("Grok Build and Command Code installers resolve to reviewed npm commands", () => {
  assert.deepEqual(resolveAdapter({
    entry: marketplaceEntry("grok-build"), adapterId: "npm", action: "install", platform: "win32",
  }), {
    program: "npm.cmd",
    args: ["install", "--global", "@xai-official/grok"],
    display: "npm install --global @xai-official/grok",
    probe: { program: "where.exe", args: ["grok"] },
  });
  assert.deepEqual(resolveAdapter({
    entry: marketplaceEntry("command-code"), adapterId: "npm", action: "install", platform: "win32",
  }), {
    program: "npm.cmd",
    args: ["install", "--global", "command-code@latest"],
    display: "npm install --global command-code@latest",
    probe: { program: "where.exe", args: ["cmdc"] },
  });
});

test("runtime adapters never synthesize binary-plus-action commands", () => {
  const commandCode = resolveRuntimeAdapter({
    agent: { id: "command-code", gateway: { trigger: "cmdc" } },
    action: "summon",
    platform: "win32",
  });
  assert.deepEqual(commandCode.command, { program: "cmdc", args: [] });
  assert.equal(commandCode.runtimeType, "task");
  assert.equal(commandCode.windowsSupport, "alpha");
  assert.equal(commandCode.wslFallback, true);
  assert.equal(commandCode.available, true);

  const run = resolveRuntimeAdapter({
    agent: { id: "command-code", gateway: { trigger: "cmdc" } },
    action: "gateway-run",
    platform: "win32",
  });
  assert.equal(run.available, false);
  assert.match(run.reason, /not verified/i);
});

test("runtime adapters allow only an explicitly reviewed structured service command", () => {
  const agent = {
    id: "service-agent",
    gateway: {
      trigger: "service-agent",
      runtime: {
        type: "service",
        commands: {
          gatewayRun: { verified: true, program: "service-agent", args: ["gateway", "run"] },
          nativeStop: { verified: true, program: "service-agent", args: ["gateway", "stop"] },
          healthCheck: { verified: true, program: "service-agent", args: ["health"] },
        },
      },
    },
  };
  assert.deepEqual(resolveRuntimeAdapter({ agent, action: "gateway-run" }).command, {
    program: "service-agent", args: ["gateway", "run"],
  });
  assert.deepEqual(resolveRuntimeAdapter({ agent, action: "stop" }).command, {
    program: "service-agent", args: ["gateway", "stop"],
  });
  assert.equal(resolveRuntimeAdapter({ agent, action: "status" }).available, false);
});

test("resolved processes never delegate to a shell", () => {
  const calls = [];
  const result = startResolvedProcess(
    { program: "npm.cmd", args: ["install", "--global", "@openai/codex"] },
    {
      cwd: "C:\\repo",
      env: { PATH: "test" },
      spawnImpl(program, args, options) {
        calls.push({ program, args, options });
        return { pid: 42 };
      },
    },
  );
  assert.equal(result.pid, 42);
  assert.deepEqual(calls, [{
    program: "npm.cmd",
    args: ["install", "--global", "@openai/codex"],
    options: {
      cwd: "C:\\repo",
      env: { PATH: "test" },
      shell: false,
      windowsHide: true,
    },
  }]);
});

test("resolved installer processes can open a visible Windows terminal", () => {
  let options;
  startResolvedProcess(
    { program: "npm.cmd", args: ["install", "--global", "example"] },
    {
      visible: true,
      spawnImpl(_program, _args, receivedOptions) {
        options = receivedOptions;
        return {};
      },
    },
  );
  assert.equal(options.windowsHide, false);
  assert.equal(options.shell, false);
});
