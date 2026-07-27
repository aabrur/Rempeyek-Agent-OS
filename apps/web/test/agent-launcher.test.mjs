import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import launcher from "../lib/agent-launcher.cjs";

const { writeAgentLauncher } = launcher;

test("writes a state-root launcher for a safe bare trigger", () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-launcher-"));
  try {
    const result = writeAgentLauncher({ stateRoot, trigger: "codex" });
    assert.deepEqual(result, {
      path: path.join(stateRoot, "codex.cmd"),
      command: "codex",
    });
    const script = fs.readFileSync(result.path, "utf8");
    assert.match(script, new RegExp(`cd /d "${stateRoot.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}"`));
    assert.match(script, /where "codex" >nul 2>nul/);
    assert.match(script, /^"codex" %\*$/m);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("uses an approved custom working directory and rejects unsafe triggers", () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-launcher-"));
  try {
    const custom = path.join(stateRoot, "Custom Home");
    const result = writeAgentLauncher({
      stateRoot,
      trigger: "nova-agent",
      workingDirectory: custom,
    });
    assert.match(fs.readFileSync(result.path, "utf8"), new RegExp(`cd /d "${custom.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}"`));
    assert.equal(writeAgentLauncher({ stateRoot, trigger: "codex & whoami" }), null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
