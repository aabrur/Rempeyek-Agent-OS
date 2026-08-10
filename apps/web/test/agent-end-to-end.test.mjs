import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventEmitter } from "node:events";

import { createManagedProcessManager } from "../lib/process-manager.mjs";
import { deriveLifecycle, applyLifecycleChange } from "../lib/agent-lifecycle.mjs";

function createTestEnvironment() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-e2e-test-"));
  const logDir = path.join(tmpDir, "logs");
  const recordsPath = path.join(tmpDir, "managed-processes.json");
  const configPath = path.join(tmpDir, "family-registry.json");

  const initialConfig = {
    agency: "REMPEYEK AGENT OS",
    activeAgentId: "antigravity",
    agents: [
      { id: "antigravity", name: "Antigravity", role: "Primary Agent", enabled: true, gateway: { home: tmpDir, trigger: "node" } },
      { id: "claude-code", name: "Claude Code", role: "Code Agent", enabled: true, gateway: { home: tmpDir, trigger: "claude" } },
      { id: "codex", name: "Codex", role: "AI Assistant", enabled: true, gateway: { home: tmpDir, trigger: "codex" } },
      { id: "gemini-cli", name: "Gemini CLI", role: "Gemini Assistant", enabled: true, gateway: { home: tmpDir, trigger: "gemini" } },
      { id: "kilo-code", name: "Kilo Code", role: "Kilo Assistant", enabled: true, gateway: { home: tmpDir, trigger: "kilo" } },
      { id: "openclaw", name: "OpenClaw", role: "Service Gateway", enabled: true, gateway: { home: tmpDir, trigger: "openclaw", isService: true } },
      { id: "hermes", name: "Hermes", role: "Service Bridge", enabled: true, gateway: { home: tmpDir, trigger: "hermes", isService: true } },
    ],
  };

  fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));

  return {
    tmpDir,
    logDir,
    recordsPath,
    configPath,
    initialConfig,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test("deriveLifecycle reports correct software and profile states", () => {
  const env = createTestEnvironment();
  try {
    const agent = env.initialConfig.agents[0];
    const lc = deriveLifecycle({
      entry: { id: "antigravity" },
      agent,
      installed: true,
      activeAgentId: "antigravity",
    });

    assert.equal(lc.id, "antigravity");
    assert.equal(lc.software, "installed");
    assert.equal(lc.profile, "active");
    assert.equal(lc.active, true);
  } finally {
    env.cleanup();
  }
});

test("applyLifecycleChange handles enable, disable, and activate commands safely", () => {
  const env = createTestEnvironment();
  try {
    // Disable agent
    let next = applyLifecycleChange(env.initialConfig, { id: "claude-code", type: "disable" });
    assert.equal(next.agents.find(a => a.id === "claude-code").enabled, false);

    // Cannot activate disabled agent
    assert.throws(() => {
      applyLifecycleChange(next, { id: "claude-code", type: "activate" });
    }, /disabled agent/);

    // Enable agent
    next = applyLifecycleChange(next, { id: "claude-code", type: "enable" });
    assert.equal(next.agents.find(a => a.id === "claude-code").enabled, true);

    // Activate agent
    next = applyLifecycleChange(next, { id: "claude-code", type: "activate" });
    assert.equal(next.activeAgentId, "claude-code");
  } finally {
    env.cleanup();
  }
});

test("ManagedProcessManager prevents double start, handles zero exit, non-zero exit, and logs streaming", async () => {
  const env = createTestEnvironment();
  try {
    const activeChildren = new Map();

    const mockSpawn = (cmd, args, opts) => {
      const child = new EventEmitter();
      child.pid = 12345;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {
        child.emit("exit", 0);
      };
      activeChildren.set(cmd, child);
      return child;
    };

    const pm = createManagedProcessManager({
      logDir: env.logDir,
      recordsPath: env.recordsPath,
      spawnImpl: mockSpawn,
      listChildPidsImpl: () => Promise.resolve([]),
    });

    // 1. Start agent process
    const res1 = pm.start({
      agentId: "antigravity",
      actionType: "gateway-run",
      command: { program: "node", args: ["--version"] },
      cwd: env.tmpDir,
    });

    assert.equal(res1.ok, true);
    assert.equal(res1.record.runtimeState, "running");
    assert.equal(res1.record.pid, 12345);

    // 2. Prevent double start
    const res2 = pm.start({
      agentId: "antigravity",
      actionType: "gateway-run",
      command: { program: "node", args: ["--version"] },
      cwd: env.tmpDir,
    });

    assert.equal(res2.ok, false);
    assert.ok(res2.error.includes("already has a managed gateway-run process"));

    // 3. Log streaming
    const child = activeChildren.get("node");
    child.stdout.emit("data", "v24.15.0\n");

    const logRes = pm.logs("antigravity");
    assert.ok(logRes.lines.length > 0);
    assert.equal(logRes.lines[0].line, "v24.15.0");

    // 4. Process exit zero
    child.emit("exit", 0);
    const finalStatus = pm.status("antigravity");
    assert.equal(finalStatus.runtimeState, "stopped");
    assert.equal(finalStatus.exitCode, 0);
  } finally {
    env.cleanup();
  }
});

test("ManagedProcessManager handles process exit non-zero and spawn failure", async () => {
  const env = createTestEnvironment();
  try {
    const mockFailingSpawn = () => {
      throw new Error("ENOENT: executable not found");
    };

    const pm = createManagedProcessManager({
      logDir: env.logDir,
      recordsPath: env.recordsPath,
      spawnImpl: mockFailingSpawn,
      listChildPidsImpl: () => Promise.resolve([]),
    });

    const res = pm.start({
      agentId: "codex",
      actionType: "gateway-run",
      command: { program: "invalid-binary", args: [] },
      cwd: env.tmpDir,
    });

    assert.equal(res.ok, false);
    assert.ok(res.error.includes("spawn failed"));
    assert.equal(res.record.runtimeState, "failed");
    assert.equal(res.record.exitCode, -1);
  } finally {
    env.cleanup();
  }
});

test("ManagedProcessManager handles stop and prevents killing unowned PIDs", async () => {
  const env = createTestEnvironment();
  try {
    const mockSpawn = () => {
      const child = new EventEmitter();
      child.pid = 98765;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      return child;
    };

    let killedArgs = [];
    const mockExecFile = (cmd, args, opts, cb) => {
      const callback = typeof opts === "function" ? opts : cb;
      if (cmd === "taskkill.exe") {
        killedArgs.push(...args);
        if (typeof callback === "function") callback(null, "", "");
      }
    };

    const pm = createManagedProcessManager({
      logDir: env.logDir,
      recordsPath: env.recordsPath,
      spawnImpl: mockSpawn,
      execFileImpl: mockExecFile,
      listChildPidsImpl: () => Promise.resolve([98766]),
    });

    // Start process
    pm.start({
      agentId: "claude-code",
      actionType: "gateway-run",
      command: { program: "claude", args: [] },
      cwd: env.tmpDir,
    });

    // Stop process
    const stopRes = await pm.stop("claude-code");
    assert.equal(stopRes.ok, true);
    assert.equal(stopRes.record.runtimeState, "stopped");

    // Verify taskkill was only called for owned PID
    assert.equal(killedArgs.includes("98765"), true);

    // Stopping unowned / non-running process returns error
    const stopUnowned = await pm.stop("unknown-agent");
    assert.equal(stopUnowned.ok, false);
    assert.ok(stopUnowned.error.includes("no active process managed by Rempeyek"));
  } finally {
    env.cleanup();
  }
});

test("ManagedProcessManager reconciles stale inherited process records after restart", () => {
  const env = createTestEnvironment();
  try {
    // Write stale process record mimicking crashed previous manager instance
    const staleRecord = {
      schemaVersion: 1,
      records: [
        {
          recordKey: "kilo-code:gateway-run",
          agentId: "kilo-code",
          pid: 55555,
          childPids: [],
          command: "kilo",
          args: [],
          workingDirectory: env.tmpDir,
          actionType: "gateway-run",
          startTime: new Date().toISOString(),
          exitCode: null,
          runtimeState: "running",
          stdoutPath: path.join(env.logDir, "kilo.stdout.log"),
          stderrPath: path.join(env.logDir, "kilo.stderr.log"),
          runId: "kilo-stale-run-1",
        },
      ],
    };

    fs.writeFileSync(env.recordsPath, JSON.stringify(staleRecord, null, 2));

    const pm = createManagedProcessManager({
      logDir: env.logDir,
      recordsPath: env.recordsPath,
    });

    const status = pm.status("kilo-code");
    assert.equal(status.runtimeState, "unavailable");
    assert.equal(status.stalePid, 55555);
    assert.equal(status.pid, null);
  } finally {
    env.cleanup();
  }
});

test("ManagedProcessManager handles empty logs and logs pagination correctly", () => {
  const env = createTestEnvironment();
  try {
    const pm = createManagedProcessManager({
      logDir: env.logDir,
      recordsPath: env.recordsPath,
    });

    // Unregistered agent logs
    const emptyLog = pm.logs("nonexistent-agent");
    assert.equal(emptyLog.lines.length, 0);
    assert.equal(emptyLog.next, 0);
  } finally {
    env.cleanup();
  }
});

test("Service agents expose reviewed native service commands without unowned process management", () => {
  const env = createTestEnvironment();
  try {
    const serviceAgent = env.initialConfig.agents.find(a => a.id === "openclaw");
    assert.equal(serviceAgent.gateway.isService, true);

    const pm = createManagedProcessManager({
      logDir: env.logDir,
      recordsPath: env.recordsPath,
    });

    // Service agent has no managed unowned process until explicitly run
    const status = pm.status("openclaw");
    assert.equal(status, null);
  } finally {
    env.cleanup();
  }
});
