import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeAgentLauncher } from "../lib/agent-launcher.cjs";
import { resolveRuntimePaths } from "../lib/runtime-paths.cjs";

test("resolveRuntimePaths resolves state root dynamically without hardcoded user paths", () => {
  const env = { LOCALAPPDATA: "C:\\CustomAppData\\Local\\Rempeyek-Agent-OS" };
  const paths = resolveRuntimePaths({
    env,
    root: "C:\\repo",
    home: "C:\\Users\\custom",
    platform: "win32",
  });
  assert.equal(paths.stateRoot, "C:\\CustomAppData\\Local\\Rempeyek-Agent-OS");
});

test("resolveRuntimePaths uses POSIX data roots for Ubuntu/Linux input", () => {
  const paths = resolveRuntimePaths({
    env: { XDG_DATA_HOME: "/srv/data" },
    root: "/repo",
    home: "/home/custom",
    platform: "linux",
  });
  assert.equal(paths.stateRoot, "/srv/data/Rempeyek-Agent-OS");
});

test("writeAgentLauncher creates safe non-recursive launcher for standard agent", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-launcher-test-"));
  try {
    const result = writeAgentLauncher({
      stateRoot: tmp,
      trigger: "hermes",
      upstreamTrigger: "hermes",
      workingDirectory: tmp,
    });
    assert.ok(result);
    assert.ok(fs.existsSync(result.path));
    const content = fs.readFileSync(result.path, "utf8");
    // Ensure launcher does not call kilocode/hermes recursively
    assert.ok(content.includes("@echo off"));
    assert.ok(!content.includes('"%~dp0hermes.cmd" %*'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("writeAgentLauncher supports kilocode delegating to kilo without self-recursion", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-launcher-kilo-"));
  try {
    const result = writeAgentLauncher({
      stateRoot: tmp,
      trigger: "kilocode",
      upstreamTrigger: "kilo",
      workingDirectory: tmp,
    });
    assert.ok(result);
    assert.equal(result.command, "kilocode");
    assert.equal(result.path, path.join(tmp, "kilocode.cmd"));

    const content = fs.readFileSync(result.path, "utf8");
    // Must delegate to the upstream kilo, not kilocode, via PATH-entry-only resolution.
    assert.match(content, /for %%G in \("%PATH:;=" "%"\) do/);
    assert.match(content, /if exist "%%~G\\kilo\.(exe|cmd|bat)"/);
    assert.match(content, /"%REALCMD%"\s+%\*/m);
    // Never a bare direct call that could re-invoke the launcher itself.
    assert.ok(!content.includes('"kilocode" %*'));
    assert.ok(!content.includes('"kilo" %*'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
