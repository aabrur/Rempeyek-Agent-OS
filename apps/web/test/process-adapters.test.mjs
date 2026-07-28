import assert from "node:assert/strict";
import test from "node:test";

import { marketplaceEntry } from "../lib/marketplace-manifest.mjs";
import {
  resolveAdapter,
  resolveProbe,
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

test("probes contain a fixed program and argument array", () => {
  assert.deepEqual(resolveProbe({
    entry: marketplaceEntry("gemini-cli"),
    platform: "win32",
  }), {
    program: "where.exe",
    args: ["gemini"],
  });
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
