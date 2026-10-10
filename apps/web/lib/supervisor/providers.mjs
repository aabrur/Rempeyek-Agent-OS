import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import childEnv from '../child-env.cjs';
import { resolveSpawnSpec } from '../process-adapters.mjs';

const OUTPUT_LIMIT = 256 * 1024;
const LINE_LIMIT = 64 * 1024;
const DISCOVERY_TTL_MS = 60_000;
const MAX_CONCURRENCY = 3;
const PROCESS_CLOSE_TIMEOUT_MS = 4_000;
const TASKKILL_TIMEOUT_MS = 2_000;
const SESSION = randomUUID();
const secretPattern = /(?:authorization\s*[:=]\s*(?:bearer\s+)?|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi;

export function redactProviderOutput(value) {
  return String(value ?? '').replace(secretPattern, '[REDACTED]')
    .replace(/\b(?:sk-|xai-|AIza)[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .slice(0, OUTPUT_LIMIT);
}

function cleanObject(value) {
  try { return JSON.parse(redactProviderOutput(JSON.stringify(value))); } catch { return null; }
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { return error.code === 'ENOENT' ? {} : null; }
}

function rejectProjectConfiguration(cwd) {
  let current = path.resolve(cwd);
  const home = path.resolve(os.homedir());
  for (;;) {
    if (current !== home && fs.existsSync(path.join(current, '.codex', 'config.toml'))) throw new Error('Project Codex configuration requires a reviewed isolation policy before Supervisor execution.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${SESSION}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function executable(name, override) {
  if (override) {
    if (!path.isAbsolute(override) || !fs.existsSync(override) || !fs.statSync(override).isFile()) return null;
    return override;
  }
  const envPath = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] || '';
  const extensions = process.platform === 'win32' ? ['.exe', '.com', '.cmd'] : [''];
  for (const folder of envPath.split(path.delimiter)) {
    const directory = folder.trim().replace(/^"|"$/g, '');
    if (!path.isAbsolute(directory)) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`);
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* Continue PATH lookup. */ }
    }
  }
  return null;
}

// Resolve standard npm shims to Node directly; never run a prompt through cmd.exe.
function nativeSpec(program, args, cwd, env) {
  if (process.platform === 'win32' && /\.cmd$/i.test(program)) {
    const source = fs.readFileSync(program, 'utf8');
    const match = source.match(/"%dp0%\\([^"\r\n]+\.(?:js|mjs|cjs))"/i);
    if (!match || !source.includes('node')) throw new Error('Unrecognized CLI shim; configure a native executable path.');
    const base = path.dirname(program);
    const entry = path.resolve(base, match[1]);
    if (!entry.startsWith(`${base}${path.sep}`) || !fs.existsSync(entry)) throw new Error('Invalid npm CLI entrypoint.');
    const localNode = path.join(base, 'node.exe');
    const node = fs.existsSync(localNode) ? localNode : executable('node') || (/node\.exe$/i.test(process.execPath) ? process.execPath : null);
    if (!node || !/\.exe$/i.test(node)) throw new Error('A native Node executable is required for the npm CLI shim.');
    return { program: node, args: [entry, ...args] };
  }
  if (process.platform === 'win32' && !/\.(?:exe|com)$/i.test(program)) throw new Error('Native executable or recognized npm shim required.');
  return resolveSpawnSpec({ program, args }, { cwd, env });
}

function waitForChildClose(child, isClosed, timeoutMs) {
  if (isClosed()) return Promise.resolve(true);
  return new Promise(resolve => {
    let settled = false;
    const finish = closed => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('close', onClose);
      resolve(closed);
    };
    const onClose = () => finish(true);
    const timer = setTimeout(() => finish(isClosed()), timeoutMs);
    child.once('close', onClose);
    if (isClosed()) finish(true);
  });
}

function trustedTaskkillPath() {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (!systemRoot || !path.isAbsolute(systemRoot)) throw new Error('Windows SystemRoot is unavailable; process-tree cancellation cannot be verified.');
  const candidate = path.join(path.resolve(systemRoot), 'System32', 'taskkill.exe');
  try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* Fail closed below. */ }
  throw new Error('Trusted System32 taskkill.exe is unavailable.');
}

function invokeTaskkill(pid) {
  return new Promise(resolve => {
    let killer, settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killer && killer.exitCode === null && killer.signalCode === null) {
        try { killer.kill(); } catch { /* The helper is bounded and owns no provider process. */ }
      }
      resolve(error || null);
    };
    const timer = setTimeout(() => finish(new Error('System32 taskkill timed out.')), TASKKILL_TIMEOUT_MS);
    try {
      killer = spawn(trustedTaskkillPath(), ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
      killer.once('error', error => finish(new Error(`Could not start System32 taskkill: ${error.message}`)));
      killer.once('close', code => finish(code === 0 ? null : new Error(`System32 taskkill exited with code ${code ?? 'unknown'}.`)));
    } catch (error) { finish(new Error(`Could not start System32 taskkill: ${error.message}`)); }
  });
}

// Termination is allowed only while this registry still owns a live ChildProcess handle.
async function stopOwnedProcess(child, isClosed) {
  if (!child || isClosed()) return { closed: true, error: null };
  let error = null;
  const liveLeader = child.pid && child.exitCode === null && child.signalCode === null;
  if (!liveLeader) {
    error = new Error('The owned wrapper exited before its process tree was confirmed closed; its PID will not be reused for termination.');
  } else if (process.platform === 'win32') {
    try { error = await invokeTaskkill(child.pid); } catch (failure) { error = failure; }
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (failure) { if (failure.code !== 'ESRCH') error = failure; }
  }
  const closed = await waitForChildClose(child, isClosed, PROCESS_CLOSE_TIMEOUT_MS);
  if (!closed && !error) error = new Error('The owned provider process tree did not confirm closure before the cancellation deadline.');
  return { closed, error };
}

function runProcess({ program, args, cwd, env, input = '', timeoutMs = 15000, onStart, onLine, onClose }) {
  const spec = nativeSpec(program, args, cwd, env);
  const child = spawn(spec.program, spec.args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errorOutput = '', pending = '', discardedLine = false;
  let timedOut = false, cancelled = false, failure = null, childClosed = false, settled = false, stopTask = null;
  let exitCode = null, exitSignal = null, timer;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });

  const settle = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolveDone({ code: exitCode, signal: exitSignal, stdout: redactProviderOutput(output), stderr: redactProviderOutput(errorOutput), timedOut, cancelled, failure, processRetained: !childClosed });
  };
  const deliverPending = () => {
    if (!pending || discardedLine) return;
    try { onLine?.(redactProviderOutput(pending.trim())); } catch { /* Parsing must not interrupt process ownership. */ }
  };
  const handleClose = (code, signal) => {
    if (childClosed) return;
    childClosed = true;
    exitCode = code;
    exitSignal = signal;
    clearTimeout(timer);
    deliverPending();
    try { onClose?.({ code, signal }); } catch { /* Cleanup observers are isolated. */ }
    settle();
  };
  const requestStop = reason => {
    if (reason === 'timeout') timedOut = true;
    else cancelled = true;
    if (!stopTask) stopTask = (async () => {
      const stopped = await stopOwnedProcess(child, () => childClosed);
      if (stopped.error) failure = stopped.error.message;
      // Resolve the caller even when the process tree ignores termination. Ownership stays active.
      settle();
      return stopped;
    })();
    return stopTask;
  };

  timer = setTimeout(() => { void requestStop('timeout'); }, Math.max(1000, timeoutMs));
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    output = (output + chunk).slice(-OUTPUT_LIMIT);
    for (const part of chunk.split(/(?<=\n)/)) {
      if (!discardedLine) pending += part;
      if (pending.length > LINE_LIMIT) { pending = ''; discardedLine = true; }
      if (part.endsWith('\n')) {
        if (!discardedLine) { try { onLine?.(redactProviderOutput(pending.trim())); } catch { /* Observer isolation. */ } }
        pending = ''; discardedLine = false;
      }
    }
  });
  child.stderr.on('data', chunk => { errorOutput = (errorOutput + chunk).slice(-OUTPUT_LIMIT); });
  child.once('exit', (code, signal) => { exitCode = code; exitSignal = signal; });
  child.once('error', error => { failure = error.message; });
  child.once('close', handleClose);
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  try { onStart?.(child); } catch (error) {
    failure = error.message;
    requestStop('cancelled');
  }
  return {
    child, done,
    cancel: () => requestStop('cancelled'),
    waitForClose: timeoutMs => waitForChildClose(child, () => childClosed, timeoutMs),
    get closed() { return childClosed; },
  };
}

function parseLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function result(status, summary, errors = [], safeToRetry = false) {
  return { status, summary, structured: null, exitCode: null, errors, executionEvidence: [], sessionId: null, safeToRetry };
}

function extractStructured(text, direct = null) {
  if (direct && typeof direct === 'object') return cleanObject(direct);
  try { return cleanObject(JSON.parse(text)); } catch { /* Markdown wrappers are accepted, never evaluated. */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  try { return fenced ? cleanObject(JSON.parse(fenced[1])) : null; } catch { return null; }
}

function codexEvent(line) {
  const event = parseLine(line);
  if (!event || typeof event !== 'object') return null;
  const item = event.item;
  const type = String(event.type || '');
  const itemType = String(item?.type || '');
  const nativeFailure = type === 'error' || type === 'turn.failed';
  const failureMessage = nativeFailure ? redactProviderOutput(event.message || event.error?.message || 'Native execution failed.') : null;
  const actionStarted = type === 'item.started' || type === 'tool.started'
    || ['command_execution', 'file_change', 'mcp_tool_call'].includes(itemType);
  const evidence = item && ['command_execution', 'file_change', 'mcp_tool_call'].includes(itemType)
    ? cleanObject({ type: itemType, status: item.status || (type === 'item.started' ? 'started' : undefined), command: item.command, exitCode: item.exit_code, changes: item.changes }) : null;
  return {
    event,
    sessionId: event.thread_id || event.session_id,
    text: item?.type === 'agent_message' && typeof item.text === 'string' ? item.text : null,
    replaceText: item?.type === 'agent_message' && typeof item.text === 'string',
    structured: event.structured_output || null,
    nativeFailure,
    failureMessage,
    actionStarted,
    evidence,
  };
}

function grokEvent(line) {
  const event = parseLine(line);
  if (!event || typeof event !== 'object') return null;
  const type = String(event.type || event.event || '');
  const nativeFailure = type === 'error' || type === 'turn.failed';
  const failureMessage = nativeFailure ? redactProviderOutput(event.message || event.error?.message || 'Native execution failed.') : null;
  const actionStarted = /tool|command|file_change|mcp|agent\.spawn/i.test(type)
    || Boolean(event.tool_call || event.tool_info || event.tool);
  const evidence = actionStarted ? cleanObject({ type, status: event.status || 'started', tool: event.tool || event.tool_info || event.tool_call, command: event.command }) : null;
  const text = type === 'text' && typeof event.data === 'string' ? event.data
    : typeof event.text === 'string' ? event.text : null;
  return {
    event,
    sessionId: event.sessionId || event.session_id,
    text,
    replaceText: typeof event.text === 'string' && type !== 'text',
    structured: event.structured || event.structured_output || null,
    nativeFailure,
    failureMessage,
    actionStarted,
    evidence,
  };
}

function antigravityEvent(line) {
  const event = parseLine(line);
  if (!event || typeof event !== 'object') return null;
  const type = String(event.event || event.type || '');
  const step = event.step_update;
  const terminal = event.result;
  const nativeFailure = type === 'error' || type === 'turn.failed';
  const failureMessage = nativeFailure ? redactProviderOutput(event.message || event.error?.message || 'Native execution failed.') : null;
  const actionStarted = type === 'item.started' || step?.step_type === 'tool' || Boolean(step?.tool_info);
  const evidence = step?.step_type === 'tool' || step?.tool_info
    ? cleanObject({ type: step.tool_name || step.tool_info?.name || 'tool', status: step.state || 'started', tool: step.tool_info }) : null;
  const text = step?.step_type === 'agent_response' && typeof step.text_delta === 'string' ? step.text_delta
    : terminal && typeof terminal.response === 'string' ? terminal.response : null;
  return {
    event,
    sessionId: event.conversation_id || terminal?.conversation_id,
    text,
    replaceText: Boolean(terminal && typeof terminal.response === 'string'),
    structured: terminal?.structured_output || null,
    nativeFailure,
    failureMessage,
    actionStarted,
    evidence,
  };
}

function privatePrompt(stateDir, prompt) {
  const directory = path.join(stateDir, 'prompts');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${randomUUID()}.txt`);
  fs.writeFileSync(file, prompt, { flag: 'wx', mode: 0o600 });
  let removed = false;
  return { file, cleanup() { if (removed) return; removed = true; try { fs.rmSync(file, { force: true }); } catch { /* Private orphan remains covered by provider state. */ } } };
}

export class CodexAdapter {
  id = 'codex'; name = 'Codex'; binary = 'codex';
  helpArgs = ['exec', '--help'];
  validate(help) {
    return ['--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config', '--disable', '--config', '--sandbox', 'read-only', 'workspace-write'].every(flag => help.includes(flag));
  }
  diagnostic = 'Codex execution requires verified auth and locked workspace, MCP, plugin, hook and network settings.';
  args(role) {
    return ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config',
      '--disable', 'hooks', '--disable', 'plugins',
      '--config', 'mcp_servers={}', '--config', 'plugins={}', '--config', 'sandbox_workspace_write.network_access=false',
      '--sandbox', role === 'BODY' ? 'workspace-write' : 'read-only', '-'];
  }
  parseLine = codexEvent;
  eligible({ auth }) { return auth === 'AUTHENTICATED'; }
}

export class GrokBuildAdapter {
  id = 'grok-build'; name = 'Grok Build'; binary = 'grok'; helpArgs = ['--help'];
  validate(help) {
    return ['--prompt-file', '--output-format', 'streaming-json', '--permission-mode', 'dontAsk', '--sandbox', '--tools', '--disallowed-tools', '--deny', '--no-subagents', '--disable-web-search', '--max-turns', '--cwd'].every(flag => help.includes(flag));
  }
  diagnostic = 'Grok Build execution requires verified auth and sandbox permissions.';
  prepare({ stateDir, prompt, role, cwd }) {
    const file = privatePrompt(stateDir, prompt);
    return {
      args: ['--prompt-file', file.file, '--output-format', 'streaming-json', '--permission-mode', role === 'BODY' ? 'dontAsk' : 'plan',
        '--no-subagents', '--disable-web-search', '--max-turns', '20', '--cwd', cwd],
      input: '', cleanup: file.cleanup,
    };
  }
  parseLine = grokEvent;
  eligible({ auth }) { return auth === 'AUTHENTICATED'; }
}

export class AntigravityAdapter {
  id = 'antigravity'; name = 'Antigravity'; binary = 'agy'; helpArgs = ['--help'];
  validate(help) {
    return ['--input-format', 'text', '--output-format', 'stream-json', '--mode', 'plan', 'accept-edits', '--sandbox', '--disable-slash-commands', '--print-timeout'].every(flag => help.includes(flag));
  }
  diagnostic = 'Antigravity execution requires verified auth and sandbox permissions.';
  prepare({ role, timeoutMs, prompt }) {
    return {
      args: ['-p', '--input-format', 'text', '--output-format', 'stream-json', '--mode', role === 'BODY' ? 'accept-edits' : 'plan',
        '--sandbox', '--disable-slash-commands', '--print-timeout', `${Math.ceil(timeoutMs / 1000)}s`],
      input: prompt, cleanup() {},
    };
  }
  parseLine = antigravityEvent;
  eligible({ auth }) { return auth === 'AUTHENTICATED'; }
}

export function createProviderRegistry({ stateDir, onEvent = () => {} }) {
  if (!stateDir || !path.isAbsolute(stateDir)) throw new Error('Absolute provider state directory required.');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const file = path.join(stateDir, 'providers.json');
  const saved = readState(file);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Provider state is invalid; preserve it and reconcile process ownership before restarting Supervisor.');
  const settings = saved.settings || {};
  const staleProcesses = [...(saved.staleProcesses || []), ...(saved.processes || [])].slice(-100);
  for (const [id, config] of Object.entries(settings)) {
    if (!config || typeof config !== 'object') { settings[id] = {}; continue; }
    config.manualAvailability = String(config.manualAvailability || '').toUpperCase() === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AUTO';
    config.concurrency = Number.isInteger(config.concurrency) ? Math.max(1, Math.min(MAX_CONCURRENCY, config.concurrency)) : 1;
  }
  const active = new Map();
  const adapters = new Map([new CodexAdapter(), new GrokBuildAdapter(), new AntigravityAdapter()].map(adapter => [adapter.id, adapter]));
  const descriptors = new Map();
  let closed = false, discovering = null, lastDiscoveryAt = 0, discoveryGeneration = 0;
  const publish = event => { try { onEvent(cleanObject({ ...event, at: new Date().toISOString() })); } catch { /* Observers must not interrupt process ownership. */ } };
  const persist = () => atomicWrite(file, { settings, staleProcesses, processes: [...active.values()].map(job => ({
    pid: job.child.pid || null, owner: SESSION, runId: job.runId, unitId: job.unitId, providerId: job.providerId, startedAt: job.startedAt,
  })) });
  for (const adapter of adapters.values()) {
    descriptors.set(adapter.id, {
      id: adapter.id, name: adapter.name, installed: false, program: null, auth: 'UNKNOWN', discovered: false,
      diagnostic: 'Discovery pending.', runningJobs: 0, concurrency: settings[adapter.id]?.concurrency || 1,
      quota: { status: 'UNKNOWN' }, cooldownUntil: settings[adapter.id]?.cooldownUntil || null,
      lastFailure: settings[adapter.id]?.lastFailure || null, capabilities: { execute: false, readOnly: false, roles: [] },
    });
  }
  const snapshot = () => [...descriptors.values()].map(descriptor => {
    const config = settings[descriptor.id] || {};
    const runningJobs = [...active.values()].filter(job => job.providerId === descriptor.id).length;
    const recovery = staleProcesses.filter(job => job.providerId === descriptor.id);
    let availability = 'UNKNOWN';
    if (recovery.length || config.manualAvailability === 'UNAVAILABLE') availability = 'UNAVAILABLE';
    else if (!descriptor.discovered) availability = 'UNKNOWN';
    else if (!descriptor.installed || descriptor.capabilities.execute === false && descriptor.auth !== 'AUTH_REQUIRED') availability = 'UNAVAILABLE';
    else if (descriptor.auth === 'AUTH_REQUIRED') availability = 'AUTH_REQUIRED';
    else if (Date.parse(config.cooldownUntil || '') > Date.now()) availability = 'COOLDOWN';
    else if (runningJobs >= descriptor.concurrency) availability = 'BUSY';
    else if (descriptor.capabilities.execute) availability = 'AVAILABLE';
    const { program, discovered, ...publicDescriptor } = descriptor;
    return {
      ...publicDescriptor,
      executablePath: config.executablePath || program || null,
      runningJobs,
      availability,
      manualAvailability: config.manualAvailability || 'AUTO',
      cooldownUntil: config.cooldownUntil || null,
      lastFailure: config.lastFailure || null,
      lastSuccessfulExecution: config.lastSuccessfulExecution || null,
      staleProcesses: recovery.map(job => ({ ...job, status: 'OWNERSHIP_UNKNOWN', diagnostic: 'Prior process identity is unverifiable. No PID was terminated; resume remains fail-closed until reconciliation can prove the process exited.' })),
    };
  });

  async function discover() {
    if (Date.now() - lastDiscoveryAt < DISCOVERY_TTL_MS) return snapshot();
    if (discovering) return discovering;
    const generation = discoveryGeneration;
    const task = (async () => {
      for (const adapter of adapters.values()) {
        if (generation !== discoveryGeneration) break;
        const descriptor = descriptors.get(adapter.id);
        const program = executable(adapter.binary, settings[adapter.id]?.executablePath);
        descriptor.discovered = true;
        descriptor.installed = Boolean(program);
        descriptor.program = program;
        descriptor.executablePath = program;
        descriptor.auth = 'UNKNOWN';
        descriptor.capabilities = { execute: false, readOnly: false, roles: [] };
        if (!program) { descriptor.diagnostic = 'CLI not found on PATH. Install it or configure an absolute executable path.'; continue; }
        try {
          const env = childEnv.buildAgentEnv({ id: adapter.id }, process.env, stateDir);
          const help = await runProcess({ program, args: adapter.helpArgs, cwd: stateDir, env, timeoutMs: 15000 }).done;
          const supported = help.code === 0 && !help.timedOut && !help.processRetained && adapter.validate(help.stdout + help.stderr);
          if (adapter.id === 'codex' && supported) {
            const auth = await runProcess({ program, args: ['login', 'status'], cwd: stateDir, env, timeoutMs: 15000 }).done;
            const authText = `${auth.stdout}\n${auth.stderr}`;
            if (auth.code === 0 && /not logged in|not authenticated/i.test(authText)) {
              descriptor.auth = 'AUTH_REQUIRED';
              descriptor.diagnostic = 'Sign in using the native Codex CLI first.';
            } else if (auth.code === 0 && /logged in|authenticated/i.test(authText)) descriptor.auth = 'AUTHENTICATED';
            else descriptor.diagnostic = 'Codex authentication status could not be verified.';
          } else if (adapter.id === 'grok-build' && supported) {
            const auth = await runProcess({ program, args: ['models'], cwd: stateDir, env, timeoutMs: 15000 }).done;
            const authText = `${auth.stdout}\n${auth.stderr}`;
            if (auth.code === 0 && /logged in/i.test(authText)) descriptor.auth = 'AUTHENTICATED';
            else if (auth.code !== 0 || /not logged in/i.test(authText)) {
              descriptor.auth = 'AUTH_REQUIRED';
              descriptor.diagnostic = 'Sign in using grok login --oauth first.';
            } else descriptor.auth = 'AUTHENTICATED';
          } else if (adapter.id === 'antigravity' && supported) {
            const auth = await runProcess({ program, args: ['models'], cwd: stateDir, env, timeoutMs: 15000 }).done;
            if (auth.code === 0) descriptor.auth = 'AUTHENTICATED';
            else {
              descriptor.auth = 'AUTH_REQUIRED';
              descriptor.diagnostic = 'Sign in using native Antigravity CLI first.';
            }
          }
          const eligible = supported && adapter.eligible({ platform: process.platform, auth: descriptor.auth });
          descriptor.capabilities = { execute: Boolean(eligible), readOnly: Boolean(eligible), roles: eligible ? ['HEAD', 'BODY', 'TAIL'] : [] };
          descriptor.diagnostic = eligible ? 'Native CLI contract and confinement flags verified.' : adapter.diagnostic || 'Required sandbox and noninteractive CLI flags are unavailable.';
        } catch (error) { descriptor.diagnostic = redactProviderOutput(error.message); }
      }
      if (generation === discoveryGeneration) lastDiscoveryAt = Date.now();
      return snapshot();
    })();
    discovering = task;
    try { return await task; }
    finally { if (discovering === task) discovering = null; }
  }

  function removeClosedJob(job) {
    if (!job || job.closed) return;
    job.closed = true;
    if (active.get(job.key) === job) active.delete(job.key);
    try { job.cleanup?.(); } catch { /* The state directory remains the private recovery boundary. */ }
    persist();
    if (!job.finishedEventSent) {
      job.finishedEventSent = true;
      publish({ type: 'provider.finished', runId: job.runId, unitId: job.unitId, providerId: job.providerId });
    }
  }

  async function execute(providerId, { runId, unitId, role, cwd, prompt, images = [], onEvent: listener, timeoutMs = 900000 }) {
    if (closed) return result('failed', 'Provider registry is shut down.');
    const descriptor = snapshot().find(item => item.id === providerId);
    if (!descriptor || descriptor.availability !== 'AVAILABLE') return result('failed', `Provider ${providerId} is not available: ${descriptor?.diagnostic || 'unknown provider'}`);
    const adapter = adapters.get(providerId);
    if (!['HEAD', 'BODY', 'TAIL'].includes(role) || !descriptor.capabilities.roles.includes(role)) return result('failed', 'Unsupported provider role.');
    if (!runId || !unitId || !path.isAbsolute(cwd || '') || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 512000) return result('failed', 'Invalid execution input.');
    if (!Array.isArray(images) || images.length > 12 || images.some(file => typeof file !== 'string' || !path.isAbsolute(file))) return result('failed', 'Invalid image input.');
    if (images.length && providerId !== 'codex') return result('failed', 'This provider does not support image attachments.');
    const key = `${runId}:${unitId}`;
    if (active.has(key)) return result('failed', 'Unit already has an owned process.');
    const boundedTimeout = Math.max(1000, Math.min(Number(timeoutMs) || 900000, 3600000));
    let finalText = '', sessionId = null, structured = null;
    let actionStarted = false, nativeFailure = false;
    const evidence = [], errors = [];
    const emit = event => { publish(event); try { listener?.(cleanObject(event)); } catch { /* Observer isolation. */ } };
    let job = null, processRun = null, cleanup = () => {};
    try {
      if (providerId === 'codex') rejectProjectConfiguration(cwd);
      const env = childEnv.buildAgentEnv({ id: providerId }, process.env, cwd);
      const prepared = adapter.prepare ? adapter.prepare({ stateDir, cwd, prompt, role, timeoutMs: boundedTimeout }) : { args: adapter.args(role), input: prompt, cleanup() {} };
      if (images.length) prepared.args.splice(prepared.args.length - 1, 0, ...images.flatMap(file => ['--image', file]));
      cleanup = prepared.cleanup || (() => {});
      processRun = runProcess({
        program: descriptor.executablePath,
        args: prepared.args,
        cwd,
        env,
        input: prepared.input ?? prompt,
        timeoutMs: boundedTimeout,
        onStart: child => {
          job = { key, child, runId, unitId, providerId, startedAt: new Date().toISOString(), cancelled: false, closed: false, cleanup, finishedEventSent: false };
          active.set(key, job);
          persist();
          emit({ type: 'provider.started', runId, unitId, providerId, pid: child.pid, role });
        },
        onLine: line => {
          const parsed = adapter.parseLine(line);
          if (!parsed) return;
          if (parsed.sessionId) sessionId = String(parsed.sessionId).slice(0, 200);
          if (parsed.text !== null && parsed.text !== undefined) {
            if (parsed.replaceText) finalText = String(parsed.text).slice(0, OUTPUT_LIMIT);
            else finalText = (finalText + parsed.text).slice(-OUTPUT_LIMIT);
          }
          if (parsed.structured) structured = cleanObject(parsed.structured);
          if (parsed.nativeFailure) nativeFailure = true;
          if (parsed.failureMessage && errors.length < 30) errors.push(redactProviderOutput(parsed.failureMessage).slice(0, 4000));
          if (parsed.actionStarted) {
            actionStarted = true;
            if (evidence.length < 100) evidence.push(cleanObject(parsed.evidence || { type: 'item.started', status: 'started' }));
          } else if (parsed.evidence && evidence.length < 100) evidence.push(cleanObject(parsed.evidence));
          emit({ type: 'provider.event', runId, unitId, providerId, event: cleanObject(parsed.event) });
        },
        onClose: () => removeClosedJob(job),
      });
      if (job) job.cancel = processRun.cancel;
      const output = await processRun.done;
      const diagnostic = [output.failure, output.stderr, ...errors].filter(Boolean).join('\n').slice(0, 12000);
      const rateLimited = /rate.?limit|quota.?exceed|usage.?limit|too many requests|\b429\b/i.test(diagnostic);
      const safeToRetry = Boolean(rateLimited && nativeFailure && !actionStarted);
      const status = job?.cancelled || output.cancelled ? 'cancelled' : rateLimited ? 'rate_limited' : output.code === 0 && !output.timedOut && !output.failure && !errors.length && finalText ? 'completed' : 'failed';
      if (status !== 'completed') {
        settings[providerId] ||= {};
        settings[providerId].lastFailure = { at: new Date().toISOString(), status, message: redactProviderOutput(diagnostic || (output.timedOut ? 'Execution timed out.' : 'Native process returned no final response.')) };
        if (rateLimited) settings[providerId].cooldownUntil = new Date(Date.now() + 15 * 60000).toISOString();
      } else {
        settings[providerId] ||= {};
        settings[providerId].lastSuccessfulExecution = new Date().toISOString();
      }
      persist();
      return {
        status,
        summary: redactProviderOutput(finalText || diagnostic || 'No final response.'),
        structured: extractStructured(finalText, structured),
        exitCode: output.code,
        errors: [...errors.slice(0, 30), ...(output.timedOut ? ['Execution timed out.'] : []), ...(output.failure ? [redactProviderOutput(output.failure)] : [])],
        executionEvidence: evidence,
        sessionId,
        safeToRetry,
      };
    } catch (error) { return result('failed', redactProviderOutput(error.message), [redactProviderOutput(error.message)]); }
    finally {
      if (!job || processRun?.closed) {
        try { cleanup(); } catch { /* Cleanup is best effort for private temporary prompt data. */ }
        if (job && !job.closed) removeClosedJob(job);
        else if (job && !job.finishedEventSent) {
          job.finishedEventSent = true;
          emit({ type: 'provider.finished', runId, unitId, providerId });
        }
      } else {
        job.cleanup = cleanup;
        persist();
        emit({ type: 'provider.ownership_uncertain', runId, unitId, providerId, pid: job.child.pid || null, diagnostic: 'The caller settled while the owned process remained open. Capacity stays reserved until its close event.' });
      }
    }
  }

  async function cancel(runId) {
    const jobs = [...active.values()].filter(job => job.runId === runId);
    const errors = [];
    for (const job of jobs) {
      job.cancelled = true;
      const stopped = job.cancel ? await job.cancel() : await stopOwnedProcess(job.child, () => job.closed);
      if (stopped?.error) errors.push(redactProviderOutput(stopped.error.message));
    }
    persist();
    return { cancelled: jobs.length, retained: jobs.filter(job => !job.closed).length, errors };
  }

  function processKnownExited(pid) {
    if (!Number.isInteger(pid) || pid < 1) return false;
    try { process.kill(pid, 0); return false; }
    catch (error) { return error.code === 'ESRCH'; }
  }

  function reconcile(runId) {
    if (typeof runId !== 'string' || !runId.trim() || runId.length > 128) throw new Error('Run ID required for provider reconciliation.');
    let cleared = 0;
    const retained = [];
    for (const processRecord of staleProcesses) {
      if (processRecord.runId === runId && processKnownExited(processRecord.pid)) cleared++;
      else retained.push(processRecord);
    }
    staleProcesses.splice(0, staleProcesses.length, ...retained);
    const activeForRun = [...active.values()].filter(job => job.runId === runId).length;
    persist();
    const ownershipUnknown = activeForRun > 0 || retained.some(processRecord => processRecord.runId === runId);
    publish({ type: ownershipUnknown ? 'provider.reconciliation_blocked' : 'provider.reconciled', runId, cleared, retained: retained.filter(processRecord => processRecord.runId === runId).length + activeForRun });
    return {
      runId,
      status: ownershipUnknown ? 'OWNERSHIP_UNKNOWN' : 'RECONCILED',
      cleared,
      retained: retained.filter(processRecord => processRecord.runId === runId).length + activeForRun,
      diagnostic: ownershipUnknown ? 'A process with this PID still exists or its identity cannot be verified. No stale PID was terminated.' : null,
    };
  }

  function configure(id, patch) {
    if (!adapters.has(id)) throw new Error('Unknown provider.');
    if ([...active.values()].some(job => job.providerId === id)) throw new Error('Stop active provider jobs before changing its settings.');
    const next = { ...(settings[id] || {}) };
    if (patch.manualAvailability !== undefined) {
      if (!['AUTO', 'UNAVAILABLE'].includes(patch.manualAvailability)) throw new Error('Manual availability must be AUTO or UNAVAILABLE.');
      next.manualAvailability = patch.manualAvailability;
    }
    if (patch.concurrency !== undefined) {
      if (!Number.isInteger(patch.concurrency) || patch.concurrency < 1 || patch.concurrency > MAX_CONCURRENCY) throw new Error(`Concurrency must be between 1 and ${MAX_CONCURRENCY}.`);
      next.concurrency = patch.concurrency;
    }
    let executableChanged = false;
    if (patch.executablePath !== undefined) {
      if (patch.executablePath && !executable('', patch.executablePath)) throw new Error('Executable path must identify an existing absolute file.');
      next.executablePath = patch.executablePath || null;
      executableChanged = true;
    }
    settings[id] = next;
    const descriptor = descriptors.get(id);
    descriptor.concurrency = next.concurrency || 1;
    if (executableChanged) {
      descriptor.installed = false;
      descriptor.program = null;
      descriptor.executablePath = null;
      descriptor.auth = 'UNKNOWN';
      descriptor.discovered = false;
      descriptor.capabilities = { execute: false, readOnly: false, roles: [] };
      descriptor.diagnostic = 'Executable changed; rediscovery required.';
    }
    discoveryGeneration++;
    lastDiscoveryAt = 0;
    discovering = null;
    persist();
    return snapshot().find(item => item.id === id);
  }

  async function shutdown() {
    closed = true;
    await Promise.all([...new Set([...active.values()].map(job => job.runId))].map(cancel));
    if (active.size > 0 || staleProcesses.length > 0) {
      persist();
    }
  }

  if (staleProcesses.length) publish({ type: 'provider.recovery_required', processes: staleProcesses });
  return { discover, execute, cancel, reconcile, shutdown, configure, snapshot };
}
