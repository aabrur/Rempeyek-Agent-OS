import { execFile as nodeExecFile, spawn as nodeSpawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RUNTIME_STATES = Object.freeze([
  "idle", "starting", "running", "waiting", "stopping", "stopped", "failed", "unavailable",
]);

const ACTIVE_STATES = new Set(["starting", "running", "waiting", "stopping"]);
const SAFE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const SAFE_ACTION = /^[a-z][a-z0-9-]{1,63}$/;
const SAFE_PROGRAM = /^[A-Za-z0-9._/-]+(?:\\[A-Za-z0-9._/-]+)*$/;
const safeArgument = value => typeof value === "string" && value.length <= 4096 && !/[\u0000-\u001f]/.test(value);

const recordKey = (agentId, actionType) => `${agentId}:${actionType}`;
const clone = record => record ? JSON.parse(JSON.stringify(record)) : null;
const nowIso = now => new Date(now()).toISOString();

function validStartSpec(spec) {
  const command = spec?.command;
  if (!SAFE_ID.test(String(spec?.agentId || ""))) return "invalid agent id";
  if (!SAFE_ACTION.test(String(spec?.actionType || ""))) return "invalid action type";
  if (!command || !SAFE_PROGRAM.test(String(command.program || ""))) return "invalid executable";
  if (!Array.isArray(command.args) || !command.args.every(safeArgument)) return "invalid arguments";
  if (!spec.cwd || typeof spec.cwd !== "string") return "working directory is required";
  return null;
}

function defaultChildPidCollector(pid, platform) {
  if (platform !== "win32") return Promise.resolve([]);
  const rootPid = Number(pid);
  if (!Number.isInteger(rootPid) || rootPid <= 0) return Promise.resolve([]);
  const script = [
    `$root = ${rootPid}`,
    "$all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue",
    "$todo = [System.Collections.Generic.Queue[int]]::new()",
    "$todo.Enqueue($root)",
    "$seen = [System.Collections.Generic.HashSet[int]]::new()",
    "while ($todo.Count -gt 0) {",
    "  $parent = $todo.Dequeue()",
    "  foreach ($child in ($all | Where-Object { $_.ParentProcessId -eq $parent })) {",
    "    $childPid = [int]$child.ProcessId",
    "    if ($seen.Add($childPid)) { $childPid; $todo.Enqueue($childPid) }",
    "  }",
    "}",
  ].join("; ");
  return new Promise(resolve => {
    nodeExecFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 4000 }, (error, stdout) => {
      if (error) return resolve([]);
      const pids = String(stdout).split(/\r?\n/)
        .map(value => Number(value.trim()))
        .filter(value => Number.isInteger(value) && value > 0 && value !== rootPid);
      resolve([...new Set(pids)]);
    });
  });
}

export function createManagedProcessManager({
  logDir,
  recordsPath,
  platform = process.platform,
  spawnImpl = nodeSpawn,
  execFileImpl = nodeExecFile,
  killProcessImpl = process.kill.bind(process),
  listChildPidsImpl = pid => defaultChildPidCollector(pid, platform),
  now = Date.now,
  onLog = null,
} = {}) {
  if (!logDir || !recordsPath) throw new Error("logDir and recordsPath are required");
  fs.mkdirSync(logDir, { recursive: true });
  const records = new Map();
  const children = new Map();
  const lines = new Map();
  const waiters = new Map();

  const persist = () => {
    const body = { schemaVersion: 1, records: [...records.values()].map(clone) };
    const temporary = `${recordsPath}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(recordsPath), { recursive: true });
    fs.writeFileSync(temporary, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, recordsPath);
  };

  const find = (agentId, actionType = "gateway-run") =>
    records.get(recordKey(String(agentId || ""), actionType)) || null;

  const settle = record => {
    const key = record.recordKey;
    const pending = waiters.get(key) || [];
    waiters.delete(key);
    for (const resolve of pending) resolve(clone(record));
  };

  const append = (record, stream, chunk) => {
    const target = stream === "err" ? record.stderrPath : record.stdoutPath;
    try { fs.appendFileSync(target, String(chunk)); } catch {}
    const bucket = lines.get(record.recordKey) || { next: 0, entries: [] };
    for (const text of String(chunk).split(/\r?\n/)) {
      if (!text) continue;
      const entry = { i: bucket.next++, t: new Date(now()).toISOString().slice(11, 19), s: stream, line: text.slice(0, 500) };
      bucket.entries.push(entry);
      if (bucket.entries.length > 800) bucket.entries.splice(0, bucket.entries.length - 800);
      try { onLog?.(clone(record), stream, text); } catch {}
    }
    lines.set(record.recordKey, bucket);
  };

  const reconcileInherited = () => {
    let changed = false;
    try {
      const parsed = JSON.parse(fs.readFileSync(recordsPath, "utf8"));
      for (const raw of parsed?.records || []) {
        if (!SAFE_ID.test(String(raw?.agentId || "")) || !SAFE_ACTION.test(String(raw?.actionType || ""))) continue;
        const record = { ...raw, recordKey: raw.recordKey || recordKey(raw.agentId, raw.actionType) };
        if (ACTIVE_STATES.has(record.runtimeState)) {
          record.stalePid = record.pid || null;
          record.pid = null;
          record.childPids = [];
          record.runtimeState = "unavailable";
          record.reason = "Process ownership cannot be verified after manager restart";
          changed = true;
        }
        records.set(record.recordKey, record);
      }
    } catch {}
    if (changed) persist();
  };
  reconcileInherited();

  const status = (agentId, actionType = "gateway-run") => clone(find(agentId, actionType));

  const currentLogs = (agentId, since = 0, actionType = "gateway-run") => {
    const key = recordKey(String(agentId || ""), actionType);
    const bucket = lines.get(key);
    if (!bucket) {
      const record = records.get(key);
      if (!record) return { lines: [], next: 0 };
      const read = (file, stream) => {
        try {
          return fs.readFileSync(file, "utf8").split(/\r?\n/)
            .filter(Boolean)
            .map(line => ({ s: stream, line: line.slice(0, 500) }));
        } catch { return []; }
      };
      const restored = [...read(record.stdoutPath, "out"), ...read(record.stderrPath, "err")]
        .map((entry, index) => ({ i: index, t: null, ...entry }));
      return { lines: restored.filter(entry => entry.i >= since), next: restored.length };
    }
    return { lines: bucket.entries.filter(entry => entry.i >= since), next: bucket.next };
  };

  const waitForExit = (agentId, actionType = "gateway-run") => {
    const record = find(agentId, actionType);
    if (!record || !ACTIVE_STATES.has(record.runtimeState)) return Promise.resolve(clone(record));
    return new Promise(resolve => {
      const key = record.recordKey;
      const pending = waiters.get(key) || [];
      pending.push(resolve);
      waiters.set(key, pending);
    });
  };

  const start = spec => {
    const invalid = validStartSpec(spec);
    if (invalid) return { ok: false, error: invalid };
    const key = recordKey(spec.agentId, spec.actionType);
    const existing = records.get(key);
    if (existing && ACTIVE_STATES.has(existing.runtimeState)) {
      return { ok: false, error: `${spec.agentId} already has a managed ${spec.actionType} process` };
    }
    if (!fs.existsSync(spec.cwd)) return { ok: false, error: `cwd does not exist: ${spec.cwd}` };

    const runId = `${spec.agentId}-${spec.actionType}-${crypto.randomUUID()}`;
    const record = {
      recordKey: key,
      agentId: spec.agentId,
      pid: null,
      childPids: [],
      command: spec.command.program,
      args: [...spec.command.args],
      workingDirectory: spec.cwd,
      actionType: spec.actionType,
      startTime: nowIso(now),
      exitCode: null,
      runtimeState: "starting",
      stdoutPath: path.join(logDir, `${runId}.stdout.log`),
      stderrPath: path.join(logDir, `${runId}.stderr.log`),
      runId,
      reason: null,
      stopRequested: false,
    };
    try {
      fs.closeSync(fs.openSync(record.stdoutPath, "a"));
      fs.closeSync(fs.openSync(record.stderrPath, "a"));
      records.set(key, record);
      persist();
      const child = spawnImpl(record.command, record.args, {
        cwd: record.workingDirectory,
        env: spec.env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (!Number.isInteger(child?.pid) || child.pid <= 0) throw new Error("spawn returned no PID");
      record.pid = child.pid;
      record.runtimeState = "running";
      children.set(key, child);
      child.stdout?.on?.("data", chunk => append(record, "out", chunk));
      child.stderr?.on?.("data", chunk => append(record, "err", chunk));
      child.on?.("error", error => {
        if (!ACTIVE_STATES.has(record.runtimeState)) return;
        record.runtimeState = "failed";
        record.exitCode = -1;
        record.reason = error.message;
        append(record, "err", error.message);
        children.delete(key);
        persist();
        settle(record);
      });
      child.on?.("exit", code => {
        record.exitCode = Number.isInteger(code) ? code : null;
        record.runtimeState = record.stopRequested || code === 0 ? "stopped" : "failed";
        if (record.runtimeState === "failed") record.reason = `process exited with code ${code}`;
        children.delete(key);
        persist();
        settle(record);
      });
      persist();
      return { ok: true, record: status(record.agentId, record.actionType) };
    } catch (error) {
      record.runtimeState = "failed";
      record.exitCode = -1;
      record.reason = error.message;
      records.set(key, record);
      persist();
      settle(record);
      return { ok: false, error: `spawn failed: ${error.message}`, record: status(record.agentId, record.actionType) };
    }
  };

  const addChildPid = (agentId, pid, actionType = "gateway-run") => {
    const record = find(agentId, actionType);
    if (!record || !Number.isInteger(pid) || pid <= 0 || pid === record.pid) return false;
    if (!record.childPids.includes(pid)) record.childPids.push(pid);
    persist();
    return true;
  };

  const stop = (agentId, actionType = "gateway-run") => new Promise(resolve => {
    const record = find(agentId, actionType);
    const child = record && children.get(record.recordKey);
    if (!record || !ACTIVE_STATES.has(record.runtimeState) || !record.pid || !child) {
      return resolve({ ok: false, error: "no active process managed by Rempeyek", record: status(agentId, actionType) });
    }
    record.runtimeState = "stopping";
    record.stopRequested = true;
    persist();
    const complete = error => {
      if (error) {
        record.runtimeState = "failed";
        record.reason = `failed to stop managed process: ${error.message || error}`;
        persist();
        settle(record);
        return resolve({ ok: false, error: record.reason, record: status(agentId, actionType) });
      }
      record.runtimeState = "stopped";
      children.delete(record.recordKey);
      persist();
      settle(record);
      resolve({ ok: true, record: status(agentId, actionType) });
    };
    Promise.resolve(listChildPidsImpl(record.pid)).then(childPids => {
      record.childPids = [...new Set((childPids || []).filter(pid => Number.isInteger(pid) && pid > 0 && pid !== record.pid))];
      persist();
      if (platform === "win32") {
        return execFileImpl("taskkill.exe", ["/pid", String(record.pid), "/T", "/F"], complete);
      }
      try {
        killProcessImpl(-record.pid, "SIGTERM");
        complete(null);
      } catch (error) {
        try { child.kill?.("SIGTERM"); complete(null); } catch { complete(error); }
      }
    }).catch(error => complete(error));
  });

  const stopAll = () => Promise.all(
    [...records.values()]
      .filter(record => ACTIVE_STATES.has(record.runtimeState))
      .map(record => stop(record.agentId, record.actionType)),
  );

  return Object.freeze({ start, stop, stopAll, status, logs: currentLogs, waitForExit, addChildPid });
}
