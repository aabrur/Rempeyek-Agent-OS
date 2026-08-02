import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createManagedProcessManager } from "../lib/process-manager.mjs";

function fakeChild(pid = 4312) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function withManager(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-process-manager-"));
  const child = fakeChild();
  const spawns = [];
  const treeKills = [];
  const manager = createManagedProcessManager({
    logDir: path.join(root, "logs"),
    recordsPath: path.join(root, "processes.json"),
    platform: "win32",
    spawnImpl(program, args, options) {
      spawns.push({ program, args, options });
      return child;
    },
    execFileImpl(program, args, callback) {
      treeKills.push({ program, args });
      callback(null, "", "");
    },
    listChildPidsImpl: async () => [4313, 4314],
  });
  return Promise.resolve(run({ root, child, manager, spawns, treeKills }))
    .finally(() => fs.rmSync(root, { recursive: true, force: true }));
}

test("manager stores typed owned-process metadata and captures separate stdout/stderr", async () => {
  await withManager(({ child, manager, spawns, root }) => {
    const started = manager.start({
      agentId: "codex",
      actionType: "gateway-run",
      command: { program: "codex", args: ["exec"] },
      cwd: root,
      env: { PATH: "test" },
    });
    assert.equal(started.ok, true);
    assert.deepEqual(spawns, [{
      program: "codex", args: ["exec"],
      options: { cwd: root, env: { PATH: "test" }, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    }]);
    const record = manager.status("codex");
    for (const key of ["agentId", "pid", "childPids", "command", "args", "workingDirectory", "actionType", "startTime", "exitCode", "runtimeState", "stdoutPath", "stderrPath"]) {
      assert.ok(Object.hasOwn(record, key), `record includes ${key}`);
    }
    assert.equal(record.runtimeState, "running");
    child.stdout.emit("data", "out line\\n");
    child.stderr.emit("data", "err line\\n");
    assert.match(fs.readFileSync(record.stdoutPath, "utf8"), /out line/);
    assert.match(fs.readFileSync(record.stderrPath, "utf8"), /err line/);
    assert.equal(manager.start({ agentId: "codex", actionType: "gateway-run", command: { program: "codex", args: [] }, cwd: root }).ok, false);
    child.emit("exit", 0);
    assert.equal(manager.status("codex").runtimeState, "stopped");
  });
});

test("manager stops only an active managed process tree and never reports an idle stop as success", async () => {
  await withManager(async ({ child, manager, root, treeKills }) => {
    const idle = await manager.stop("codex");
    assert.equal(idle.ok, false);

    manager.start({ agentId: "codex", actionType: "gateway-run", command: { program: "codex", args: [] }, cwd: root });
    const stopped = await manager.stop("codex");
    assert.equal(stopped.ok, true);
    assert.deepEqual(treeKills, [{ program: "taskkill.exe", args: ["/pid", "4312", "/T", "/F"] }]);
    assert.equal(manager.status("codex").runtimeState, "stopped");
    assert.deepEqual(manager.status("codex").childPids, [4313, 4314]);
    child.emit("exit", 1);
    assert.equal(manager.status("codex").runtimeState, "stopped");
  });
});

test("manager clears inherited active PIDs as unavailable instead of killing an unverified process", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-process-stale-"));
  const recordsPath = path.join(root, "processes.json");
  fs.writeFileSync(recordsPath, JSON.stringify({
    records: [{ agentId: "codex", pid: 9911, childPids: [9912], command: "codex", args: [], workingDirectory: root, actionType: "gateway-run", startTime: "2026-08-02T00:00:00.000Z", exitCode: null, runtimeState: "running", stdoutPath: "", stderrPath: "" }],
  }));
  const treeKills = [];
  const manager = createManagedProcessManager({
    logDir: path.join(root, "logs"), recordsPath, platform: "win32",
    execFileImpl(program, args, callback) { treeKills.push({ program, args }); callback(null, "", ""); },
  });
  try {
    assert.equal(manager.status("codex").runtimeState, "unavailable");
    assert.equal((await manager.stop("codex")).ok, false);
    assert.deepEqual(treeKills, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("manager preserves historical stopped records while clearing only inherited active ownership", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-process-history-"));
  const recordsPath = path.join(root, "processes.json");
  fs.writeFileSync(recordsPath, JSON.stringify({
    records: [{ agentId: "codex", pid: 9911, childPids: [], command: "codex", args: [], workingDirectory: root, actionType: "gateway-run", startTime: "2026-08-02T00:00:00.000Z", exitCode: 0, runtimeState: "stopped", stdoutPath: "", stderrPath: "" }],
  }));
  const manager = createManagedProcessManager({ logDir: path.join(root, "logs"), recordsPath, platform: "win32" });
  try {
    const record = manager.status("codex");
    assert.equal(record.runtimeState, "stopped");
    assert.equal(record.pid, 9911);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
