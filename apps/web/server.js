/* Agentic OS - zero-dependency Node server.
   Live dashboard from the Obsidian Vault + agent gateway launcher.
   Run: npm run dev  →  http://localhost:4321
   Remote:   set DASH_TOKEN=secret  →  access requires the token. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const APP_VERSION = "2.4.6";
const APP_TITLE = "REMPEYEK AGENT OS";
const net = require("net");
const os = require("os");
const { spawn, execFile, spawnSync } = require("child_process");
const crypto = require("crypto");
const { buildAgentEnv } = require("./lib/child-env.cjs");
const { createAccessPolicy } = require("./lib/access-policy.cjs");
const { createConfigStore } = require("./lib/config-store.cjs");
const { stripBom, writeJsonAtomic, loadDurableJson } = require("./lib/durable-config.cjs");
const { ensureEmptyConfig, resolveRuntimePaths } = require("./lib/runtime-paths.cjs");
const { resolveSummonProfile } = require("./lib/summon-profile.cjs");
const {
  removeOwnedAgentLauncher,
  writeAgentLauncher,
} = require("./lib/agent-launcher.cjs");
const {
  PROMPT_VERSION,
  dispatchOperationalSyncPrompt,
  registeredPrimaryAgents,
  renderOperationalSyncPrompt,
} = require("./lib/operational-sync-prompt.cjs");
const {
  createHttpReadinessRegistry,
  routeModuleError,
} = require("./lib/http-readiness.cjs");

/* Monorepo layout: this file lives in apps/web/, but runtime data (vault, config,
   telemetry, scripts, .env) stays at the repo ROOT so agent CLIs and bridges keep working. */
const ROOT = path.resolve(__dirname, "..", "..");

/* load .env (KEY=VALUE per line; real env vars win over file contents) */
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const requestedPort = process.env.PORT === undefined
  ? 4321
  : Number(process.env.PORT);
if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 0 ||
  requestedPort > 65535
) {
  throw new Error("PORT must be an integer between 0 and 65535");
}
const PORT = requestedPort;
const RUNTIME_PATHS = resolveRuntimePaths({ env: process.env, root: ROOT, home: os.homedir() });
const VAULT = RUNTIME_PATHS.vaultPath;
const CONFIG_PATH = RUNTIME_PATHS.configPath;
const TOKEN = process.env.DASH_TOKEN || "";
const ACCESS_POLICY = createAccessPolicy(process.env);

/* Bootstrap: auto-initialize Vault, registries, and runtime state on first run */
const BOOTSTRAP_MOD = import("./lib/bootstrap.mjs");
let bootstrapInstance = null;
BOOTSTRAP_MOD.then(({ createBootstrap }) => {
  try {
    const configDir = path.join(RUNTIME_PATHS.runtimeRoot || path.dirname(VAULT), 'Config');
    bootstrapInstance = createBootstrap({
      configDir,
      vaultPath: VAULT,
      agentsDir: RUNTIME_PATHS.agentsDir || path.join(path.dirname(VAULT), 'Agents'),
      backupsDir: path.join(path.dirname(VAULT), 'Backups')
    });
    if (!bootstrapInstance.isBootstrapped()) {
      const result = bootstrapInstance.run();
      console.log(`  Bootstrap: ${result.success ? 'completed' : 'completed with errors'} (${result.warnings.length} warnings, ${result.errors.length} errors)`);
    }
  } catch (e) {
    console.error('[bootstrap]', e.message);
  }
}).catch(e => console.error('[bootstrap]', e.message));

const UNIFIED_MEMORY_MOD = import("./lib/unified-memory-graph.mjs");
let unifiedMemoryLib = null;
UNIFIED_MEMORY_MOD.then(m => { unifiedMemoryLib = m; }).catch(e => console.error("[unified-memory]", e.message));

const SYSTEM_DOCTOR_MOD = import("./lib/system-doctor.mjs");
let systemDoctorLib = null;
SYSTEM_DOCTOR_MOD.then(m => { systemDoctorLib = m; }).catch(e => console.error("[system-doctor]", e.message));
const BACKUP_ENGINE_MOD = import("./lib/backup-engine.mjs");
const MIGRATION_ENGINE_MOD = import("./lib/migration-engine.mjs");
const TODAY_PROJECTION = import("./lib/today-projection.mjs");
const APPROVAL_QUEUE = import("./lib/approval-queue.mjs").then(({ createApprovalQueue }) => createApprovalQueue());
const VAULT_GRAPH = import("./lib/vault-graph.mjs");
const AGENT_TOPOLOGY = import("./lib/agent-topology.mjs");
const AGENT_DETAIL = import("./lib/agent-detail.mjs");
/* Synchronous handle to the (async-imported) ESM helper module. Populated on the first tick;
   readTelemetry/telemetryActivity are sync and used by buildState, so the server gates its
   listen() on this resolving (below). The `|| []` guards keep a first-tick request honest. */
let agentDetailLib = null;
AGENT_DETAIL.then(m => { agentDetailLib = m; }).catch(e => console.error("[agent-detail]", e.message));
const AGENT_CATALOG_MOD = import("./lib/agent-catalog.mjs");
let catalogLib = null;
AGENT_CATALOG_MOD.then(m => { catalogLib = m; }).catch(e => console.error("[agent-catalog]", e.message));
const MARKETPLACE_MOD = import("./lib/marketplace-manifest.mjs");
let marketplaceLib = null;
MARKETPLACE_MOD.then(m => { marketplaceLib = m; }).catch(e => console.error("[marketplace]", e.message));
const PROCESS_ADAPTERS_MOD = import("./lib/process-adapters.mjs");
let processAdaptersLib = null;
PROCESS_ADAPTERS_MOD.then(m => { processAdaptersLib = m; }).catch(e => console.error("[process-adapters]", e.message));
const PROCESS_MANAGER_MOD = import("./lib/process-manager.mjs");
let processManagerLib = null;
PROCESS_MANAGER_MOD.then(m => { processManagerLib = m; }).catch(e => console.error("[process-manager]", e.message));
const AGENT_LIFECYCLE_MOD = import("./lib/agent-lifecycle.mjs");
let lifecycleLib = null;
AGENT_LIFECYCLE_MOD.then(m => { lifecycleLib = m; }).catch(e => console.error("[agent-lifecycle]", e.message));
const MANAGED_BUNDLE_MOD = import("./lib/managed-bundle.mjs");
let managedBundleLib = null;
MANAGED_BUNDLE_MOD.then(m => { managedBundleLib = m; }).catch(e => console.error("[managed-bundle]", e.message));
const SWITCHBOARD_MOD = import("./lib/switchboard.mjs");
let switchboardLib = null;
SWITCHBOARD_MOD.then(m => { switchboardLib = m; }).catch(e => console.error("[switchboard]", e.message));
const RUNTIME_SETTINGS_MOD = import("./lib/runtime-settings.mjs");
let runtimeSettingsLib = null;
RUNTIME_SETTINGS_MOD.then(m => { runtimeSettingsLib = m; }).catch(e => console.error("[runtime-settings]", e.message));
const SUBAGENT_RECORD_MOD = import("./lib/subagent-record.mjs");
let subagentLib = null;
SUBAGENT_RECORD_MOD.then(m => { subagentLib = m; }).catch(e => console.error("[subagent-record]", e.message));
const RELEASE_MOD = import("./lib/release-check.mjs");
let releaseLib = null;
RELEASE_MOD.then(m => { releaseLib = m; }).catch(e => console.error("[release-check]", e.message));
const SOURCE_UPDATE_MOD = import("./lib/source-update.mjs");
let sourceUpdateLib = null;
SOURCE_UPDATE_MOD.then(m => { sourceUpdateLib = m; }).catch(e => console.error("[source-update]", e.message));

const WORK_LIFECYCLE_MOD = import("./lib/work-lifecycle.mjs");
let workLifecycleLib = null;
WORK_LIFECYCLE_MOD.then(m => { workLifecycleLib = m; }).catch(e => console.error("[work-lifecycle]", e.message));

const PUBLISHING_DOMAIN_MOD = import("./lib/publishing-domain.mjs");
let publishingDomainLib = null;
PUBLISHING_DOMAIN_MOD.then(m => { publishingDomainLib = m; }).catch(e => console.error("[publishing-domain]", e.message));

const PUBLISHING_GATEWAY_MOD = import("./lib/publishing-gateway.mjs");
let publishingGatewayLib = null;
PUBLISHING_GATEWAY_MOD.then(m => { publishingGatewayLib = m; }).catch(e => console.error("[publishing-gateway]", e.message));

const PUBLISHING_SCHEDULER_MOD = import("./lib/publishing-scheduler.mjs");
let publishingSchedulerLib = null;
PUBLISHING_SCHEDULER_MOD.then(m => { publishingSchedulerLib = m; }).catch(e => console.error("[publishing-scheduler]", e.message));

function getWorkStore(services = DEFAULT_RUNTIME_SERVICES) {
  if (!workLifecycleLib) return null;
  if (!services._workStore) {
    services._workStore = workLifecycleLib.createWorkLifecycleStore({ vaultRoot: services.vaultPath, stateRoot: services.stateRoot });
  }
  return services._workStore;
}

function getPublishingStore(services = DEFAULT_RUNTIME_SERVICES) {
  if (!publishingDomainLib) return null;
  if (!services._publishingStore) {
    services._publishingStore = publishingDomainLib.createPublishingStore({ vaultRoot: services.vaultPath, stateRoot: services.stateRoot });
  }
  return services._publishingStore;
}

function getPublishingGateway(services = DEFAULT_RUNTIME_SERVICES) {
  if (!publishingGatewayLib) return null;
  if (!services._publishingGateway) {
    const store = getPublishingStore(services);
    services._publishingGateway = publishingGatewayLib.createPublishingGateway({ store });
  }
  return services._publishingGateway;
}

function getPublishingScheduler(services = DEFAULT_RUNTIME_SERVICES, approvalQueue = null) {
  if (!publishingSchedulerLib) return null;
  const store = getPublishingStore(services);
  const gateway = getPublishingGateway(services);
  return publishingSchedulerLib.createPublishingScheduler({ gateway, store, approvalQueue });
}

const httpReadiness = createHttpReadinessRegistry([
  { id: "agent-detail", promise: AGENT_DETAIL, required: true },
  { id: "agent-catalog", promise: AGENT_CATALOG_MOD, required: true },
  { id: "marketplace-manifest", promise: MARKETPLACE_MOD, required: true },
  { id: "process-adapters", promise: PROCESS_ADAPTERS_MOD, required: true },
  { id: "process-manager", promise: PROCESS_MANAGER_MOD, required: true },
  { id: "agent-lifecycle", promise: AGENT_LIFECYCLE_MOD, required: true },
  { id: "managed-bundle", promise: MANAGED_BUNDLE_MOD, required: true },
  { id: "runtime-settings", promise: RUNTIME_SETTINGS_MOD, required: true },
  { id: "subagent-record", promise: SUBAGENT_RECORD_MOD, required: true },
  { id: "release-check", promise: RELEASE_MOD, required: true },
  { id: "source-update", promise: SOURCE_UPDATE_MOD, required: true },
  { id: "switchboard", promise: SWITCHBOARD_MOD, required: true },
  { id: "work-lifecycle", promise: WORK_LIFECYCLE_MOD, required: true },
  { id: "publishing-domain", promise: PUBLISHING_DOMAIN_MOD, required: true },
  { id: "publishing-gateway", promise: PUBLISHING_GATEWAY_MOD, required: true },
  { id: "publishing-scheduler", promise: PUBLISHING_SCHEDULER_MOD, required: true },
  { id: "bootstrap", promise: BOOTSTRAP_MOD, required: false },
  { id: "unified-memory-graph", promise: UNIFIED_MEMORY_MOD, required: false },
  { id: "system-doctor", promise: SYSTEM_DOCTOR_MOD, required: false },
]);

function whenHttpModulesReady() {
  return httpReadiness.awaitReady();
}

function respondIfModuleBlocked(res, id, messages) {
  const blocked = routeModuleError(httpReadiness, id, messages);
  if (!blocked) return false;
  json(res, 503, blocked);
  return true;
}

function moduleLoadError(id, messages) {
  return routeModuleError(httpReadiness, id, messages);
}

/* PUBLIC = tracked static source. Runtime avatars live in the ignored state root so
   Vite cannot copy a user's uploads into dist during a production build.
   DIST = the built React app (`npm run build`). Requests resolve DIST first, then
   PUBLIC, then fall back to index.html - /avatars always comes from PUBLIC, because
   Vite's emptyOutDir would otherwise delete uploads on the next build. */
const PUBLIC = path.join(__dirname, "public");
const DIST = path.join(__dirname, "dist");
const IGNORE = new Set([".git", ".obsidian", "Assets", "node_modules"]);
const DAY = 86400000;
const LOG_MAX = 800;
const AVATAR_DIR = RUNTIME_PATHS.avatarDir;
const TELEMETRY_DIR = RUNTIME_PATHS.telemetryDir;
const LOG_DIR = path.join(TELEMETRY_DIR, "logs");   // R#4: per-agent run log, survives restarts
const TERMS_DIR = path.join(TELEMETRY_DIR, "terms"); // summoned-terminal pid/kill handshake files
const LOG_FILE_MAX = 1_000_000;                     // 1 MB/agent → naive rotation (keep the tail half)
const CLAUDE_PROJECTS = process.env.CLAUDE_PROJECTS || path.join(os.homedir(), ".claude", "projects");
for (const d of [AVATAR_DIR, TELEMETRY_DIR, LOG_DIR, TERMS_DIR]) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }
ensureEmptyConfig(CONFIG_PATH, { home: os.homedir() });

/* loadConfig: memoize by mtime (B6) + tolerate config broken mid-edit → return last-good (R10).
   R#11: keep the last error so the dashboard can show a banner (not silently serve last-good). */
let _cfgCache = { mtime: 0, data: null };
let configError = null;   // { msg, at } when parsing fails but a last-good copy exists
function emptyConfigFallback() {
  return { agency: "REMPEYEK AGENT OS", workdir: os.homedir(), agents: [] };
}
function loadConfig() {
  try {
    const st = fs.statSync(CONFIG_PATH);
    if (_cfgCache.data && st.mtimeMs === _cfgCache.mtime) return _cfgCache.data;
  } catch {}

  const validator = cfg => {
    if (!cfg || !Array.isArray(cfg.agents)) throw new Error("agents.config.json must contain an agents array");
  };

  const result = loadDurableJson(CONFIG_PATH, {
    validator,
    fallback: emptyConfigFallback,
  });
  let st;
  try { st = fs.statSync(CONFIG_PATH); } catch { st = { mtimeMs: Date.now() }; }
  _cfgCache = { mtime: st.mtimeMs, data: result.data };
  return result.data;
}

/* saveConfig: atomic write path for agents.config.json with backup and cache invalidation. */
function saveConfig(cfg) {
  writeJsonAtomic(CONFIG_PATH, cfg, { backup: true });
  _cfgCache = { mtime: 0, data: null };
}

function createRuntimeServices(runtime = {}) {
  const configPath = runtime.configPath || CONFIG_PATH;
  const stateRoot = runtime.stateRoot || RUNTIME_PATHS.stateRoot;
  const vaultPath = runtime.vaultPath || VAULT;
  const telemetryDir = runtime.telemetryDir || path.join(stateRoot, "telemetry");
  const tombstoneDir = runtime.tombstoneDir || path.join(stateRoot, "tombstones");
  const receiptDir = runtime.receiptDir || path.join(stateRoot, "receipts");
  const bundleRoot = runtime.bundleRoot || RUNTIME_PATHS.bundleRoot;
  const userHome = runtime.userHome || os.homedir();
  const logDir = path.join(telemetryDir, "logs");
  const completedMutations = new Map();
  const ownedMutations = new Map();

  const readConfig = () => {
    const validator = config => {
      if (!config || !Array.isArray(config.agents)) {
        throw new Error("agents.config.json must contain an agents array");
      }
    };
    const res = loadDurableJson(configPath, {
      validator,
    });
    return res.data;
  };
  const store = createConfigStore({
    configPath,
    tombstoneDir,
    onCommit: () => {
      if (path.resolve(configPath) === path.resolve(CONFIG_PATH)) {
        _cfgCache = { mtime: 0, data: null };
      }
    },
  });
  return {
    bundleRoot,
    completedMutations,
    configPath,
    loadConfig: readConfig,
    logDir,
    ownedMutations,
    probeCatalogInstalled: runtime.probeCatalogInstalled || null,
    receiptDir,
    startResolvedProcess: runtime.startResolvedProcess || null,
    stateRoot,
    store,
    telemetryDir,
    tombstoneDir,
    userHome,
    vaultPath,
  };
}

const DEFAULT_RUNTIME_SERVICES = createRuntimeServices();

function mutationReplay(services, operationId) {
  const result = services.completedMutations.get(operationId);
  return result ? { ...JSON.parse(JSON.stringify(result)), replayed: true } : null;
}

function rememberMutation(services, operationId, result) {
  const stored = { ...JSON.parse(JSON.stringify(result)), replayed: false };
  services.completedMutations.set(operationId, stored);
  return stored;
}

function validOperationId(operationId) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(String(operationId || ""));
}

function receiptPath(services, id) {
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(id || ""))) {
    throw new Error("invalid Marketplace id");
  }
  return path.join(services.receiptDir, `${id}.json`);
}

function receiptInstalled(services, id) {
  try {
    const receipt = JSON.parse(fs.readFileSync(receiptPath(services, id), "utf8"));
    return receipt.schemaVersion === 1 && Array.isArray(receipt.files);
  } catch {
    return false;
  }
}

function verifyManagedBundle(sourceRoot, entry) {
  const manifestPath = path.join(sourceRoot, "bundle.manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.sourceRef !== entry.sourceRef || !Array.isArray(manifest.files)) {
    throw new Error("managed bundle manifest does not match the reviewed source");
  }
  for (const file of manifest.files) {
    const absolute = path.resolve(sourceRoot, String(file.path || ""));
    const relative = path.relative(path.resolve(sourceRoot), absolute);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("managed bundle manifest escapes its source root");
    }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
    if (actual !== file.sha256) throw new Error(`managed bundle hash mismatch: ${file.path}`);
  }
  return manifest;
}

function reviewedAgentProfile(
  config,
  entry,
  userHome = os.homedir(),
  stateRoot = RUNTIME_PATHS.stateRoot,
) {
  const catalog = catalogLib?.catalogEntry(entry.id);
  if (!catalog) throw new Error(`unknown catalog agent '${entry.id}'`);
  const nodeNums = config.agents
    .map(agent => Number((String(agent.node || "").match(/(\d+)$/) || [])[1]))
    .filter(number => !Number.isNaN(number));
  const built = catalogLib.buildAgentRecord({
    body: { catalogId: entry.id },
    cat: catalog,
    existingIds: config.agents.map(agent => agent.id),
    existingNodeNums: nodeNums,
    date: localISO().slice(0, 10),
    homedir: userHome,
    workdir: stateRoot,
  });
  if (built.error) throw new Error(built.error);
  return built.agent;
}

function scaffoldRuntimeVaultLane(agent, vaultPath) {
  if (!agentDetailLib || !agent?.lane) return;
  const entries = agentDetailLib.laneScaffold(agent.lane, {
    node: agent.node,
    icon: agent.icon,
    date: localISO().slice(0, 10),
  });
  for (const entry of entries) {
    const absolute = path.join(vaultPath, "Brains", agent.lane, ...entry.rel.split("/"));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    if (!fs.existsSync(absolute)) fs.writeFileSync(absolute, entry.content, "utf8");
  }
}

/* /api/agents/add - register a new agent from the dashboard.
   Two shapes:
     { catalogId }                     → pull id/name/icon/role/trigger/home/install from the curated
                                          catalog (this is the "+ Add Agent" install path).
     { id, name, icon?, role?, accent?, trigger?, home? }  → a custom agent. trigger+home are now
                                          PERSISTED as a gateway (the bug that shipped: they were
                                          silently dropped). No install.cmd is ever taken from the
                                          body - auto-install runs only vetted catalog commands. */
function addAgent(body, services = DEFAULT_RUNTIME_SERVICES) {
  const catalogBlocked = moduleLoadError("agent-catalog", {
    loading: "catalog module still loading - retry in a moment",
    failed: "catalog module unavailable",
  });
  if (catalogBlocked) return catalogBlocked;
  const cat = body.catalogId ? catalogLib.catalogEntry(body.catalogId) : null;
  if (body.catalogId) {
    const marketplaceBlocked = moduleLoadError("marketplace-manifest", {
      loading: "marketplace module still loading - retry in a moment",
      failed: "marketplace module unavailable",
    });
    if (marketplaceBlocked) return marketplaceBlocked;
    const marketplaceEntry = marketplaceLib.marketplaceEntry(body.catalogId);
    if (marketplaceEntry && !catalogInstalled(marketplaceEntry, services, { fresh: true })) {
      return {
        error: `${marketplaceEntry.name} is not detected on this computer; install it before registration`,
      };
    }
  }
  const cfg = services.loadConfig();
  const nodeNums = cfg.agents.map(a => Number((String(a.node || "").match(/(\d+)$/) || [])[1])).filter(n => !Number.isNaN(n));
  const r = catalogLib.buildAgentRecord({
    body, cat,
    existingIds: cfg.agents.map(a => a.id),
    existingNodeNums: nodeNums,
    date: localISO().slice(0, 10),
    homedir: services.userHome,
    workdir: services.stateRoot,
  });
  if (r.error) return r;
  if (Array.isArray(cfg.removedAgentIds)) {
    cfg.removedAgentIds = cfg.removedAgentIds.filter(id => id !== r.agent.id);
  }
  cfg.agents.push(r.agent);
  try {
    services.store.commit(cfg, `agent-add-${crypto.randomUUID()}`);
  } catch (e) {
    return { error: `failed to write config: ${e.message}` };
  }
  scaffoldRuntimeVaultLane(r.agent, services.vaultPath);
  writeAgentLauncher({
    stateRoot: services.stateRoot,
    trigger: r.agent.gateway?.trigger,
    workingDirectory: r.agent.gateway?.workdir,
  });
  sysEvent(r.agent.id, "ok", `agent registered via dashboard (${r.agent.node})`);
  return { ok: true, agent: r.agent };
}

/* scaffoldVaultLane: create Brains/<Lane>/ in the canonical constitution shape (Identity/Memory/
   Rules + Knowledge/ + Notes/) for a newly-registered agent - writing only files that don't exist,
   so it never clobbers a real brain. No-op until the ESM helper (templates) has loaded. */
function scaffoldVaultLane(agent) {
  if (!agentDetailLib || !agent.lane) return;
  try {
    const entries = agentDetailLib.laneScaffold(agent.lane, { node: agent.node, icon: agent.icon, date: localISO().slice(0, 10) });
    for (const e of entries) {
      const abs = path.join(VAULT, "Brains", agent.lane, ...e.rel.split("/"));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (!fs.existsSync(abs)) fs.writeFileSync(abs, e.content, "utf8");
    }
  } catch (err) { console.error("[scaffoldVaultLane]", err.message); }
}

/* ---------------- vault scan (view: Command Center) ---------------- */
function walk(dir, out = [], base = dir, depth = 0, opts = {}) {
  if (depth > 100) return out;               // R14: prevent runaway recursion (deep nesting)
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if ((opts.all ? e.name === "node_modules" || e.name === ".git" || e.name === ".obsidian" : IGNORE.has(e.name)) || e.name.startsWith(".")) continue;
    if (e.isSymbolicLink()) continue;        // R14: skip symlinks/junctions → prevent loops
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, base, depth + 1, opts);
    else if (opts.all || e.name.endsWith(".md")) {
      let st; try { st = fs.statSync(full); } catch { continue; }
      out.push({ rel: path.relative(base, full).replace(/\\/g, "/"), mtime: st.mtimeMs });
    }
  }
  return out;
}

/* short-TTL vault snapshot: dedupes re-walks when many endpoints/tabs ask within one tick (B1/B3) */
let _walkCache = { t: 0, data: null };
function walkVault() {
  if (_walkCache.data && Date.now() - _walkCache.t < 3000) return _walkCache.data;
  _walkCache = { t: Date.now(), data: walk(VAULT) };
  return _walkCache.data;
}

/* Full-fidelity walks for the Neural Vault graph ONLY. walkVaultAll() lifts the .md gate and the
   Assets/ exclusion so every vault file (decree .txt, images, PDFs) becomes a node; every other
   consumer keeps the lean .md walk above. walkRepo() adds the repo's own source as a `code` layer
   under the virtual Repo/ folder - allowlisted dirs/files only, so .env, telemetry data, dist
   output, and the vault itself can never leak into the graph. */
function walkVaultAll() { return walk(VAULT, [], VAULT, 0, { all: true }); }
const REPO_DIRS = ["apps", "packages", "scripts", "docs", "prompts", ".github"];
const REPO_ROOT_FILES = ["README.md", "CHANGELOG.md", "CLAUDE.md", "CONTEXT.md", "LICENSE", "package.json", "agents.config.example.json", ".env.example"];
const REPO_EXT = new Set([".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".md", ".yml", ".yaml", ".html", ".cmd"]);
function walkRepo() {
  const out = [];
  for (const dir of REPO_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of walk(abs, [], ROOT, 0, { all: true })) {
      if (f.rel.includes("dist/") || !REPO_EXT.has(path.extname(f.rel).toLowerCase())) continue;
      out.push({ rel: `Repo/${f.rel}`, mtime: f.mtime, kind: "repo" });
    }
  }
  for (const name of REPO_ROOT_FILES) {
    try { const st = fs.statSync(path.join(ROOT, name)); out.push({ rel: `Repo/${name}`, mtime: st.mtimeMs, kind: "repo" }); } catch {}
  }
  return out;
}

function agentVaultStatus(files, agent) {
  let last = 0, lastFile = null;
  for (const f of files) {
    const hit = (agent.lane && f.rel.startsWith(`Brains/${agent.lane}/`)) ||
      (f.rel.startsWith("Daily/") && f.rel.toLowerCase().includes(agent.id.replace("-", "")));
    if (hit && f.mtime > last) { last = f.mtime; lastFile = f.rel; }
  }
  const days = last ? Math.floor((Date.now() - last) / DAY) : null;
  return {
    vaultStatus: days === null ? "idle" : days === 0 ? "working" : days <= 2 ? "waiting" : "idle",
    lastFile, lastSeen: last ? new Date(last).toISOString().slice(0, 10) : null,
  };
}

function openTasks() {
  const items = [];
  let names = [];
  try { names = fs.readdirSync(path.join(VAULT, "Tasks")).filter(n => n.endsWith(".md")); } catch {}
  for (const n of names) {
    let text; try { text = fs.readFileSync(path.join(VAULT, "Tasks", n), "utf8"); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*[-*] \[ \]\s+(.*)/);
      if (m) items.push({ text: m[1].slice(0, 120), source: `Tasks/${n}` });
    }
  }
  return items;
}

/* ---------------- project workspaces (view: Workspace) ----------------
   Projects/<slug>/ folders are WORKSPACES: project.md (goal/progress/status),
   decisions.md (append-only cross-agent log), next.md (resume pointer).
   Flat Projects/<name>.md notes still render (kind "note"), read-only.
   The dashboard writes ONLY inside Projects/<slug>/ it created or that already exists. */
const _docCache = new Map();   // abs path -> {mtime, text} - mtime-keyed, bounded
function readDoc(abs) {
  try {
    const st = fs.statSync(abs);
    const hit = _docCache.get(abs);
    if (hit && hit.mtime === st.mtimeMs) return hit.text;
    const text = fs.readFileSync(abs, "utf8");
    if (_docCache.size > 500) _docCache.clear();
    _docCache.set(abs, { mtime: st.mtimeMs, text });
    return text;
  } catch { return null; }
}

function parseFM(text) {
  const fm = {}; let body = text || "";
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body);
  if (m) {
    body = body.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (kv) fm[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { fm, body };
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/* slug is path-safe by construction (no dots/slashes pass the regex) */
function projectBySlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(slug))) return null;
  const dir = path.join(VAULT, "Projects", slug);
  try { if (fs.statSync(dir).isDirectory()) return { slug, kind: "workspace", dir, rel: `Projects/${slug}/project.md` }; } catch {}
  const flat = path.join(VAULT, "Projects", `${slug}.md`);
  try { if (fs.statSync(flat).isFile()) return { slug, kind: "note", rel: `Projects/${slug}.md` }; } catch {}
  return null;
}

/* goal/progress/status from the main note: frontmatter wins, checkboxes fill the gap */
function projectMeta(rel, mtime) {
  const text = readDoc(path.join(VAULT, rel)) || "";
  const { fm, body } = parseFM(text);
  const boxes = body.match(/^\s*[-*] \[[ xX]\]/gm) || [];
  const done = body.match(/^\s*[-*] \[[xX]\]/gm) || [];
  let progress = Number(fm.progress);
  if (Number.isFinite(progress)) progress = Math.max(0, Math.min(100, Math.round(progress)));
  else progress = boxes.length ? Math.round((done.length / boxes.length) * 100) : null;
  const goal = String(fm.goal || (body.split(/\r?\n/).find(l => l.trim() && !/^[#>\-*!\[|`]/.test(l.trim())) || "")).slice(0, 240);
  const agents = fm.agents ? fm.agents.replace(/[[\]]/g, "").split(",").map(s => s.trim()).filter(Boolean) : [];
  const days = mtime ? Math.floor((Date.now() - mtime) / DAY) : 999;
  const status = String(fm.status || (days <= 7 ? "active" : "parked")).toLowerCase().slice(0, 16);
  return { title: fm.title || null, goal, progress, agents, status, tasksOpen: boxes.length - done.length };
}

function decisionList(slug, limit = 14) {
  const text = readDoc(path.join(VAULT, "Projects", slug, "decisions.md"));
  if (!text) return [];
  return text.split(/\r?\n/)
    .filter(l => /^\s*[-*]\s+\S/.test(l))
    .map(l => l.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, "").slice(0, 240))
    .slice(-limit).reverse();   // newest last on disk → newest first for the UI
}

function nextPointer(slug) {
  const text = readDoc(path.join(VAULT, "Projects", slug, "next.md"));
  if (!text) return null;
  const line = parseFM(text).body.split(/\r?\n/).find(l => l.trim() && !/^[#>]/.test(l.trim()));
  return line ? line.trim().slice(0, 300) : null;
}

function buildProjects(files) {
  const out = [];
  const bySlug = new Map();   // workspace slug -> newest mtime anywhere in the folder
  for (const f of files) {
    if (!f.rel.startsWith("Projects/")) continue;
    const parts = f.rel.split("/");
    if (parts.length >= 3) {
      const slug = parts[1];
      if (!bySlug.has(slug) || f.mtime > bySlug.get(slug)) bySlug.set(slug, f.mtime);
    }
  }
  for (const [slug, mtime] of bySlug) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) continue;   // unsafe folder name → not routable, skip
    const rel = `Projects/${slug}/project.md`;
    if (!files.some(f => f.rel === rel)) continue;   // folder without project.md → not a workspace
    const meta = projectMeta(rel, mtime);
    const dec = decisionList(slug, 1);
    out.push({
      slug, kind: "workspace", rel, name: meta.title || slug,
      updated: new Date(mtime).toISOString().slice(0, 10), updatedAt: mtime,
      goal: meta.goal, progress: meta.progress, status: meta.status,
      agents: meta.agents, tasksOpen: meta.tasksOpen,
      lastDecision: dec.length ? dec[0] : null,
    });
  }
  for (const f of files) {
    if (!(f.rel.startsWith("Projects/") && f.rel.split("/").length === 2 && f.rel.endsWith(".md"))) continue;
    const name = f.rel.replace("Projects/", "").replace(".md", "");
    const meta = projectMeta(f.rel, f.mtime);
    out.push({
      slug: slugify(name) || name, kind: "note", rel: f.rel, name: meta.title || name,
      updated: new Date(f.mtime).toISOString().slice(0, 10), updatedAt: f.mtime,
      goal: meta.goal, progress: meta.progress, status: meta.status,
      agents: meta.agents, tasksOpen: meta.tasksOpen, lastDecision: null,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/* the Continue brief: what an agent needs to resume this project with full context */
function projectBrief(p, meta, decisions, next) {
  return [
    `## Resume brief - ${meta.title || p.slug}`,
    meta.goal ? `**Goal:** ${meta.goal}` : null,
    `**Status:** ${meta.status}${meta.progress != null ? ` · ${meta.progress}%` : ""}${meta.tasksOpen ? ` · ${meta.tasksOpen} open tasks` : ""}`,
    next ? `**Next:** ${next}` : null,
    decisions.length ? `**Recent decisions:**\n${decisions.slice(0, 5).map(d => `- ${d}`).join("\n")}` : null,
    `**Workspace:** Projects/${p.slug}/ (project.md · decisions.md · next.md)`,
  ].filter(Boolean).join("\n");
}

function projectDetail(slug) {
  const p = projectBySlug(slug);
  if (!p) return { error: `unknown project '${slug}'` };
  const files = walkVault();
  let mtime = 0;
  for (const f of files) if (f.rel.startsWith(p.kind === "workspace" ? `Projects/${slug}/` : p.rel) && f.mtime > mtime) mtime = f.mtime;
  const meta = projectMeta(p.rel, mtime);
  const decisions = p.kind === "workspace" ? decisionList(slug) : [];
  const next = p.kind === "workspace" ? nextPointer(slug) : null;
  const docs = p.kind === "workspace"
    ? files.filter(f => f.rel.startsWith(`Projects/${slug}/`)).sort((a, b) => b.mtime - a.mtime).slice(0, 8)
        .map(f => ({ rel: f.rel, updated: new Date(f.mtime).toISOString().slice(0, 16).replace("T", " ") }))
    : [];
  return {
    slug, kind: p.kind, rel: p.rel, name: meta.title || slug,
    goal: meta.goal, progress: meta.progress, status: meta.status,
    agents: meta.agents, tasksOpen: meta.tasksOpen,
    updated: mtime ? new Date(mtime).toISOString().slice(0, 10) : null,
    decisions, next, docs,
    brief: projectBrief(p, meta, decisions, next),
  };
}

function createProject(body) {
  const name = String(body.name || "").replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 60);
  if (!name) return { error: "name is required" };
  const slug = slugify(name);
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return { error: "name must contain letters or numbers" };
  const dir = path.join(VAULT, "Projects", slug);
  if (fs.existsSync(dir) || fs.existsSync(path.join(VAULT, "Projects", `${slug}.md`)))
    return { error: `project '${slug}' already exists` };
  const goal = String(body.goal || "").trim().replace(/\r?\n/g, " ").slice(0, 300);
  const date = localISO().slice(0, 10);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "project.md"),
      `---\ntitle: ${JSON.stringify(name)}\nstatus: active\nprogress: 0\ncreated: ${date}\ngoal: ${JSON.stringify(goal || "(define the goal)")}\n---\n\n# ${name}\n\n${goal ? goal + "\n\n" : ""}## Milestones\n\n- [ ] Define the first milestone\n`, "utf8");
    fs.writeFileSync(path.join(dir, "decisions.md"),
      `# Decisions: ${name}\n\n> Append-only log. ⚡auto entries are captured from agent telemetry.\n\n- **${localISO().slice(0, 16).replace("T", " ")}** · Dashboard: workspace created\n`, "utf8");
    fs.writeFileSync(path.join(dir, "next.md"),
      `# Next: ${name}\n\nDefine the next concrete step here. The Continue brief leads with it.\n`, "utf8");
    sysEvent("dashboard", "ok", `project workspace created: ${slug}`);
    return { ok: true, slug };
  } catch (e) { return { error: `failed to create workspace: ${e.message}` }; }
}

function addDecision(slug, body) {
  const p = projectBySlug(slug);
  if (!p) return { error: `unknown project '${slug}'` };
  if (p.kind !== "workspace") return { error: "flat note projects have no decision log: create a workspace" };
  const text = String(body.text || "").trim().replace(/[\r\n]+/g, " ").slice(0, 400);
  if (!text) return { error: "decision text is empty" };
  const who = String(body.agent || "Boss").replace(/[\r\n|]+/g, " ").trim().slice(0, 40) || "Boss";
  const line = `- **${localISO().slice(0, 16).replace("T", " ")}** · ${who} - ${text}\n`;
  try {
    const f = path.join(p.dir, "decisions.md");
    if (!fs.existsSync(f))
      fs.writeFileSync(f, `# Decisions: ${slug}\n\n> Append-only log. ⚡auto entries are captured from agent telemetry.\n\n${line}`, "utf8");
    else fs.appendFileSync(f, line, "utf8");
    return { ok: true, line: line.trim() };
  } catch (e) { return { error: `failed to write decision: ${e.message}` }; }
}

/* -------- project memory capture: telemetry task_done → decisions.md --------
   Watermarked per agent (telemetry/memory-capture.json) so nothing is written twice.
   An event lands in a workspace when it carries an explicit `project` field, or when
   its name/detail mentions the workspace slug. Honest capture only: no inference. */
const MEM_WM = path.join(TELEMETRY_DIR, "memory-capture.json");
function captureMemory() {
  let cfg; try { cfg = loadConfig(); } catch { return; }
  let slugs = [];
  try {
    slugs = fs.readdirSync(path.join(VAULT, "Projects"), { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
  } catch {}
  if (!slugs.length) return;
  let wm = {}; try { wm = JSON.parse(fs.readFileSync(MEM_WM, "utf8")); } catch {}
  let dirty = false;
  for (const a of cfg.agents) {
    const last = wm[a.id] || 0;
    let maxTs = last;
    const hits = [];
    for (const e of readTelemetry(a.id)) {   // newest-first, ≤30 events
      const ts = e.ts ? Date.parse(e.ts) : 0;
      if (!ts || ts <= last) continue;
      if (ts > maxTs) maxTs = ts;
      if (e.type !== "task_done") continue;
      const hay = `${e.project || ""} ${e.name || ""} ${e.detail || ""}`.toLowerCase();
      const slug = (e.project && slugs.includes(String(e.project))) ? String(e.project)
        : slugs.find(s => hay.includes(s.toLowerCase()));
      if (slug) hits.push({ slug, e, ts });
    }
    for (const { slug, e, ts } of hits.reverse()) {   // oldest first → chronological log
      const line = `- **${new Date(ts).toISOString().slice(0, 16).replace("T", " ")}** · ${a.name} - ${String(e.name || "task").slice(0, 120)}${e.detail ? `: ${String(e.detail).replace(/[\r\n]+/g, " ").slice(0, 200)}` : ""} ⚡auto\n`;
      try {
        const f = path.join(VAULT, "Projects", slug, "decisions.md");
        if (!fs.existsSync(f))
          fs.writeFileSync(f, `# Decisions: ${slug}\n\n> Append-only log. ⚡auto entries are captured from agent telemetry.\n\n${line}`, "utf8");
        else fs.appendFileSync(f, line, "utf8");
        sysEvent(a.id, "ok", `memory captured → Projects/${slug}`);
      } catch (err) { console.error("[memory]", err.message); }
    }
    if (maxTs > last) { wm[a.id] = maxTs; dirty = true; }
  }
  if (dirty) { try { fs.writeFileSync(MEM_WM, JSON.stringify(wm), "utf8"); } catch {} }
}

const DEFAULT_WORKFLOWS = Object.freeze([
  { id: "openclaw", who: "OpenClaw", t: "Strategy & Business", d: "Business analysis, SWOT, founder-grade memos, persona-driven writing, multi-agent orchestration." },
  { id: "hermes", who: "Hermes", t: "Crypto & Market Ops", d: "Trading bot, market analysis, cron & heartbeat 24/7. Real-money moves only with Boss approval." },
  { id: "kilo-code", who: "Kilo Code", t: "Build & Debug", d: "Terminal AI coding agent (kilo.ai) - code generation, task automation, 500+ models behind one CLI." },
  { id: "claude-code", who: "Claude Code", t: "Dev & Vault Ops", d: "Full dev, file ops, MCP, ecosystem integration, guardian of the vault constitution." },
  { id: "cline", who: "Cline", t: "Autonomous Coding", d: "Autonomous coding agent (cline.bot) - interactive sessions, one-shot tasks, and kanban-driven runs." },
  { id: "codex", who: "Codex", t: "Software Engineering", d: "Repository-aware coding agent for implementation, review, testing, and tool-driven development workflows." },
  { id: "antigravity", who: "Antigravity", t: "Agentic Integration", d: "Gemini-based advanced agentic coding, dashboard building, and knowledge-graph visualization." },
  { id: "pi", who: "Pi", t: "Minimal Agent Ops", d: "Lean open-source coding agent (pi.dev) - read/write/edit/bash tools, subscription or API login, fast one-off runs." },
]);

function buildState() {
  const cfg = loadConfig();
  const files = walkVault();
  const now = Date.now();
  const tasks = openTasks();
  const um = uptimeMap();                       // R#2: 24-hour uptime per agent (single file read)
  const inbox = files.filter(f => f.rel.startsWith("Inbox/"));
  const projects = buildProjects(files);
  return {
    vault: VAULT,
    agency: cfg.agency || "AGENTIC//OS",
    generatedAt: new Date().toISOString(),
    configError,                              // R#11: null when healthy, {msg,at} when config is broken
    auth: TOKEN ? "token-locked" : "local-only",
    events: sysLog.slice(-30).reverse(),      // topology SYSTEM LOG (newest first)
    workflows: cfg.workflows || DEFAULT_WORKFLOWS,

    stats: {
      notes: { value: files.length, label: "Total vault notes" },
      activeWeek: { value: files.filter(f => now - f.mtime < 7 * DAY).length, label: "Notes changed in the last 7 days" },
      openTasks: { value: tasks.length, label: "Open checkboxes in Tasks/" },
      projects: { value: projects.length, label: "Projects in the workspace" },
    },
    agents: cfg.agents
      .filter(a => a.kind !== "subagent")
      .map(a => ({ ...a, gateway: undefined, actions: gwActions(a), canSummon: !!(a.gateway && a.gateway.home && a.gateway.trigger), installed: installedState(a.id), hasInstaller: !!(a.gateway && a.gateway.install && a.gateway.install.cmd), ...agentVaultStatus(files, a), proc: procInfo(a.id), term: termInfo(a.id), avatar: avatarUrl(a.id), uptime: um[a.id] || null })),
    review: [
      ...inbox.map(f => ({ title: f.rel.split("/").pop().replace(".md", ""), meta: f.rel, kind: "inbox" })),
      ...tasks.slice(0, 6).map(t => ({ title: t.text, meta: t.source, kind: "task" })),
    ],
    projects,
    knowledge: [...files].sort((a, b) => b.mtime - a.mtime).slice(0, 12)
      .map(f => ({ rel: f.rel, updated: new Date(f.mtime).toISOString().slice(0, 10) })),
  };
}

/* ---------------- gateway controller ----------------
   The dashboard calls each agent's REAL gateway commands (start/stop/restart/status/run).
   - start/stop/restart/status : short commands (run → capture output → done),
     managed by the OS service manager (schtasks/systemd) → stays alive even if the dashboard closes.
   - run : foreground, owned by the dashboard (live log), stops with the dashboard/stop button.
   procs = `run` processes owned by the dashboard. gwCache = last status result per agent. */
const procs = new Map();   // id -> {child,pid,log:[],seq,status,startedAt,exitCode}
const gwCache = new Map();  // id -> {running,text,at,exitCode}
const summons = new Map();  // id -> {pid,startedAt,alive,launchedAt} - summoned admin terminals (pid-file handshake)

/* system-event ring buffer (topology SYSTEM LOG panel) */
const sysLog = [];
function sysEvent(id, level, msg) {
  sysLog.push({ ts: new Date().toISOString(), id, level, msg: String(msg).slice(0, 160) });
  if (sysLog.length > 50) sysLog.splice(0, sysLog.length - 50);
}

function agentById(id) { return loadConfig().agents.find(a => a.id === id); }
function gwActions(agent) {
  if (processAdaptersLib?.deriveGatewayActions) {
    try { return processAdaptersLib.deriveGatewayActions(agent); } catch {}
  }
  return (agent && agent.gateway && agent.gateway.actions) || [];
}

function detectRunning(text) {
  const t = (text || "").toLowerCase();
  // Note: matches Indonesian output emitted by some agent CLIs - do not translate
  if (/not running|tidak (sedang )?jalan|belum jalan|\bstopped\b|\binactive\b|no gateway|not installed|no running/.test(t)) return false;
  if (/\brunning\b|\bactive\b|\bpid[:\s#]*\d|listening on|is up\b/.test(t)) return true;
  return false;
}

function procInfo(id) {
  const p = procs.get(id);
  const c = gwCache.get(id);
  const managed = processManager()?.status(id);
  if (managed) {
    return {
      status: managed.runtimeState,
      mode: "owned",
      pid: managed.pid,
      childPids: managed.childPids,
      command: managed.command,
      args: managed.args,
      cwd: managed.workingDirectory,
      actionType: managed.actionType,
      startedAt: managed.startTime,
      exitCode: managed.exitCode,
      stdoutPath: managed.stdoutPath,
      stderrPath: managed.stderrPath,
      logSize: p ? p.seq : 0,
      reason: managed.reason || null,
      statusText: c && c.text || null,
      checkedAt: c && new Date(c.at).toISOString() || null,
    };
  }
  // a dashboard-owned run process wins while it's still alive
  if (p && p.status === "running")
    return { status: "running", mode: "owned", pid: p.pid, startedAt: p.startedAt, exitCode: null, logSize: p.seq, reason: null, statusText: c && c.text || null, checkedAt: c && new Date(c.at).toISOString() || null };
  // a live summoned terminal counts as "running" for agents with no service status of their own
  const st = summons.get(id);
  if (st && st.alive) {
    const ag = agentById(id);
    if (ag && !gwActions(ag).includes("status") && !(ag.gateway && ag.gateway.probe))
      return { status: "running", mode: "terminal", pid: st.pid, startedAt: st.startedAt, exitCode: null, logSize: p ? p.seq : 0, reason: null, statusText: `Summoned terminal · pid ${st.pid}` };
  }
  let reason = null;
  if (p && (p.status === "exited" || p.status === "error")) {
    const out = p.log.filter(l => l.s === "out" || l.s === "err");
    reason = (out.length ? out[out.length - 1].line : (p.log.length ? p.log[p.log.length - 1].line : "")).slice(0, 140);
  }
  if (c) {
    const firstLine = c.text ? c.text.split(/\r?\n/).find(l => l.trim()) || "" : "";
    return { status: c.running ? "running" : "stopped", mode: "service", exitCode: c.exitCode, logSize: p ? p.seq : 0,
      reason: reason || (!c.running ? firstLine.slice(0, 140) : null), statusText: c.text, checkedAt: new Date(c.at).toISOString() };
  }
  const tele = readTelemetry(id);
  if (tele && tele.length > 0) {
    const latest = tele[0];
    const ts = latest.ts ? Date.parse(latest.ts) : 0;
    if (Date.now() - ts < 15 * 60 * 1000) {
      return { status: "running", mode: "cli", startedAt: latest.ts, exitCode: null, logSize: p ? p.seq : 0, reason: null, statusText: `Active CLI: ${latest.name || latest.type} · ${latest.detail || ""}` };
    }
  }
  if (p) return { status: p.status, mode: "owned", pid: p.pid, startedAt: p.startedAt, exitCode: p.exitCode, logSize: p.seq, reason, statusText: null };
  return { status: "off" };
}

function pushLog(p, stream, chunk) {
  try {
    const disk = [];
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      const entry = { i: p.seq++, t: new Date().toISOString().slice(11, 19), s: stream, line: line.slice(0, 500) };
      p.log.push(entry);
      disk.push({ t: entry.t, s: entry.s, line: entry.line });
      if (p.log.length > LOG_MAX) p.log.splice(0, p.log.length - LOG_MAX);
    }
    if (disk.length) appendDiskLog(p.id, disk);       // R#4: persist to disk
  } catch (e) { /* R19: don't let a throw in the 'data' event escape the handler */ }
}
/* R#4: append run log to telemetry/logs/<id>.log (JSONL) + naive rotation when > LOG_FILE_MAX */
function appendDiskLog(id, entries) {
  if (!id || !entries || !entries.length) return;
  try {
    const f = path.join(LOG_DIR, `${id}.log`);
    fs.appendFileSync(f, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
    if (fs.statSync(f).size > LOG_FILE_MAX) {
      const buf = fs.readFileSync(f);
      fs.writeFileSync(f, buf.slice(buf.length - Math.floor(LOG_FILE_MAX / 2)));
    }
  } catch {}
}
/* R#4: read the disk log tail (used by agent detail after a restart, when the in-memory proc is gone) */
function readDiskLog(id, n) {
  const out = [];
  for (const line of tailRead(path.join(LOG_DIR, `${id}.log`), 80000).split("\n")) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); out.push({ i: 0, t: o.t, s: o.s, line: o.line }); } catch {}
  }
  return out.slice(-n);
}

let managedProcessManager = null;
function processManager() {
  if (managedProcessManager || !processManagerLib) return managedProcessManager;
  managedProcessManager = processManagerLib.createManagedProcessManager({
    logDir: path.join(LOG_DIR, "managed"),
    recordsPath: path.join(TELEMETRY_DIR, "managed-processes.json"),
    spawnImpl: spawn,
    execFileImpl: execFile,
    onLog(record, stream, line) {
      const p = procs.get(record.agentId);
      if (p && p.runId === record.runId) return pushLog(p, stream, line);
      appendDiskLog(record.agentId, [{
        t: new Date().toISOString().slice(11, 19),
        s: stream,
        line: String(line).slice(0, 500),
      }]);
    },
  });
  return managedProcessManager;
}

/* R2: consistent tree-kill (Win: taskkill /T, POSIX: kill process group) - used by owned-run & gwCtl timeout */
function killTree(pid, child) {
  if (!pid) { try { child && child.kill(); } catch {} return; }
  if (process.platform === "win32") { try { execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => {}); } catch {} }
  else { try { process.kill(-pid, "SIGKILL"); } catch { try { child && child.kill(); } catch {} } }
}

/* ROADMAP #1: alert when an agent goes down (running → down) or a run exits non-zero.
   Durable = 1 note in the vault Inbox/ (auto-appears in Needs Review). Windows toast = best-effort. */
function notifyWindows(title, msg) {
  if (process.platform !== "win32") return;
  const q = s => String(s).replace(/'/g, "''").slice(0, 200);
  const ps = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ` +
    `$n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Warning; $n.Visible = $true; ` +
    `$n.ShowBalloonTip(8000, '${q(title)}', '${q(msg)}', [System.Windows.Forms.ToolTipIcon]::Warning); ` +
    `Start-Sleep -Seconds 9; $n.Dispose()`;
  try { spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { detached: true, windowsHide: true, stdio: "ignore" }).unref(); } catch {}
}
function alertDown(id, reason) {
  const agent = agentById(id);
  const name = agent ? agent.name : id;
  const stamp = localISO();
  try {
    const dir = path.join(VAULT, "Inbox");
    fs.mkdirSync(dir, { recursive: true });
    const fname = `ALERT ${name} ${stamp.slice(0, 10)} ${stamp.slice(11, 19).replace(/:/g, ".")}.md`;
    fs.writeFileSync(path.join(dir, fname),
      `---\ntype: alert\nagent: ${id}\ncreated: ${stamp}\ntags: [alert, agentic-os]\n---\n\n` +
      `# ⚠ ${name} - gateway down\n\n- Time: ${stamp.slice(0, 19).replace("T", " ")}\n- Cause: ${reason}\n- Source: agentic-os dashboard (automatic detection)\n`, "utf8");
  } catch (e) { console.error("[alert] failed to write inbox note:", e.message); }
  sysEvent(id, "error", `DOWN - ${reason}`);
  notifyWindows(`⚠ ${name} down`, reason);
}

/* ROADMAP #2: log each status poll to telemetry/uptime.jsonl (ts + up 0/1) → 24-hour uptime strip.
   ponytail: append-only, read via tailRead (byte cap). File grows ~polls/day - rotate later if needed. */
function logUptime(id, running) {
  try { fs.appendFileSync(path.join(TELEMETRY_DIR, "uptime.jsonl"), JSON.stringify({ ts: Date.now(), id, up: running ? 1 : 0 }) + "\n"); } catch {}
}
function uptimeMap() {
  const cutoff = Date.now() - DAY;
  const acc = {};
  for (const line of tailRead(path.join(TELEMETRY_DIR, "uptime.jsonl"), 500000).split("\n")) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!o || !o.id || !o.ts || o.ts < cutoff) continue;
    const a = acc[o.id] || (acc[o.id] = { up: 0, total: 0 });
    a.total++; if (o.up) a.up++;
  }
  const out = {};
  for (const id in acc) out[id] = { pct: Math.round(acc[id].up / acc[id].total * 100), samples: acc[id].total };
  return out;
}

/* Native operations may run only when the adapter supplies a reviewed argv spec.
   There is intentionally no fallback that concatenates a binary and action. */
function runtimeAdapter(agent, action) {
  if (!processAdaptersLib) return null;
  return processAdaptersLib.resolveRuntimeAdapter({ agent, action, platform: process.platform });
}

function gwCtl(id, action, cb) {
  const agent = agentById(id);
  if (!agent) return cb({ error: `unknown agent '${id}'` });
  if (!agent.enabled) return cb({ error: agent.note || `gateway '${id}' is disabled` });
  const resolved = runtimeAdapter(agent, action);
  if (!resolved) {
    const adaptersBlocked = moduleLoadError("process-adapters", {
      loading: "runtime adapters are still loading",
      failed: "runtime adapters unavailable",
    });
    return cb(adaptersBlocked || { error: "runtime adapters unavailable" });
  }

  /* Task status is an observation, not a guessed native command. */
  if (action === "status" && !resolved.available) {
    const managed = processManager()?.status(id);
    const detected = probeInstalled(agent);
    const runtimeState = managed?.runtimeState || (detected ? "idle" : "unavailable");
    const running = ["starting", "running", "waiting", "stopping"].includes(runtimeState);
    const observed = Boolean(managed) || detected;
    const detail = managed
      ? `managed ${managed.actionType}: ${runtimeState}`
      : detected ? `binary detected: ${resolved.binaryCandidates[0] || agent.gateway?.trigger}` : "binary not detected";
    const complete = health => {
      const healthOk = !health || health.ok;
      const output = health ? `${detail}\nhealth: ${healthOk ? "ok" : "failed"}${health.output ? ` (${health.output})` : ""}` : detail;
      gwCache.set(id, { running, text: output, at: Date.now(), exitCode: managed?.exitCode ?? null });
      logUptime(id, running);
      cb({ ok: observed && healthOk, code: observed && healthOk ? 0 : 1, action, running, runtimeState: healthOk ? runtimeState : "failed", output, native: false });
    };
    const health = runtimeAdapter(agent, "health-check");
    if (health?.available) return gwCtl(id, "health-check", complete);
    return complete(null);
  }
  if (!resolved.available) return cb({ error: resolved.reason, runtimeState: "unavailable" });

  const profile = resolveSummonProfile(agent, { stateRoot: RUNTIME_PATHS.stateRoot });
  const cwd = profile.cwd || agent.gateway?.home || agent.gateway?.workdir || agent.gateway?.cwd || loadConfig().workdir;
  if (cwd && !fs.existsSync(cwd)) { try { fs.mkdirSync(cwd, { recursive: true }); } catch (_) {} }
  if (!cwd || !fs.existsSync(cwd)) return cb({ error: `cwd does not exist: ${cwd || "(unset)"}` });
  const manager = processManager();
  if (!manager) {
    const managerBlocked = moduleLoadError("process-manager", {
      loading: "process manager is still loading",
      failed: "process manager unavailable",
    });
    return cb(managerBlocked || { error: "process manager unavailable" });
  }
  const actionType = ["start", "restart"].includes(action) ? "native-gateway-control" : `native-${action}`;
  const started = manager.start({
    agentId: id,
    actionType,
    command: resolved.command,
    cwd,
    env: buildAgentEnv(agent, process.env, loadConfig().workdir),
  });
  if (!started.ok) return cb({ error: started.error, runtimeState: started.record?.runtimeState || "failed" });
  let done = false;
  const finish = result => { if (done) return; done = true; clearTimeout(timer); cb(result); };
  const timer = setTimeout(() => {
    manager.stop(id, actionType).then(() => finish({ error: `timeout 30s: ${resolved.command.program}`, runtimeState: "failed" }));
  }, 30000);
  manager.waitForExit(id, actionType).then(record => {
    if (done) return;
    const finalize = health => {
      if (done) return;
    const text = manager.logs(id, 0, actionType).lines.map(line => line.line).join("\n").trim().slice(0, 4000);
    const healthText = health ? manager.logs(id, 0, "native-health-check").lines.map(line => line.line).join("\n").trim().slice(0, 4000) : "";
    const nativeRunning = action === "stop" ? false : detectRunning(text);
    const owned = manager.status(id);
    const running = nativeRunning || ["starting", "running", "waiting", "stopping"].includes(owned?.runtimeState);
    const operationOk = record?.exitCode === 0 && (!health || health.exitCode === 0);
    const runtimeState = !operationOk ? "failed" : running ? "running" : "stopped";
      const statusParts = [text];
      if (action === "status" && owned) statusParts.push(`managed ${owned.actionType}: ${owned.runtimeState}`);
      if (health) statusParts.push(`health: ${health.exitCode === 0 ? "ok" : "failed"}${healthText ? ` (${healthText})` : ""}`);
      const output = statusParts.filter(Boolean).join("\n");
    gwCache.set(id, { running, text: output, at: Date.now(), exitCode: record?.exitCode ?? null });
    logUptime(id, running);
    if (action !== "status") sysEvent(id, record?.exitCode === 0 ? "ok" : "error", `gateway ${action}: ${runtimeState}`);
    finish({ ok: operationOk, code: record?.exitCode, action, running, runtimeState, output, native: true });
    };
    if (action !== "status") return finalize(null);
    const health = runtimeAdapter(agent, "health-check");
    if (!health?.available) return finalize(null);
    const healthStart = manager.start({
      agentId: id,
      actionType: "native-health-check",
      command: health.command,
      cwd,
      env: buildAgentEnv(agent, process.env, loadConfig().workdir),
    });
    if (!healthStart.ok) return finalize({ exitCode: -1, reason: healthStart.error });
    manager.waitForExit(id, "native-health-check").then(finalize);
  });
}

/* Gateway Run launches only an explicit, reviewed non-interactive command. */
function gwRun(id) {
  const agent = agentById(id);
  if (!agent) return { error: `unknown agent '${id}'` };
  if (!agent.enabled) return { error: agent.note || `gateway '${id}' is disabled` };
  const resolved = runtimeAdapter(agent, "gateway-run");
  if (!resolved) {
    const adaptersBlocked = moduleLoadError("process-adapters", {
      loading: "runtime adapters are still loading",
      failed: "runtime adapters unavailable",
    });
    return adaptersBlocked || { error: "runtime adapters unavailable" };
  }
  if (!resolved.available) return { error: resolved.reason, runtimeState: "unavailable" };
  const profile = resolveSummonProfile(agent, { stateRoot: RUNTIME_PATHS.stateRoot });
  const cwd = profile.cwd || agent.gateway?.home || agent.gateway?.workdir || agent.gateway?.cwd || loadConfig().workdir;
  if (cwd && !fs.existsSync(cwd)) { try { fs.mkdirSync(cwd, { recursive: true }); } catch (_) {} }
  if (!cwd || !fs.existsSync(cwd)) return { error: `cwd does not exist: ${cwd || "(unset)"}` };
  const manager = processManager();
  if (!manager) {
    const managerBlocked = moduleLoadError("process-manager", {
      loading: "process manager is still loading",
      failed: "process manager unavailable",
    });
    return managerBlocked || { error: "process manager unavailable" };
  }
  const existing = procs.get(id);
  if (existing && existing.status === "running") return { error: `${id} already has an owned process running (pid ${existing.pid})` };
  const started = manager.start({
    agentId: id,
    actionType: "gateway-run",
    command: resolved.command,
    cwd,
    env: buildAgentEnv(agent, process.env, loadConfig().workdir),
  });
  if (!started.ok) return { error: started.error, runtimeState: started.record?.runtimeState || "failed" };
  const record = started.record;
  const p = {
    id,
    runId: record.runId,
    log: [],
    seq: 0,
    status: record.runtimeState,
    startedAt: record.startTime,
    exitCode: record.exitCode,
    pid: record.pid,
  };
  procs.set(id, p);
  pushLog(p, "sys", `[agentic-os] managed gateway run: ${record.command} (cwd: ${record.workingDirectory})`);
  sysEvent(id, "ok", `gateway run (managed) pid ${record.pid}`);
  return { ok: true, pid: record.pid, mode: "run (managed)", runtimeState: record.runtimeState };
}

/* ---------------- summoned terminals (pid-file handshake + kill-file self-termination) ----------------
   Summon opens an ADMIN terminal (wt.exe/powershell -Verb RunAs) that runs the agent's trigger CLI.
   The dashboard is non-elevated, so it can't kill the elevated shell directly. Instead the elevated
   shell registers its own $PID to telemetry/terms/<id>.pid and runs a background job that watches for
   telemetry/terms/<id>.kill - when that file appears, the shell taskkills its own tree (no second UAC). */
function termPidFile(id) { return path.join(TERMS_DIR, `${id}.pid`); }
function termKillFile(id) { return path.join(TERMS_DIR, `${id}.kill`); }
function readTermPid(id) {
  try { const o = JSON.parse(fs.readFileSync(termPidFile(id), "utf8")); return o && o.pid ? o : null; } catch { return null; }
}
function cleanupTerm(id) {
  try { fs.unlinkSync(termPidFile(id)); } catch {}
  try { fs.unlinkSync(termKillFile(id)); } catch {}
  summons.delete(id);
}
/* poll liveness of every tracked summoned terminal with ONE tasklist call.
   Image-name check (powershell/pwsh) guards against PID recycling. */
function pollSummons(cb) {
  let ids = [];
  try { ids = loadConfig().agents.map(a => a.id); } catch { ids = [...summons.keys()]; }
  const tracked = [];
  for (const id of ids) {
    const f = readTermPid(id);
    if (f) {
      const s = summons.get(id) || { launchedAt: 0, alive: false };
      summons.set(id, { ...s, pid: f.pid, startedAt: f.startedAt || s.startedAt || null });
      tracked.push(id);
    }
  }
  if (!tracked.length) { cb && cb(); return; }
  execFile("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true }, (e, out) => {
    const img = new Map();  // pid -> image name
    if (!e) for (const line of String(out).split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)","(\d+)"/);
      if (m) img.set(Number(m[2]), m[1].toLowerCase());
    }
    for (const id of tracked) {
      const s = summons.get(id);
      if (!s) continue;
      const alive = /powershell|pwsh/.test(img.get(s.pid) || "");
      if (alive) s.alive = true;
      else if (s.alive || Date.now() - (s.launchedAt || 0) > 120000) {
        if (s.alive) sysEvent(id, "warn", `summoned terminal pid ${s.pid} closed`);
        cleanupTerm(id);  // was alive & now gone, or stale pid file from a previous boot
      }
    }
    cb && cb();
  });
}
function termInfo(id) {
  const s = summons.get(id);
  if (!s) return null;
  if (s.alive) return { pid: s.pid, startedAt: s.startedAt, alive: true };
  if (Date.now() - (s.launchedAt || 0) < 120000) return { alive: false, pending: true };
  return null;
}

/* terminal: open a Windows Terminal (elevated/admin unless gateway.elevate === false) that cd's to the
   agent folder & auto-runs the command. Summon mode registers the shell for tracked stop (see above). */
function gwTerminal(id, mode, cb) {
  const agent = agentById(id);
  if (!agent) return cb({ error: `unknown agent '${id}'` });
  const g = agent.gateway;
  if (!agent.enabled || !g) return cb({ error: agent.note || `gateway '${id}' not ready (enabled:false)` });
  if (mode !== "summon") return cb({ error: "terminal supports Summon only; use Gateway Run for managed execution" });
  const profile = resolveSummonProfile(agent, { stateRoot: RUNTIME_PATHS.stateRoot });
  const resolved = runtimeAdapter(agent, "summon");
  if (!profile.command || !resolved?.available) {
    return cb({ error: resolved?.reason || `${agent.name} has no safe summon command` });
  }
  const dir = profile.cwd;
  const command = resolved.command;
  const cmd = [command.program, ...command.args].join(" ");
  const cur = summons.get(id);
  if (cur && cur.alive) return cb({ error: `${agent.name} already has a summoned terminal (pid ${cur.pid}) - stop it first` });
  const found = /[\\/]/.test(command.program)
    ? fs.existsSync(command.program)
    : spawnSync("where.exe", [command.program], { windowsHide: true, timeout: 4000 }).status === 0;
  if (!found) {
    const inst = g.install || null;
    return cb({
      error: `${agent.name} CLI '${command.program}' is not installed on this machine`,
      notInstalled: true,
      install: inst || { note: "no installer configured" },
    });
  }
  if (!fs.existsSync(dir)) {
    if (g.home) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }
    if (!fs.existsSync(dir)) return cb({ error: `folder does not exist: ${dir}` });
  }

  const q = s => String(s).replace(/'/g, "''");
  const invoke = "& '" + q(command.program) + "'" + command.args.map(arg => " '" + q(arg) + "'").join("");
  // inner bootstrap runs INSIDE the (possibly elevated) terminal; -EncodedCommand avoids nested quoting
  const inner =
    "$ErrorActionPreference='SilentlyContinue'\n" +
    "Set-Content -LiteralPath '" + q(termPidFile(id)) + "' -Value ('{\"pid\":' + $PID + ',\"startedAt\":\"' + (Get-Date -Format o) + '\"}') -Encoding ASCII\n" +
    "$null = Start-Job -ArgumentList $PID,'" + q(termKillFile(id)) + "' -ScriptBlock { param($p,$k) while($true){ if(Test-Path $k){ Remove-Item $k -Force; taskkill /PID $p /T /F | Out-Null }; Start-Sleep -Seconds 2 } }\n" +
    "Set-Location -LiteralPath '" + q(dir) + "'\n" +
    invoke + "\n";
  const b64 = Buffer.from(inner, "utf16le").toString("base64");
  const elevate = g.elevate !== false;
  const verb = elevate ? "-Verb RunAs " : "";
  const ps =
    `$wt = Get-Command wt.exe -ErrorAction SilentlyContinue; ` +
    `if ($wt) { Start-Process wt.exe ${verb}-ArgumentList '-d','${q(dir)}','powershell','-NoExit','-EncodedCommand','${b64}' } ` +
    `else { Start-Process powershell ${verb}-ArgumentList '-NoExit','-EncodedCommand','${b64}' }`;

  try { fs.unlinkSync(termPidFile(id)); } catch {}
  try { fs.unlinkSync(termKillFile(id)); } catch {}
  summons.set(id, { pid: null, startedAt: null, alive: false, launchedAt: Date.now() });
  // attached spawn (NOT detached): Start-Process -Verb RunAs throws when UAC is declined,
  // so the exit code + stderr tell us whether the terminal actually opened.
  let done = false, errOut = "", child;
  const finish = obj => { if (done) return; done = true; clearTimeout(timer); cb(obj); };
  try { child = spawn("powershell", ["-NoProfile", "-Command", ps], { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }); }
  catch (e) { summons.delete(id); return cb({ error: `failed to open terminal: ${e.message}` }); }
  // UAC prompts can sit unanswered - after 45s report "pending" and let the poll settle it later
  const timer = setTimeout(() => finish({ ok: true, mode, dir, cmd, terminal: true, pending: true, note: "waiting for UAC confirmation" }), 45000);
  child.stderr.on("data", d => { errOut += d; });
  child.on("error", err => { summons.delete(id); finish({ error: `failed to open terminal: ${err.message}` }); });
  child.on("exit", code => {
    if (code === 0) {
      sysEvent(id, "ok", "summon terminal opened");
      appendDiskLog(id, [{ t: new Date().toISOString().slice(11, 19), s: "sys", line: `[agentic-os] summon terminal opened (${elevate ? "admin" : "user"}): ${cmd}  (cwd: ${dir})` }]);
      setTimeout(pollSummons, 4000); setTimeout(pollSummons, 12000);
      return finish({ ok: true, mode, dir, cmd, terminal: true, elevated: elevate });
    }
    const msg = /canceled by the user/i.test(errOut) ? "UAC declined by user" : ((errOut.trim().split(/\r?\n/)[0] || `exit code ${code}`).slice(0, 200));
    summons.delete(id); sysEvent(id, "error", `summon failed: ${msg}`);
    finish({ error: `terminal not opened: ${msg}` });
  });
}

/* stop-term: close a summoned terminal. Normal path = write the kill file (the elevated shell kills
   itself → no UAC). Fallback after 10s = elevated taskkill (one UAC prompt). */
function gwStopTerm(id, cb) {
  const agent = agentById(id);
  if (!agent) return cb({ error: `unknown agent '${id}'` });
  pollSummons(() => {
    const s = summons.get(id);
    if (!s || !s.pid || !s.alive) return cb({ error: `no summoned terminal tracked for ${agent.name}` });
    const pid = s.pid;
    try { fs.writeFileSync(termKillFile(id), String(Date.now())); } catch (e) { return cb({ error: `cannot write kill file: ${e.message}` }); }
    const t0 = Date.now();
    const check = () => {
      execFile("tasklist", ["/FO", "CSV", "/NH", "/FI", `PID eq ${pid}`], { windowsHide: true }, (e, out) => {
        const alive = !e && /"\d+"/.test(String(out));
        if (!alive) {
          cleanupTerm(id);
          sysEvent(id, "ok", `summoned terminal pid ${pid} closed`);
          appendDiskLog(id, [{ t: new Date().toISOString().slice(11, 19), s: "sys", line: `[agentic-os] summoned terminal pid ${pid} closed` }]);
          return cb({ ok: true, pid, closed: true });
        }
        if (Date.now() - t0 < 10000) return setTimeout(check, 1000);
        // watcher didn't fire → escalate: elevated taskkill (one UAC prompt)
        const ps2 = `Start-Process taskkill -Verb RunAs -ArgumentList '/PID','${pid}','/T','/F' -Wait`;
        execFile("powershell", ["-NoProfile", "-Command", ps2], { windowsHide: true, timeout: 60000 }, () => {
          execFile("tasklist", ["/FO", "CSV", "/NH", "/FI", `PID eq ${pid}`], { windowsHide: true }, (e2, out2) => {
            if (!e2 && /"\d+"/.test(String(out2))) return cb({ error: "terminal still alive - UAC declined or kill failed" });
            cleanupTerm(id);
            sysEvent(id, "ok", `summoned terminal pid ${pid} force-closed`);
            cb({ ok: true, pid, closed: true, forced: true });
          });
        });
      });
    };
    setTimeout(check, 1500);
  });
}

/* kill legacy owned installer/update processes. Gateway runs use processManager(). */
function killOwned(id) {
  const p = procs.get(id);
  if (p?.runId) return false;
  if (!p || p.status !== "running" || !p.pid) return false;
  pushLog(p, "sys", "[agentic-os] stop owned - tree-kill");
  killTree(p.pid, p.child);
  return true;
}

/* Stop only a process owned by Rempeyek, then optionally run a reviewed native stop. */
function gwStop(id, cb) {
  const agent = agentById(id);
  if (!agent) return cb({ error: `unknown agent '${id}'` });
  const manager = processManager();
  const managed = manager?.status(id);
  const native = runtimeAdapter(agent, "stop");
  const finishNative = ownedKilled => {
    if (native?.available) return gwCtl(id, "stop", result => cb({ ...result, ownedKilled }));
    if (!ownedKilled) return cb({
      error: native?.reason || `no managed process or verified native stop for ${agent.name}`,
      runtimeState: managed?.runtimeState || "idle",
    });
    cb({ ok: true, ownedKilled: true, runtimeState: "stopped" });
  };
  if (!managed || !["starting", "running", "waiting", "stopping"].includes(managed.runtimeState)) {
    return finishNative(false);
  }
  manager.stop(id).then(result => {
    const p = procs.get(id);
    if (p && result.record) {
      p.status = result.record.runtimeState;
      p.exitCode = result.record.exitCode;
    }
    if (!result.ok) return cb({ error: result.error, runtimeState: result.record?.runtimeState || "failed" });
    finishNative(true);
  });
}

/* R#7: real health probe - check that the TCP port is actually listening (more honest than matching status text).
   Config: agent.gateway.probe = { host?, port }. Successful connect = alive, else down. */
function probePort(host, port, cb) {
  const sock = new net.Socket();
  let done = false;
  const finish = up => { if (done) return; done = true; try { sock.destroy(); } catch {} cb(up); };
  sock.setTimeout(3000);
  sock.once("connect", () => finish(true));
  sock.once("timeout", () => finish(false));
  sock.once("error", () => finish(false));
  try { sock.connect(port, host || "127.0.0.1"); } catch { finish(false); }
}
function probeAndCache(id, probe) {
  probePort(probe.host, probe.port, up => {
    const prev = gwCache.get(id);
    const host = probe.host || "127.0.0.1";
    gwCache.set(id, { running: up, text: `probe TCP ${host}:${probe.port} → ${up ? "OPEN (listening)" : "CLOSED"}`, at: Date.now(), exitCode: up ? 0 : 1 });
    logUptime(id, up);
    if (prev && prev.running && !up) { alertDown(id, `probe port ${probe.port} closed (service down)`); maybeWatchdog(id); }
  });
}

/* R#6: watchdog auto-restart for 24/7 agents (optional per agent: gateway.watchdog=true).
   Hard anti-loop: max 3 restarts / hour. Alerts are still sent (by the caller). */
const restartLog = new Map();   // id -> [timestamps]
function maybeWatchdog(id) {
  const a = agentById(id);
  if (!a || !a.gateway || !a.gateway.watchdog || !gwActions(a).includes("restart")) return;
  const now = Date.now();
  const hits = (restartLog.get(id) || []).filter(t => now - t < 3600000);
  if (hits.length >= 3) { console.error(`[watchdog] ${id}: 3x/hour limit reached, stopping auto-restart`); return; }
  hits.push(now); restartLog.set(id, hits);
  console.error(`[watchdog] ${id}: auto-restart (attempt ${hits.length}/3 this hour)`);
  sysEvent(id, "warn", `watchdog auto-restart (attempt ${hits.length}/3)`);
  alertDown(id, `watchdog auto-restart (attempt ${hits.length}/3 within 1 hour)`);
  gwCtl(id, "restart", () => {});
}

/* refresh the status of every agent that supports it (called periodically).
   R4: in-flight guard - don't spawn a new status check while the old one is still running (prevents overlap/pileup). */
const polling = new Set();
function pollAllStatus() {
  let agents; try { agents = loadConfig().agents; } catch { return; }
  for (const a of agents) {
    if (!a.enabled || !a.gateway) continue;
    if (a.gateway.probe && a.gateway.probe.port) { probeAndCache(a.id, a.gateway.probe); continue; }  // R#7: probe wins
    if (runtimeAdapter(a, "status") && !polling.has(a.id)) {
      polling.add(a.id);
      gwCtl(a.id, "status", () => polling.delete(a.id));
    }
  }
}

/* ---------------- installed-state probe ----------------
   Whether an agent's CLI is actually on THIS machine - a `where <trigger>` (or existsSync for a path
   trigger). Previously this ran only lazily at summon time, so the dashboard never knew what was
   installed; now it is cached and refreshed on a slow interval so every card, the gateway panel, and
   the install catalog can show a truthful Installed / Install state. */
const installedCache = new Map();   // id -> { installed, at }
function probeInstalled(agent) {
  let exe; try { exe = agentDetailLib ? agentDetailLib.triggerExe(agent.gateway) : ""; } catch { exe = ""; }
  if (!exe) return false;
  if (/[\\/]/.test(exe)) { try { return fs.existsSync(exe); } catch { return false; } }
  try { return spawnSync("where.exe", [exe], { windowsHide: true, timeout: 4000 }).status === 0; }
  catch { return false; }
}
function pollInstalled() {
  let agents; try { agents = loadConfig().agents; } catch { return; }
  for (const a of agents) {
    if (a.enabled === false) continue;
    installedCache.set(a.id, { installed: probeInstalled(a), at: Date.now() });
  }
}
function installedState(id) {
  const c = installedCache.get(id);
  return c ? c.installed : null;   // null = not yet probed
}
/* catalogInstalled: installed-probe for a CATALOG entry (registered or not), 60s cache. */
function catalogInstalled(entry, services = DEFAULT_RUNTIME_SERVICES, { fresh = false } = {}) {
  if (typeof services.probeCatalogInstalled === "function") {
    return Boolean(services.probeCatalogInstalled(entry));
  }
  const c = installedCache.get(entry.id);
  if (!fresh && c && Date.now() - c.at < 60000) return c.installed;
  const manifestEntry = marketplaceLib?.marketplaceEntry(entry.id);
  const probe = processAdaptersLib?.resolveProbe({
    entry: manifestEntry,
    platform: process.platform,
  });
  let installed = false;
  if (probe) {
    try {
      installed = spawnSync(probe.program, probe.args, {
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        timeout: 5_000,
      }).status === 0;
    } catch {}
  }
  installedCache.set(entry.id, { installed, at: Date.now() });
  return installed;
}

/* ---------------- catalog install + self-update (owned, streamed) ----------------
   Both run as owned procs so the existing /api/proc/:id/log incremental tail shows them live in
   the run-log pane. SECURITY: installer selection comes ONLY from the reviewed Marketplace
   manifest and resolves to a fixed program plus argv. Caller input never becomes executable text. */
function installAgent(id, adapterId) {
  const marketplaceBlocked = moduleLoadError("marketplace-manifest", {
    loading: "Marketplace modules still loading - retry in a moment",
    failed: "Marketplace modules unavailable",
  }) || moduleLoadError("agent-catalog", {
    loading: "Marketplace modules still loading - retry in a moment",
    failed: "Marketplace modules unavailable",
  }) || moduleLoadError("process-adapters", {
    loading: "Marketplace modules still loading - retry in a moment",
    failed: "Marketplace modules unavailable",
  });
  if (marketplaceBlocked) return marketplaceBlocked;
  const entry = marketplaceLib.marketplaceEntry(id);
  if (!entry || entry.kind !== "agent") return { error: `unknown catalog agent '${id}'` };
  const available = entry.installers.filter(adapter =>
    !adapter.platforms || adapter.platforms.includes(process.platform));
  const selectedAdapterId = String(adapterId || available[0]?.id || "");
  const spec = processAdaptersLib.resolveAdapter({
    entry,
    adapterId: selectedAdapterId,
    action: "install",
    platform: process.platform,
  });
  if (!spec)
    return {
      error: `${entry.name} has no vetted auto-install adapter for this platform - use its install page`,
      url: entry.officialUrl || null,
    };
  const existing = procs.get(id);
  if (existing && existing.status === "running") return { error: `${id} already has an owned process running (pid ${existing.pid})` };
  const p = { id, log: [], seq: 0, status: "running", mode: "install", startedAt: new Date().toISOString(), exitCode: null };
  pushLog(p, "sys", `[agentic-os] install (reviewed adapter): ${spec.display}`);
  let child;
  try { child = processAdaptersLib.startResolvedProcess(spec, { spawnImpl: spawn }); }
  catch (e) { return { error: `spawn failed: ${e.message}` }; }
  p.child = child; p.pid = child.pid;
  child.stdout.on("data", d => pushLog(p, "out", d));
  child.stderr.on("data", d => pushLog(p, "err", d));
  child.on("exit", code => {
    p.status = "exited"; p.exitCode = code;
    pushLog(p, "sys", `[agentic-os] install exit code ${code}`);
    if (code === 0) {
      if (!loadConfig().agents.some(a => a.id === id)) {
        const r = addAgent({ catalogId: id });
        pushLog(p, "sys", r.error ? `[agentic-os] register failed: ${r.error}` : `[agentic-os] registered ${id} (${r.agent.node})`);
      }
      installedCache.delete(id);
      const registered = catalogLib.catalogEntry(id);
      installedCache.set(id, {
        installed: registered ? catalogInstalled(registered) : false,
        at: Date.now(),
      });
      sysEvent(id, "ok", "installed via dashboard catalog");
    }
  });
  child.on("error", err => { p.status = "error"; p.exitCode = -1; pushLog(p, "sys", `[agentic-os] spawn error: ${err.message}`); });
  procs.set(id, p);
  return { ok: true, pid: child.pid, id, log: `/api/proc/${id}/log` };
}

/* /api/version - local identity for the update banner. Cached (git calls are cheap, not free). */
let versionCache = null;
function versionInfo() {
  if (versionCache) return versionCache;
  let version = "0.0.0";
  try { version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version || version; } catch {}
  let rev = null, repo = null;
  try { const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, windowsHide: true, timeout: 4000, encoding: "utf8" }); if (r.status === 0) rev = r.stdout.trim(); } catch {}
  try {
    const r = spawnSync("git", ["remote", "get-url", "origin"], { cwd: ROOT, windowsHide: true, timeout: 4000, encoding: "utf8" });
    if (r.status === 0 && releaseLib) repo = (releaseLib.parseRepoUrl(r.stdout) || {}).slug || null;
  } catch {}
  versionCache = { version, rev, repo, node: process.version };
  return versionCache;
}

const UPDATE_ID = "os-update";   // reserved procs id - the /api/proc/:id/log tail route serves it
function startUpdate() {
  const existing = procs.get(UPDATE_ID);
  if (existing && existing.status === "running") return { error: "an update is already running", log: `/api/proc/${UPDATE_ID}/log` };
  if (!sourceUpdateLib) return { error: "source update service is unavailable" };
  const p = { id: UPDATE_ID, log: [], seq: 0, status: "running", mode: "update", startedAt: new Date().toISOString(), exitCode: null };
  pushLog(p, "sys", `[agentic-os] typed source update started (cwd: ${ROOT})`);
  procs.set(UPDATE_ID, p);
  sourceUpdateLib.runSourceUpdate({
    root: ROOT,
    onLine: line => pushLog(p, "out", line),
  }).then(() => {
    p.status = "exited"; p.exitCode = 0;
    versionCache = null;   // version on disk may have changed
    pushLog(p, "sys", "[agentic-os] update applied - UI assets are live now; restart the server to load backend changes");
    sysEvent(UPDATE_ID, "ok", "self-update applied");
  }).catch(error => {
    p.status = "error"; p.exitCode = 1;
    pushLog(p, "err", error?.message || String(error));
    pushLog(p, "sys", "[agentic-os] update failed - no pull runs unless the checkout is clean; --ff-only refuses divergence");
    sysEvent(UPDATE_ID, "warn", "self-update failed");
  });
  return { ok: true, id: UPDATE_ID, log: `/api/proc/${UPDATE_ID}/log` };
}

/* ---------------- avatar ---------------- */
function avatarUrl(id) {
  for (const ext of ["png", "jpg", "webp", "svg"])   // svg = temporary placeholder; raster (uploaded) wins first
    if (fs.existsSync(path.join(AVATAR_DIR, `${id}.${ext}`))) return `/avatars/${id}.${ext}`;
  return null;
}
function saveAvatar(id, dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return { error: "format must be data:image/png|jpeg|webp;base64" };
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3e6) return { error: "max 3 MB" };
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  for (const e of ["png", "jpg", "webp", "svg"]) { try { fs.unlinkSync(path.join(AVATAR_DIR, `${id}.${e}`)); } catch {} }
  fs.writeFileSync(path.join(AVATAR_DIR, `${id}.${ext}`), buf);
  return { ok: true, url: `/avatars/${id}.${ext}` };
}

/* ---------------- graph vault (view: Neural Vault) ----------------
   Four layers, each tagged on the edge so the client can toggle them and the
   report can still count wikilinks alone (totals.edges must stay honest):
     link   - a real [[wikilink]] or [](note.md) between two existing notes
     ghost  - a wikilink whose target note does not exist yet (Obsidian shows these too)
     tag    - note → #tag hub (a star, not a clique: a 20-note tag costs 20 edges, not 190)
     folder - note → containing folder → parent folder (the structural skeleton)
   Link resolution is path-aware: the vault holds 52 duplicate basenames, and a
   first-wins basename map silently orphans every one of the losers. */
const CODE_FENCE = /(^|\n)\s*(```|~~~)[\s\S]*?(\n\s*\2|$)/g;
const INLINE_CODE = /`[^`\n]*`/g;

function resolveLink(raw, fromRel, byPath, byBase) {
  const clean = raw.trim().replace(/\\/g, "/").replace(/\.md$/i, "").replace(/^\.\//, "");
  if (!clean) return null;
  const lc = clean.toLowerCase();
  if (byPath.has(lc)) return byPath.get(lc);            // [[Brains/Copilot/Note]] - exact path
  const cands = byBase.get(lc.split("/").pop());
  if (!cands || !cands.length) return null;
  if (cands.length === 1) return cands[0];
  // Ambiguous basename. Prefer a path ending with what was written, then a sibling
  // of the source note, then the shallowest path - Obsidian's own resolution order.
  const suffix = cands.find(c => c.toLowerCase().replace(/\.md$/, "").endsWith("/" + lc));
  if (suffix) return suffix;
  const dir = fromRel.slice(0, fromRel.lastIndexOf("/") + 1);
  const sibling = cands.find(c => c.startsWith(dir) && !c.slice(dir.length).includes("/"));
  if (sibling) return sibling;
  return cands.slice().sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0];
}

let graphCache = { t: 0, data: null };
let parityGraphCache = { t: 0, data: null };
async function buildParityGraph() {
  if (parityGraphCache.data && Date.now() - parityGraphCache.t < 60000) return parityGraphCache.data;
  if (unifiedMemoryLib?.buildUnifiedMemoryGraph) {
    try {
      const configDir = path.join(RUNTIME_PATHS.runtimeRoot || path.dirname(VAULT), 'Config');
      const data = unifiedMemoryLib.buildUnifiedMemoryGraph({ vaultPath: VAULT, rootDir: ROOT, configDir });
      parityGraphCache = { t: Date.now(), data };
      return data;
    } catch (e) { console.error('[buildParityGraph]', e.message); }
  }
  const { buildVaultGraph } = await VAULT_GRAPH;
  // Full fidelity: every vault file (only .md gets read + link-parsed) + repo source as `code`.
  const files = walkVaultAll().map((file) => {
    if (!file.rel.toLowerCase().endsWith(".md")) return file;
    try { return { ...file, text: fs.readFileSync(path.join(VAULT, file.rel), "utf8") }; }
    catch { return null; }
  }).filter(Boolean).concat(walkRepo());
  const data = buildVaultGraph({ files });
  parityGraphCache = { t: Date.now(), data };
  return data;
}

function legacyDecisionContext(slug, entries) {
  return entries.map((text, index) => ({
    id: `${slug}-decision-${index + 1}`,
    text,
    status: "context",
  }));
}

function todayProjectData(files) {
  return buildProjects(files).map(project => {
    const text = readDoc(path.join(VAULT, ...project.rel.split("/")));
    const body = parseFM(text).body;
    const tasks = body.split(/\r?\n/).flatMap((line, index) => {
      const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/);
      if (!match) return [];
      return [{ id: `${project.slug}-task-${index + 1}`, title: match[2].replace(/<!--.*?-->/g, "").trim(), status: match[1].toLowerCase() === "x" ? "completed" : "pending" }];
    });
    const decisions = project.kind === "workspace"
      ? legacyDecisionContext(project.slug, decisionList(project.slug))
      : [];
    const prefix = project.kind === "workspace" ? `Projects/${project.slug}/` : "";
    const recentArtifacts = prefix ? files
      .filter(file => file.rel.startsWith(prefix) && !new Set(["project.md", "decisions.md", "next.md"]).has(file.rel.slice(prefix.length).toLowerCase()))
      .sort((a, b) => b.mtime - a.mtime).slice(0, 8)
      .map(file => ({ path: file.rel, updatedAt: file.mtime })) : [];
    return { ...project, id: project.slug, tasks, decisions, recentArtifacts };
  });
}

async function buildLiveAgentTopology(services = DEFAULT_RUNTIME_SERVICES) {
  const { buildAgentTopology } = await AGENT_TOPOLOGY;
  const { coAssignments } = await AGENT_DETAIL;
  const config = services.loadConfig();
  const state = services === DEFAULT_RUNTIME_SERVICES
    ? buildState()
    : {
        agents: config.agents.map(agent => ({
          ...agent,
          gateway: undefined,
        })),
      };
  // Verified agent↔agent relationships from the vault: two agents on one project (provenance =
  // the task line). Directed task/subagent/comm edges appear here too once agents report them.
  const taskFiles = services === DEFAULT_RUNTIME_SERVICES ? readTaskFiles() : [];
  const co = coAssignments(taskFiles, state.agents);
  const configuredSubagents = config.agents
    .filter(agent => agent.kind === "subagent" && agent.parentId)
    .map(agent => ({
      id: `registry:${agent.parentId}:${agent.id}`,
      parentAgentId: agent.parentId,
      agentId: agent.id,
      status: agent.enabled === false ? "disabled" : "configured",
    }));
  return buildAgentTopology({
    agents: state.agents,
    coAssignments: co,
    subagents: configuredSubagents,
  });
}
/* readTaskFiles: raw text of every vault Tasks/*.md, for co-assignment discovery. */
function readTaskFiles() {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(path.join(VAULT, "Tasks")).filter(n => n.endsWith(".md")); } catch {}
  for (const n of names) {
    try { out.push({ rel: `Tasks/${n}`, text: fs.readFileSync(path.join(VAULT, "Tasks", n), "utf8") }); } catch {}
  }
  return out;
}
function buildGraph() {
  if (graphCache.data && Date.now() - graphCache.t < 60000) return graphCache.data;
  try {
  const files = walkVault();
  const nodes = new Map();   // id -> node
  const byPath = new Map();  // "brains/hermes/note" -> rel
  const byBase = new Map();  // "note" -> [rel, rel, …]  - every candidate, not first-wins

  const addNode = (id, n) => { if (!nodes.has(id)) nodes.set(id, { id, deg: 0, ...n }); return nodes.get(id); };

  for (const f of files) {
    const label = f.rel.split("/").pop().replace(/\.md$/, "");
    const dir = f.rel.includes("/") ? f.rel.slice(0, f.rel.lastIndexOf("/")) : "";
    addNode(f.rel, { label, folder: dir || "(root)", type: "note", mtime: f.mtime });
    byPath.set(f.rel.toLowerCase().replace(/\.md$/, ""), f.rel);
    const base = label.toLowerCase();
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(f.rel);
  }

  const edges = [];
  const seen = new Set();
  const push = (s, t, type) => {
    if (s === t) return;
    const key = (s < t ? s + "\0" + t : t + "\0" + s) + "\0" + type;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ s, t, type });
    nodes.get(s).deg++; nodes.get(t).deg++;
  };

  for (const f of files) {
    let text; try { text = fs.readFileSync(path.join(VAULT, f.rel), "utf8"); } catch { continue; }
    const body = text.replace(CODE_FENCE, "\n").replace(INLINE_CODE, " ");

    // [[Target|alias]] · [[Target#heading]] · ![[Embed]]
    for (const m of body.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
      const raw = m[1].split("|")[0].split("#")[0];
      if (!raw.trim()) continue;
      const target = resolveLink(raw, f.rel, byPath, byBase);
      if (target) { push(f.rel, target, "link"); continue; }
      const name = raw.trim().replace(/\.md$/i, "").split("/").pop();
      if (!/^[\w][\w .'&()+-]{1,60}$/.test(name)) continue;   // drop prose noise: "...", "[ abc", ":/"
      const gid = "ghost:" + name;
      addNode(gid, { label: name, folder: "(unresolved)", type: "ghost", mtime: 0 });
      push(f.rel, gid, "ghost");
    }
    // [text](Some Note.md)
    for (const m of body.matchAll(/\]\(([^)\s]+\.md)\)/g)) {
      let raw; try { raw = decodeURIComponent(m[1]); } catch { raw = m[1]; }
      const target = resolveLink(raw, f.rel, byPath, byBase);
      if (target) push(f.rel, target, "link");
    }
    // #tag - code is already stripped, and "# Heading" needs a space so it cannot match
    for (const m of body.matchAll(/(?:^|[\s(])#([A-Za-z][\w-]*(?:\/[\w-]+)*)/gm)) {
      const tid = "tag:" + m[1].toLowerCase();
      addNode(tid, { label: "#" + m[1], folder: "(tags)", type: "tag", mtime: 0 });
      push(f.rel, tid, "tag");
    }
  }

  // folder skeleton: note → its folder → parent folder → …
  for (const f of files) {
    if (!f.rel.includes("/")) continue;
    const parts = f.rel.split("/").slice(0, -1);
    let prev = null;
    for (let i = 0; i < parts.length; i++) {
      const fid = "folder:" + parts.slice(0, i + 1).join("/");
      addNode(fid, { label: parts[i], folder: parts[0], type: "folder", mtime: 0 });
      if (prev) push(prev, fid, "folder");
      prev = fid;
    }
    if (prev) push(f.rel, prev, "folder");
  }

  const linked = new Set();
  for (const e of edges) {
    if (e.type !== "link" && e.type !== "ghost") continue;
    linked.add(e.s); linked.add(e.t);
  }
  const stats = {
    notes: files.length,
    links: edges.filter(e => e.type === "link").length,
    ghosts: edges.filter(e => e.type === "ghost").length,
    tagEdges: edges.filter(e => e.type === "tag").length,
    folderEdges: edges.filter(e => e.type === "folder").length,
    orphans: [...nodes.values()].filter(n => n.type === "note" && !linked.has(n.id)).length,
  };
  graphCache = { t: Date.now(), data: { nodes: [...nodes.values()], edges, stats, generatedAt: new Date().toISOString() } };
  return graphCache.data;
  } catch (e) {
    if (graphCache.data) return graphCache.data;   // R18: don't poison the cache to null
    return { nodes: [], edges: [], stats: { notes: 0, links: 0, ghosts: 0, tagEdges: 0, folderEdges: 0, orphans: 0 }, generatedAt: new Date().toISOString(), error: e.message };
  }
}

/* ------- Claude Code activity: sessions + subagents from the transcript jsonl ------- */
function tailRead(file, bytes) {
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, "r");
    const len = Math.min(bytes, size);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    return buf.toString("utf8");
  } catch { return ""; }
}
const HOME_PREFIX_RE = new RegExp("^" + os.homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\\\/]", "i");
function toolTarget(name, input) {
  if (!input) return "";
  const t = input.file_path || input.path || input.pattern || input.description ||
    (input.command ? String(input.command) : "") || input.prompt || "";
  return String(t).replace(HOME_PREFIX_RE, "").slice(0, 90);
}
function claudeActivity() {
  const sessions = [];
  let dirs = [];
  try { dirs = fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return { sessions, subagents: [] }; }
  const cutoff = Date.now() - 2 * DAY;
  const cand = [];
  for (const d of dirs) {
    const dir = path.join(CLAUDE_PROJECTS, d.name);
    let names = []; try { names = fs.readdirSync(dir).filter(n => n.endsWith(".jsonl")); } catch { continue; }
    for (const n of names) {
      let st; try { st = fs.statSync(path.join(dir, n)); } catch { continue; }
      if (st.mtimeMs > cutoff) cand.push({ file: path.join(dir, n), dir: d.name, mtime: st.mtimeMs, id: n.replace(".jsonl", "") });
    }
  }
  cand.sort((a, b) => b.mtime - a.mtime);
  const allAgents = [];
  for (const c of cand.slice(0, 8)) {
    const lines = tailRead(c.file, 400000).split("\n");
    let lastTool = null, lastPrompt = null, toolCount = 0;
    const spawns = new Map(); // tool_use id -> spawn
    const results = new Set();
    for (const line of lines) {
      if (!line.trim() || line[0] !== "{") continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      const msg = o.message;
      if (!msg || o.isSidechain) continue;
      const content = msg.content;
      if (msg.role === "user") {
        if (typeof content === "string" && !content.startsWith("<")) lastPrompt = content.slice(0, 160);
        if (Array.isArray(content)) for (const b of content) {
          if (b.type === "text" && b.text && !b.text.startsWith("<")) lastPrompt = b.text.slice(0, 160);
          if (b.type === "tool_result" && b.tool_use_id) results.add(b.tool_use_id);
        }
      }
      if (msg.role === "assistant" && Array.isArray(content)) for (const b of content) {
        if (b.type !== "tool_use") continue;
        toolCount++;
        lastTool = { name: b.name, target: toolTarget(b.name, b.input), ts: o.timestamp || null };
        if (b.name === "Agent" || b.name === "Task")
          spawns.set(b.id, {
            session: c.id.slice(0, 8), ts: o.timestamp || null,
            desc: (b.input && (b.input.description || "")) || "(no description)",
            type: (b.input && (b.input.subagent_type || "general-purpose")) || "general-purpose",
            status: "running",
          });
      }
    }
    for (const [tid, sp] of spawns) { if (results.has(tid)) sp.status = "done"; allAgents.push(sp); }
    const ageMin = (Date.now() - c.mtime) / 60000;
    sessions.push({
      id: c.id.slice(0, 8),
      project: c.dir.replace(/^C--/, "C:/").replace(/-/g, "/"),
      lastActivity: new Date(c.mtime).toISOString(),
      status: ageMin < 5 ? "working" : ageMin < 120 ? "waiting" : "idle",
      lastPrompt, lastTool, toolCount,
    });
  }
  return { sessions, subagents: allAgents.reverse().slice(0, 20) };
}

/* ------- cross-agent telemetry: agentic-os/telemetry/<id>.jsonl -------
   Windowing + activity derivation live in lib/agent-detail.mjs (pure + unit-tested). The window
   reserves room for real signal so a heartbeat flood can no longer evict subagent/task events. */
function readTelemetry(id) {
  const file = path.join(TELEMETRY_DIR, `${id}.jsonl`);
  if (!fs.existsSync(file) || !agentDetailLib) return [];
  const events = agentDetailLib.parseTelemetry(tailRead(file, 100000));
  return agentDetailLib.selectTelemetryWindow(events, { limit: 30 });   // newest-first
}

function agentDetail(id, services = DEFAULT_RUNTIME_SERVICES) {
  const config = services.loadConfig();
  const agent = config.agents.find(a => a.id === id);
  if (!agent) return { error: `unknown agent '${id}'` };
  const configuredSubagents = config.agents
    .filter(candidate =>
      candidate.kind === "subagent" &&
      (candidate.parentId === id || candidate.detachedFrom === id)
    )
    .map(candidate => ({
      id: candidate.id,
      kind: candidate.kind,
      parentId: candidate.parentId,
      detachedFrom: candidate.detachedFrom || null,
      name: candidate.name,
      domain: candidate.domain,
      role: candidate.role,
      outcome: candidate.outcome,
      workspaceScope: candidate.workspaceScope,
      permissions: candidate.permissions,
      memoryPolicy: candidate.memoryPolicy,
      activation: candidate.activation,
      modelProvider: candidate.modelProvider,
      toolIds: candidate.toolIds,
      skillIds: candidate.skillIds,
      cadence: candidate.cadence,
      eventTrigger: candidate.eventTrigger,
      checkpointRule: candidate.checkpointRule,
      instructions: candidate.instructions,
      node: candidate.node,
      lane: candidate.lane,
      enabled: candidate.enabled,
      createdAt: candidate.createdAt,
      status: candidate.detachedFrom === id
        ? "detached"
        : candidate.enabled === false
          ? "disabled"
          : "configured",
    }));
  const p = procs.get(id);
  processPendingAgentTasks(id);
  const files = walkVault();
  const tele = readTelemetry(id);
  const laneFiles = files
    .filter(f => agent.lane && f.rel.startsWith(`Brains/${agent.lane}/`))
    .sort((a, b) => b.mtime - a.mtime).slice(0, 8)
    .map(f => ({ rel: f.rel, updated: new Date(f.mtime).toISOString().slice(0, 16).replace("T", " ") }));
  return {
    id, kind: agent.kind || "agent", parentId: agent.parentId || null,
    name: agent.name, icon: agent.icon, role: agent.role, node: agent.node,
    enabled: agent.enabled, note: agent.note || null, avatar: avatarUrl(id),
    cwd: agent.gateway && agent.gateway.cwd, bin: agent.gateway && agent.gateway.bin, actions: gwActions(agent),
    canSummon: !!(agent.gateway && agent.gateway.home && agent.gateway.trigger),
    installed: installedState(id), install: (agent.gateway && agent.gateway.install) || null,
    proc: procInfo(id), term: termInfo(id), ...agentVaultStatus(files, agent),
    log: p && p.log.length ? p.log.slice(-40) : readDiskLog(id, 40),   // R#4: fall back to disk after a restart
    laneFiles, telemetry: tele,
    // uniform activity for all agents: Claude from transcripts, the rest from their own telemetry
    activity: id === "claude-code" ? claudeActivity() : (agentDetailLib ? agentDetailLib.telemetryActivity(tele) : { sessions: [], subagents: [] }),
    configuredSubagents,
    source: id === "claude-code" ? "transcript" : "telemetry",
  };
}

/* ---------------- report generator ---------------- */
function buildReport() {
  const cfg = loadConfig();
  const files = walkVault();
  const now = Date.now();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d0 = new Date(now - i * DAY); d0.setHours(0, 0, 0, 0);
    const d1 = d0.getTime() + DAY;
    days.push({
      date: d0.toISOString().slice(5, 10),
      count: files.filter(f => f.mtime >= d0.getTime() && f.mtime < d1).length,
    });
  }
  const folders = {};
  for (const f of files) { const top = f.rel.includes("/") ? f.rel.split("/")[0] : "(root)"; folders[top] = (folders[top] || 0) + 1; }
  const tasks = openTasks();
  const graph = buildGraph();
  const agents = cfg.agents.map(a => {
    const vs = agentVaultStatus(files, a);
    return {
      id: a.id, name: a.name, icon: a.icon, node: a.node, avatar: avatarUrl(a.id),
      laneNotes: a.lane ? files.filter(f => f.rel.startsWith(`Brains/${a.lane}/`)).length : 0,
      touched7d: a.lane ? files.filter(f => f.rel.startsWith(`Brains/${a.lane}/`) && now - f.mtime < 7 * DAY).length : 0,
      lastSeen: vs.lastSeen, vaultStatus: vs.vaultStatus, gw: procInfo(a.id).status,
    };
  });
  return {
    generatedAt: localISO(),
    totals: {
      notes: files.length, edges: graph.stats.links, openTasks: tasks.length,
      active7d: files.filter(f => now - f.mtime < 7 * DAY).length,
      gwRunning: cfg.agents.filter(a => procInfo(a.id).status === "running").length,
    },
    days, folders: Object.entries(folders).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    agents, tasks: tasks.slice(0, 10),
  };
}
function reportMarkdown(r) {
  const bar = n => "█".repeat(Math.min(n, 30)) || "·";
  const lines = [
    "---",
    `title: "Agentic OS Report ${r.generatedAt.slice(0, 10)}"`,
    `date: ${r.generatedAt.slice(0, 10)}`,
    "type: report",
    "created_by: agentic-os-dashboard",
    "tags: [report, agentic-os]",
    "---", "",
    `# Agentic OS Report - ${r.generatedAt.slice(0, 16).replace("T", " ")}`, "",
    `| Metric | Value |`, `|---|---|`,
    `| Total vault notes | ${r.totals.notes} |`,
    `| Note-to-note links (wikilinks) | ${r.totals.edges} |`,
    `| Notes active in 7 days | ${r.totals.active7d} |`,
    `| Open tasks | ${r.totals.openTasks} |`,
    `| Gateways running | ${r.totals.gwRunning} |`, "",
    "## 14-day activity (notes changed/day)", "", "```",
    ...r.days.map(d => `${d.date}  ${String(d.count).padStart(3)}  ${bar(d.count)}`),
    "```", "",
    "## Folder distribution", "", `| Folder | Notes |`, `|---|---|`,
    ...r.folders.map(f => `| ${f.name} | ${f.count} |`), "",
    "## Agent status", "", `| Agent | Node | Lane notes | Active 7d | Last seen | Gateway |`, `|---|---|---|---|---|---|`,
    ...r.agents.map(a => `| ${a.icon} ${a.name} | ${a.node} | ${a.laneNotes} | ${a.touched7d} | ${a.lastSeen || "-"} | ${a.gw} |`), "",
  ];
  if (r.tasks.length) lines.push("## Open tasks (max 10)", "", ...r.tasks.map(t => `- [ ] ${t.text} _(${t.source})_`), "");
  lines.push("---", "_Generated automatically by the Agentic OS dashboard._");
  return lines.join("\n");
}
function localISO(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}
function saveReport() {
  try {
    const r = buildReport();
    const dir = path.join(VAULT, "Reports");
    fs.mkdirSync(dir, { recursive: true });
    const l = localISO();
    const name = `Report ${l.slice(0, 10)} ${l.slice(11, 19).replace(/:/g, ".")}.md`;  // seconds → no overwrites
    fs.writeFileSync(path.join(dir, name), reportMarkdown(r), "utf8");
    return { ok: true, rel: `Reports/${name}` };
  } catch (e) { return { error: `failed to save report: ${e.message}` }; }
}


function readSwitchboardMessages() {
  if (!switchboardLib) return [];
  return switchboardLib.readSwitchboardMessages(TELEMETRY_DIR);
}
function saveSwitchboardMessages(list) {
  if (!switchboardLib) throw new Error("switchboard module is still loading");
  return switchboardLib.saveSwitchboardMessages(TELEMETRY_DIR, list);
}
function writeAgentTask(agentId, message) {
  const agent = agentById(agentId);
  const who = agent?.name || agentId || "agent";
  const lane = agent?.lane || agentId || "General";
  const stamp = localISO();
  const body = String(message || "").trim();
  if (!body) return { error: "empty message" };
  try {
    const inboxDir = path.join(VAULT, "Brains", lane, "Inbox");
    fs.mkdirSync(inboxDir, { recursive: true });
    const fname = `Switchboard ${stamp.slice(0, 10)} ${stamp.slice(11, 19).replace(/:/g, ".")}.md`;
    fs.writeFileSync(path.join(inboxDir, fname),
      `---\ntype: switchboard\nagent: ${agentId}\nfrom: dashboard\ncreated: ${stamp}\n---\n\n` +
      `# Switchboard message for ${who}\n\n${body}\n`, "utf8");
    const tasksDir = path.join(VAULT, "Tasks");
    fs.mkdirSync(tasksDir, { recursive: true });
    const taskFile = path.join(tasksDir, "Inbox Tasks.md");
    const line = `- [ ] ${body.slice(0, 180)} - ${who} - ${stamp.slice(0, 10)}  ·  switchboard\n`;
    if (!fs.existsSync(taskFile)) {
      fs.writeFileSync(taskFile, `# Inbox Tasks\n\n${line}`, "utf8");
    } else {
      fs.appendFileSync(taskFile, line, "utf8");
    }
    const teleFile = path.join(TELEMETRY_DIR, `${agentId || "general"}.jsonl`);
    fs.appendFileSync(teleFile, JSON.stringify({
      ts: new Date().toISOString(),
      type: "task_start",
      name: body.slice(0, 120),
      detail: "Delivered from Switchboard",
      status: "running",
    }) + "\n", "utf8");
    return { ok: true, rel: `Brains/${lane}/Inbox/${fname}` };
  } catch (e) {
    return { error: e.message };
  }
}

function processPendingAgentTasks(agentId) {
  if (!agentId) return;
  const cfg = loadConfig();
  const agent = cfg.agents.find(a => a.id === agentId);
  const who = agent ? agent.name : agentId;
  const pInfo = procInfo(agentId);
  const tInfo = termInfo(agentId);
  const isOnline = (pInfo && pInfo.status === "running") || (tInfo && tInfo.alive);

  if (!isOnline) return;

  try {
    if (switchboardLib) {
      const all = readSwitchboardMessages();
      const unread = switchboardLib.unreadForAgent(all, agentId);
      if (unread.length) {
        for (const msg of unread) {
          writeAgentTask(agentId, `[Switchboard] ${msg.fromAgentId || "user"}: ${msg.message}`);
        }
        const marked = switchboardLib.markSwitchboardRead(all, { agentId });
        if (marked.updated) saveSwitchboardMessages(marked.messages);
      }
    }
  } catch {}

  try {
    const file = path.join(VAULT, "Tasks", "Inbox Tasks.md");
    if (!fs.existsSync(file)) return;
    const txt = fs.readFileSync(file, "utf8");
    const lines = txt.split(/\r?\n/);
    let modified = false;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*[-*] \[ \]/.test(l) && (l.toLowerCase().includes(who.toLowerCase()) || l.toLowerCase().includes(agentId.toLowerCase()))) {
        lines[i] = lines[i].replace("[ ]", "[x]");
        modified = true;
        const taskText = l.replace(/^\s*[-*] \[ \]\s*/, "").split(" - ")[0];
        const teleFile = path.join(TELEMETRY_DIR, `${agentId}.jsonl`);
        fs.appendFileSync(teleFile, JSON.stringify({
          ts: new Date().toISOString(),
          type: "task_done",
          name: taskText,
          detail: `Acknowledged and completed by ${who} (online)`,
          status: "done"
        }) + "\n", "utf8");
      }
    }
    if (modified) {
      fs.writeFileSync(file, lines.join("\n"), "utf8");
    }
  } catch {}
}

/* R#5: send a task to an agent from the dashboard → write a checkbox to vault Tasks/Inbox Tasks.md.
   openTasks() scans all Tasks/*.md → it auto-appears in Needs Review (kind task), agents pick it up themselves. */
function createTask(agentId, title, detail) {
  title = String(title || "").trim().replace(/[\r\n]+/g, " ").slice(0, 200);
  if (!title) return { error: "task title is empty" };
  const agent = loadConfig().agents.find(a => a.id === agentId);
  const who = agent ? agent.name : (agentId ? agentId : "General");
  const date = localISO().slice(0, 10);
  const extra = detail ? `  ·  ${String(detail).trim().replace(/[\r\n]+/g, " ").slice(0, 300)}` : "";
  try {
    const dir = path.join(VAULT, "Tasks");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "Inbox Tasks.md");
    const line = `- [ ] ${title} - ${who} - ${date}${extra}\n`;   // - = clean em-dash (avoids mojibake)
    if (!fs.existsSync(file))
      fs.writeFileSync(file, `# 📥 Inbox Tasks\n\n> Tasks from the dashboard. Agents pick them up → mark \`[x]\` when done.\n\n${line}`, "utf8");
    else
      fs.appendFileSync(file, line, "utf8");

    const teleFile = path.join(TELEMETRY_DIR, `${agentId || "general"}.jsonl`);
    try {
      fs.appendFileSync(teleFile, JSON.stringify({
        ts: new Date().toISOString(),
        type: "task_start",
        name: title,
        detail: detail || "Queued from Switchboard",
        status: "running"
      }) + "\n", "utf8");
    } catch {}

    if (agentId) {
      processPendingAgentTasks(agentId);
    }

    return { ok: true, rel: "Tasks/Inbox Tasks.md", line: line.trim() };
  } catch (e) { return { error: `failed to write task: ${e.message}` }; }
}

function operationalSyncPrompt(services = DEFAULT_RUNTIME_SERVICES) {
  const templatePath = path.join(
    ROOT,
    "prompts",
    "operational-synchronization.md",
  );
  const template = fs.readFileSync(templatePath, "utf8");
  const config = services.loadConfig();
  const recipients = registeredPrimaryAgents(config);
  return {
    schemaVersion: 1,
    promptVersion: PROMPT_VERSION,
    prompt: renderOperationalSyncPrompt(template, {
      runtimeRoot: services.stateRoot,
      vaultPath: services.vaultPath,
      skillWarehouse: path.join(services.userHome, ".skills"),
    }),
    recipients: recipients.length,
    agentIds: recipients.map(agent => agent.id),
  };
}

function sendOperationalSyncPrompt(services, operationId) {
  const prior = mutationReplay(services, operationId);
  if (prior) return prior;
  const snapshot = operationalSyncPrompt(services);
  const result = dispatchOperationalSyncPrompt({
    vaultPath: services.vaultPath,
    config: services.loadConfig(),
    prompt: snapshot.prompt,
  });
  return rememberMutation(services, operationId, {
    ...result,
    operationId,
    promptVersion: snapshot.promptVersion,
  });
}

/* R#8: schedule panel - read each agent's Windows Scheduled Task (next run, last run, last result). */
function querySchtask(name, cb) {
  execFile("schtasks", ["/query", "/tn", name, "/fo", "LIST", "/v"], { windowsHide: true }, (e, out) => {
    if (e) return cb({ name, error: String((e.message || "query failed")).split("\n")[0].slice(0, 120) });
    const grab = re => { const m = out.match(re); return m ? m[1].trim() : null; };
    const lr = grab(/Last Result:\s*(.+)/);
    cb({ name, taskState: grab(/Scheduled Task State:\s*(.+)/) || grab(/Status:\s*(.+)/),
      nextRun: grab(/Next Run Time:\s*(.+)/), lastRun: grab(/Last Run Time:\s*(.+)/),
      lastResult: lr, ok: lr === "0" });
  });
}
function buildSchedule(cb) {
  let agents;
  try { agents = loadConfig().agents.filter(a => a.kind !== "subagent"); } catch { return cb([]); }
  const configRows = agents
    .filter(a => a.cadence || a.gateway?.schedule || a.gateway?.schtask)
    .map(a => ({
      id: a.id,
      agent: a.name,
      icon: a.icon,
      name: a.gateway?.schtask || a.cadence || a.gateway?.schedule || a.id,
      taskState: a.gateway?.schtask ? "querying" : "configured",
      nextRun: a.cadence || a.gateway?.schedule || null,
      lastRun: null,
      lastResult: null,
      ok: true,
      source: a.gateway?.schtask ? "schtask" : "config",
    }));
  const withSch = agents.filter(a => a.gateway && a.gateway.schtask);
  if (!withSch.length) return cb(configRows);
  const out = [];
  let pending = withSch.length;
  withSch.forEach(a => querySchtask(a.gateway.schtask, r => {
    out.push({ id: a.id, agent: a.name, icon: a.icon, source: "schtask", ...r });
    if (--pending === 0) {
      const ids = new Set(out.map(row => row.id));
      cb([...out, ...configRows.filter(row => !ids.has(row.id) && row.source !== "schtask")]);
    }
  }));
}

/* R#9: vault health - age of the last git commit + age of the last backup (prevent losing the brain).
   Backup optional via env BACKUP_PATH (folder/file); if unset, only git is reported. */
function buildVaultHealth(cb) {
  const res = { vault: VAULT, gitCommitAt: null, gitAgeH: null, gitOk: false, backupAt: null, backupAgeH: null, backup: null };
  const backup = process.env.BACKUP_PATH || null;
  if (backup) { try { const st = fs.statSync(backup); res.backupAt = new Date(st.mtimeMs).toISOString(); res.backupAgeH = Math.round((Date.now() - st.mtimeMs) / 3600000); res.backup = backup; } catch { res.backup = backup + " (not found)"; } }
  execFile("git", ["-C", VAULT, "log", "-1", "--format=%cI"], { windowsHide: true }, (e, out) => {
    if (!e && out && out.trim()) { const t = Date.parse(out.trim()); if (!Number.isNaN(t)) { res.gitCommitAt = out.trim(); res.gitAgeH = Math.round((Date.now() - t) / 3600000); res.gitOk = true; } }
    else res.gitError = e ? String(e.message).split("\n")[0].slice(0, 120) : "no commits";
    cb(res);
  });
}

/* Bonus (two-way): mark a task done from the dashboard → change `- [ ]` to `- [x]` in the vault file. */
function markTaskDone(source, text) {
  if (!source || !text) return { error: "requires {source, text}" };
  const rel = String(source).replace(/\\/g, "/");
  if (!rel.startsWith("Tasks/") || rel.includes("..")) return { error: "source must be inside Tasks/" };
  const file = path.join(VAULT, rel);
  try {
    let txt = fs.readFileSync(file, "utf8");
    const needle = String(text).trim();
    const lines = txt.split(/\r?\n/);
    const i = lines.findIndex(l => /^\s*[-*] \[ \]/.test(l) && l.includes(needle));
    if (i === -1) return { error: "task not found (it may have changed)" };
    lines[i] = lines[i].replace("[ ]", "[x]");
    fs.writeFileSync(file, lines.join("\n"), "utf8");
    return { ok: true, rel, line: lines[i].trim() };
  } catch (e) { return { error: `update failed: ${e.message}` }; }
}

function lifecycleState(services, id, config = services.loadConfig()) {
  const entry = marketplaceLib?.marketplaceEntry(id) || null;
  const agent = config.agents.find(candidate =>
    candidate.id === id || candidate.gateway?.marketplaceId === id,
  ) || null;
  const installed = entry?.kind === "agent"
    ? catalogInstalled(entry, services)
    : entry
      ? receiptInstalled(services, entry.id)
      : null;
  const derived = lifecycleLib.deriveLifecycle({
    entry: entry || { id },
    agent,
    installed,
    activeAgentId: config.activeAgentId || null,
  });
  return {
    ...derived,
    name: agent?.name || entry?.name || id,
    role: agent?.role || entry?.agent?.role || entry?.summary || "",
    note: agent?.note || "",
    enabled: agent ? agent.enabled !== false : false,
    kind: agent?.kind || "agent",
    parentId: agent?.parentId || null,
    uninstallable: Boolean(entry?.uninstallers?.some(adapter =>
      !adapter.platforms || adapter.platforms.includes(process.platform)
    )),
  };
}

function lifecycleSnapshot(services) {
  const config = services.loadConfig();
  const ids = new Set(
    marketplaceLib.MARKETPLACE_ENTRIES
      .filter(entry => entry.kind === "agent")
      .map(entry => entry.id),
  );
  for (const agent of config.agents) {
    if (agent.kind !== "subagent") ids.add(agent.id);
  }
  return {
    schemaVersion: 1,
    activeAgentId: config.activeAgentId || null,
    busy: [...services.ownedMutations.values()]
      .some(operation => operation.status === "running"),
    agents: [...ids].map(id => lifecycleState(services, id, config)),
    tombstones: [],
  };
}

function ownedLogNames(services) {
  try {
    return fs.readdirSync(services.logDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^[a-z0-9][a-z0-9-]*\.log$/i.test(entry.name))
      .map(entry => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function runtimeSnapshot(services, approvalAuditCount = 0) {
  const config = services.loadConfig();
  return runtimeSettingsLib.runtimeSettingsSnapshot({
    stateRoot: services.stateRoot,
    vaultPath: services.vaultPath,
    logDir: services.logDir,
    config,
    env: process.env,
    tombstones: services.store.listTombstones(),
    backupExists: fs.existsSync(`${services.configPath}.bak`),
    backupPath: `${services.configPath}.bak`,
    logFiles: ownedLogNames(services),
    approvalAuditCount,
  });
}

function marketplaceSnapshot(services) {
  const config = services.loadConfig();
  const registered = new Set();
  for (const agent of config.agents) {
    registered.add(agent.id);
    if (agent.gateway?.marketplaceId) registered.add(agent.gateway.marketplaceId);
  }
  const entries = marketplaceLib.MARKETPLACE_ENTRIES.map(entry =>
    marketplaceLib.publicMarketplaceEntry(entry, {
      platform: process.platform,
      registered: registered.has(entry.id),
      installed: entry.kind === "agent"
        ? catalogInstalled(entry, services)
        : receiptInstalled(services, entry.id),
    }),
  );
  return { schemaVersion: 1, entries };
}

function marketplaceHookFailure(hooks, operation, hookName) {
  operation.status = "error";
  operation.error = "Marketplace lifecycle hook failed";
  operation.errorStage = hookName;
  operation.finishedAt = new Date().toISOString();
  try {
    if (typeof hooks.onHookError === "function") hooks.onHookError(operation);
  } catch {}
}

function invokeMarketplaceHook(hooks, hookName, operation, ...args) {
  if (typeof hooks[hookName] !== "function") return;
  try {
    hooks[hookName](...args);
  } catch {
    marketplaceHookFailure(hooks, operation, hookName);
  }
}

function startMarketplaceProcess(services, entry, adapterId, action, operationId, hooks = {}) {
  const spec = processAdaptersLib.resolveAdapter({
    entry,
    adapterId,
    action,
    platform: process.platform,
  });
  if (!spec) {
    throw new Error(`${entry.name} has no reviewed ${action} adapter for this platform`);
  }
  const running = services.ownedMutations.get(entry.id);
  if (running?.status === "running") {
    throw new Error(`${entry.id} already has a Marketplace mutation running`);
  }
  const child = services.startResolvedProcess
    ? services.startResolvedProcess(spec, {
        cwd: services.userHome,
        visible: action === "install",
      })
    : processAdaptersLib.startResolvedProcess(spec, {
        spawnImpl: spawn,
        cwd: services.userHome,
        visible: action === "install",
      });
  const operation = {
    id: operationId,
    entityId: entry.id,
    action,
    status: "running",
    pid: child.pid || null,
    startedAt: new Date().toISOString(),
  };
  services.ownedMutations.set(entry.id, operation);
  child.once("exit", code => {
    operation.status = "exited";
    operation.exitCode = code;
    operation.finishedAt = new Date().toISOString();
    installedCache.delete(entry.id);
    invokeMarketplaceHook(hooks, "onExit", operation, code, operation);
  });
  child.once("error", error => {
    operation.status = "error";
    operation.error = error.message;
    operation.finishedAt = new Date().toISOString();
    invokeMarketplaceHook(hooks, "onError", operation, error, operation);
  });
  return operation;
}

function installMarketplace(services, entry, data) {
  const prior = mutationReplay(services, data.operationId);
  if (prior) return { code: prior.event?.type?.endsWith("_started") ? 202 : 200, body: prior };

  if (entry.kind === "plugin" || entry.kind === "skill") {
    if (entry.id !== "hypertaks-agent" && entry.id !== "hypertaks-founder") {
      throw new Error(`no managed installer for '${entry.id}'`);
    }
    const sourceRoot = path.join(services.bundleRoot, "hypertaks-agent");
    verifyManagedBundle(sourceRoot, entry);
    const plan = managedBundleLib.buildHypertaksCopyPlan({
      sourceRoot,
      userHome: services.userHome,
      kind: entry.kind,
    });
    const result = managedBundleLib.applyCopyPlan(
      plan,
      receiptPath(services, entry.id),
    );
    if (!result.ok) {
      const error = new Error("managed install would overwrite existing user files");
      error.status = 409;
      error.collisions = result.collisions;
      throw error;
    }
    const body = rememberMutation(services, data.operationId, {
      operationId: data.operationId,
      state: lifecycleState(services, entry.id),
      event: { type: "marketplace.managed_installed", entityId: entry.id },
    });
    return { code: 200, body };
  }

  const available = entry.installers.filter(adapter =>
    !adapter.platforms || adapter.platforms.includes(process.platform));
  const adapterId = String(data.adapterId || available[0]?.id || "");
  const spec = processAdaptersLib.resolveAdapter({
    entry,
    adapterId,
    action: "install",
    platform: process.platform,
  });
  if (!spec) {
    throw new Error(`${entry.name} has no reviewed install adapter for this platform`);
  }
  if (spec.externalUrl) {
    const body = rememberMutation(services, data.operationId, {
      operationId: data.operationId,
      state: lifecycleState(services, entry.id),
      event: {
        type: "agent.manual_install_required",
        agentId: entry.id,
        url: spec.externalUrl,
        note: spec.note,
      },
    });
    return { code: 200, body };
  }
  const rememberInstallOutcome = (event, extra = {}) => {
    let config = null;
    try { config = services.loadConfig(); } catch {}
    let state = null;
    try {
      if (config) state = lifecycleState(services, entry.id, config);
    } catch {}
    return rememberMutation(services, data.operationId, {
      operationId: data.operationId,
      state,
      event,
      ...extra,
    });
  };
  const operation = startMarketplaceProcess(
    services,
    entry,
    adapterId,
    "install",
    data.operationId,
    {
      onExit(code) {
        if (code !== 0) {
          rememberInstallOutcome(
            { type: "agent.install_failed", agentId: entry.id, exitCode: code },
            { error: "agent installer exited with a non-zero status" },
          );
          return;
        }
        if (data.register !== true) {
          rememberInstallOutcome(
            { type: "agent.install_completed", agentId: entry.id, registered: false },
          );
          return;
        }
        if (!catalogInstalled(entry, services, { fresh: true })) {
          rememberInstallOutcome(
            { type: "agent.install_unverified", agentId: entry.id },
            { error: "installer completed but the agent executable was not detected" },
          );
          return;
        }
        const config = services.loadConfig();
        const registered = config.agents.find(agent =>
          agent.id === entry.id || agent.gateway?.marketplaceId === entry.id
        );
        const agent = registered || reviewedAgentProfile(
          config,
          entry,
          services.userHome,
          services.stateRoot,
        );
        if (!registered) {
          const committed = { ...config, agents: [...config.agents, agent] };
          services.store.commit(committed, `${data.operationId}.register`);
        }
        scaffoldRuntimeVaultLane(agent, services.vaultPath);
        writeAgentLauncher({
          stateRoot: services.stateRoot,
          trigger: agent.gateway?.trigger,
          workingDirectory: agent.gateway?.workdir,
        });
        rememberInstallOutcome(
          { type: "agent.install_completed", agentId: entry.id, registered: true },
        );
      },
      onHookError(operation) {
        rememberInstallOutcome(
          {
            type: "agent.install_registration_failed",
            agentId: entry.id,
            stage: operation.errorStage || "post_install_registration",
          },
          { error: "installer completed but agent registration failed" },
        );
      },
    },
  );
  const config = services.loadConfig();
  const body = rememberMutation(services, data.operationId, {
    operationId: data.operationId,
    state: lifecycleState(services, entry.id, config),
    event: {
      type: "agent.install_started",
      agentId: entry.id,
      pid: operation.pid,
    },
  });
  return { code: 202, body };
}

function uninstallMarketplace(services, entry, data) {
  const prior = mutationReplay(services, data.operationId);
  if (prior) return { code: prior.event?.type?.endsWith("_started") ? 202 : 200, body: prior };

  if (entry.kind === "plugin" || entry.kind === "skill") {
    const file = receiptPath(services, entry.id);
    if (!fs.existsSync(file)) throw new Error(`'${entry.id}' is not managed by Rempeyek`);
    const result = managedBundleLib.removeManagedFiles(file);
    if (result.preserved.length === 0) fs.unlinkSync(file);
    const body = rememberMutation(services, data.operationId, {
      operationId: data.operationId,
      state: lifecycleState(services, entry.id),
      event: {
        type: "marketplace.managed_uninstalled",
        entityId: entry.id,
        removed: result.removed.length,
        preserved: result.preserved,
      },
    });
    return { code: result.preserved.length ? 409 : 200, body };
  }

  const available = entry.uninstallers.filter(adapter =>
    !adapter.platforms || adapter.platforms.includes(process.platform));
  const adapterId = String(data.adapterId || available[0]?.id || "");
  const rememberUninstallOutcome = (event, extra = {}) => {
    let state = null;
    try { state = lifecycleState(services, entry.id); } catch {}
    return rememberMutation(services, data.operationId, {
      operationId: data.operationId,
      state,
      event,
      ...extra,
    });
  };
  const operation = startMarketplaceProcess(
    services,
    entry,
    adapterId,
    "uninstall",
    data.operationId,
    {
      onExit(code) {
        if (code !== 0) {
          rememberUninstallOutcome(
            { type: "agent.uninstall_failed", agentId: entry.id, exitCode: code },
            { error: "agent uninstaller exited with a non-zero status" },
          );
          return;
        }
        if (catalogInstalled(entry, services, { fresh: true })) {
          rememberUninstallOutcome(
            { type: "agent.uninstall_unverified", agentId: entry.id },
            { error: "uninstaller completed but the agent executable is still detected" },
          );
          return;
        }
        const config = services.loadConfig();
        const agent = config.agents.find(candidate =>
          candidate.id === entry.id || candidate.gateway?.marketplaceId === entry.id
        );
        if (agent) {
          try {
            services.store.removeProfile(
              config,
              agent.id,
              { detachChildren: false },
              `${data.operationId}.remove-profile`,
            );
            removeOwnedAgentLauncher({
              stateRoot: services.stateRoot,
              trigger: agent.gateway?.trigger,
              workingDirectory: agent.gateway?.workdir,
            });
          } catch (error) {
            rememberUninstallOutcome(
              { type: "agent.uninstall_profile_removal_failed", agentId: entry.id },
              { error: error.message },
            );
            return;
          }
        }
        rememberUninstallOutcome({
          type: "agent.uninstall_completed",
          agentId: entry.id,
          profileRemoved: Boolean(agent),
        });
      },
      onError(_operation, error) {
        rememberUninstallOutcome(
          { type: "agent.uninstall_failed", agentId: entry.id },
          { error: error.message },
        );
      },
    },
  );
  const body = rememberMutation(services, data.operationId, {
    operationId: data.operationId,
    state: lifecycleState(services, entry.id),
    event: {
      type: "agent.uninstall_started",
      agentId: entry.id,
      pid: operation.pid,
    },
  });
  return { code: 202, body };
}

function readBody(req, res, cb) {
  let body = "", aborted = false;
  req.on("data", d => {
    body += d;
    if (body.length > 5e6 && !aborted) {           // R5: reply 413, don't leave the client hanging
      aborted = true;
      res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "body exceeds 5MB" }));
      req.destroy();
    }
  });
  req.on("end", () => { if (!aborted) cb(body); });
}

/* ---------------- http ---------------- */
/* S1: constant-time token compare (anti timing attack). S2: header-only auth - ?token= query is not accepted */
function safeEq(a, b) {
  const ba = Buffer.from(String(a || "")), bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) { crypto.timingSafeEqual(bb, bb); return false; }
  return crypto.timingSafeEqual(ba, bb);
}
function authorized(req) {
  if (!TOKEN) return true;
  if (process.env.DASH_REMOTE === "1") return safeEq(req.headers["x-dash-token"] || "", TOKEN);
  const remote = req.socket && (req.socket.remoteAddress || req.connection && req.connection.remoteAddress || "");
  if (/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)) return true;
  return safeEq(req.headers["x-dash-token"] || "", TOKEN);
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function withApproval(req, res, type, target, run) {
  return APPROVAL_QUEUE.then(queue => {
    const result = queue.authorize(req.headers["x-approval-id"], { type, target, actor: "dashboard" });
    return result.allowed ? run() : json(res, 403, { error: "approved action required", reason: result.reason, type, target });
  }).catch(() => json(res, 503, { error: "approval service unavailable" }));
}

function withTwoApprovals(req, res, first, second, run) {
  return APPROVAL_QUEUE.then(queue => {
    const a = queue.authorize(req.headers["x-approval-id"], {
      ...first,
      actor: "dashboard",
    });
    if (!a.allowed) {
      return json(res, 403, {
        error: "first approval required",
        reason: a.reason,
      });
    }
    const b = queue.authorize(req.headers["x-confirmation-id"], {
      ...second,
      actor: "dashboard",
    });
    if (!b.allowed) {
      return json(res, 403, {
        error: "second approval required",
        reason: b.reason,
      });
    }
    return run();
  }).catch(() => json(res, 503, { error: "approval service unavailable" }));
}

function withLifecycleModules(res, run) {
  return Promise.all([
    AGENT_CATALOG_MOD,
    AGENT_DETAIL,
    MARKETPLACE_MOD,
    PROCESS_ADAPTERS_MOD,
    PROCESS_MANAGER_MOD,
    AGENT_LIFECYCLE_MOD,
    MANAGED_BUNDLE_MOD,
  ])
    .then(run)
    .catch(error => {
      console.error("[lifecycle-api]", error.message);
      if (!res.headersSent) {
        json(res, 503, { error: "lifecycle services unavailable" });
      }
    });
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".md": "text/markdown; charset=utf-8" };

function requestHandler(req, res, services = DEFAULT_RUNTIME_SERVICES) {
  const access = ACCESS_POLICY.authorize(req);
  if (!access.allowed) return json(res, access.status, { error: access.error });
  const url = (req.url || "/").split("?")[0];

  if (url.startsWith("/api/")) {
    if (!authorized(req)) return json(res, 401, { error: "invalid/missing token - set the x-dash-token header" });
    try {
      if (url === "/api/today" && req.method === "GET")
        return TODAY_PROJECTION.then(({ buildTodayProjection }) => {
          const files = walkVault();
          json(res, 200, buildTodayProjection(todayProjectData(files)));
        })
          .catch(() => json(res, 503, { state: "unavailable", error: "Today workspace unavailable" }));
      if (url === "/api/approvals" && req.method === "GET")
        return APPROVAL_QUEUE.then(queue => json(res, 200, { approvals: queue.list(), audit: queue.audit() }));
      if (url === "/api/approvals" && req.method === "POST")
        return readBody(req, res, body => {
          let data; try { data = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          APPROVAL_QUEUE.then(queue => { try { json(res, 201, queue.request(data)); } catch (error) { json(res, 400, { error: error.message }); } });
        });
      const approvalMatch = url.match(/^\/api\/approvals\/([a-f0-9-]+)\/decision$/);
      if (approvalMatch && req.method === "POST")
        return readBody(req, res, body => {
          let data; try { data = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          if (data.confirmed !== true) return json(res, 400, { error: "explicit founder confirmation is required" });
          APPROVAL_QUEUE.then(queue => { try { json(res, 200, queue.decide(approvalMatch[1], { decision: data.decision, actor: "founder-confirmed-dashboard" })); } catch (error) { json(res, 400, { error: error.message }); } });
        });
      if ((url === "/api/marketplace" || url === "/api/catalog") && req.method === "GET")
        return withLifecycleModules(res, () => {
          try {
            return json(res, 200, marketplaceSnapshot(services));
          } catch (error) {
            return json(res, 500, { error: error.message });
          }
        });
      if (url === "/api/agents/lifecycle" && req.method === "GET")
        return withLifecycleModules(res, () => {
          try {
            return json(res, 200, lifecycleSnapshot(services));
          } catch (error) {
            return json(res, 500, { error: error.message });
          }
        });
      if (url === "/api/settings/runtime" && req.method === "GET")
        return Promise.all([RUNTIME_SETTINGS_MOD, APPROVAL_QUEUE])
          .then(([, queue]) => json(res, 200, runtimeSnapshot(services, queue.audit().length)))
          .catch(() => json(res, 503, { error: "runtime settings unavailable" }));
      if (url === "/api/settings/runtime" && req.method === "PATCH")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON" }); }
          const allowed = new Set(["operationId", "logRetentionDays", "anonymousTelemetry"]);
          if (
            !validOperationId(data.operationId) ||
            Object.keys(data).some(key => !allowed.has(key))
          ) {
            return json(res, 400, { error: "unsupported runtime settings field" });
          }
          return withApproval(req, res, "settings.runtime", "runtime", () =>
            Promise.all([RUNTIME_SETTINGS_MOD, APPROVAL_QUEUE])
              .then(([, queue]) => {
                try {
                  const next = runtimeSettingsLib.applyRuntimeSettings(
                    services.loadConfig(),
                    data,
                  );
                  services.store.commit(next, data.operationId);
                  return json(res, 200, runtimeSnapshot(services, queue.audit().length));
                } catch (error) {
                  return json(res, 400, { error: error.message });
                }
              })
              .catch(() => json(res, 503, { error: "runtime settings unavailable" })),
          );
        });
      if (url === "/api/settings/restore-backup" && req.method === "POST")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON" }); }
          const allowed = new Set(["operationId", "agencyName"]);
          if (
            !validOperationId(data.operationId) ||
            Object.keys(data).some(key => !allowed.has(key))
          ) {
            return json(res, 400, { error: "operationId and agencyName are required" });
          }
          return withApproval(req, res, "settings.restore-backup", "registry", () =>
            Promise.all([RUNTIME_SETTINGS_MOD, APPROVAL_QUEUE])
              .then(([, queue]) => {
                try {
                  const current = services.loadConfig();
                  if (String(data.agencyName || "") !== String(current.agency || "REMPEYEK AGENT OS")) {
                    return json(res, 409, { error: "agency name confirmation does not match" });
                  }
                  const backupPath = `${services.configPath}.bak`;
                  if (!fs.existsSync(backupPath)) {
                    return json(res, 404, { error: "registry backup not found" });
                  }
                  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
                  if (!Array.isArray(backup.agents)) {
                    return json(res, 400, { error: "registry backup must contain an agents array" });
                  }
                  const removedAgentIds = [
                    ...new Set(
                      Array.isArray(current.removedAgentIds)
                        ? current.removedAgentIds
                        : [],
                    ),
                  ];
                  const restored = {
                    ...backup,
                    removedAgentIds,
                    agents: backup.agents.filter(
                      agent => !removedAgentIds.includes(agent.id),
                    ),
                  };
                  if (removedAgentIds.includes(restored.activeAgentId)) {
                    restored.activeAgentId = null;
                  }
                  services.store.commit(restored, data.operationId);
                  return json(res, 200, runtimeSnapshot(services, queue.audit().length));
                } catch (error) {
                  return json(res, 400, { error: error.message });
                }
              })
              .catch(() => json(res, 503, { error: "runtime settings unavailable" })),
          );
        });
      if (url === "/api/settings/clear-logs" && req.method === "POST")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON" }); }
          const allowed = new Set(["operationId", "names"]);
          if (
            !validOperationId(data.operationId) ||
            !Array.isArray(data.names) ||
            Object.keys(data).some(key => !allowed.has(key))
          ) {
            return json(res, 400, { error: "operationId and names are required" });
          }
          return withApproval(req, res, "settings.clear-logs", "owned-logs", () =>
            RUNTIME_SETTINGS_MOD
              .then(() => {
                const expected = ownedLogNames(services);
                if (JSON.stringify(data.names) !== JSON.stringify(expected)) {
                  return json(res, 409, {
                    error: "log preview changed; review the exact filenames again",
                    logFiles: expected,
                  });
                }
                try {
                  return json(res, 200, runtimeSettingsLib.clearOwnedLogs({
                    logDir: services.logDir,
                    confirmedNames: data.names,
                  }));
                } catch (error) {
                  return json(res, 400, { error: error.message });
                }
              })
              .catch(() => json(res, 503, { error: "runtime settings unavailable" })),
          );
        });
      if (url === "/api/diagnostics" && req.method === "GET")
        return Promise.all([
          RUNTIME_SETTINGS_MOD,
          MARKETPLACE_MOD,
          AGENT_LIFECYCLE_MOD,
          APPROVAL_QUEUE,
        ])
          .then(([, , , queue]) => {
            const snapshot = runtimeSnapshot(services, queue.audit().length);
            const body = runtimeSettingsLib.diagnosticsSnapshot({
              home: services.userHome,
              version: versionInfo(),
              platform: process.platform,
              paths: snapshot.paths,
              lifecycle: lifecycleSnapshot(services).agents,
              providerVariables: snapshot.providerVariables,
              recentErrors: [
                ...(configError ? [{
                  level: "error",
                  type: "config",
                  message: configError.msg,
                  at: configError.at,
                }] : []),
                ...sysLog,
              ],
            });
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Disposition": 'attachment; filename="rempeyek-diagnostics.json"',
            });
            res.end(JSON.stringify(body));
          })
          .catch(() => json(res, 503, { error: "diagnostics unavailable" }));
      const subagentMatch = url.match(
        /^\/api\/agents\/([a-z0-9][a-z0-9-]{1,63})\/subagents$/,
      );
      if (subagentMatch && req.method === "POST")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON" }); }
          const allowed = new Set([
            "operationId",
            "name",
            "domain",
            "outcome",
            "workspaceScope",
            "permissionProfile",
            "memoryPolicy",
            "activation",
            "modelProvider",
            "toolIds",
            "skillIds",
            "allowedPaths",
            "cadence",
            "eventTrigger",
            "checkpointRule",
            "instructions",
          ]);
          if (
            !validOperationId(data.operationId) ||
            Object.keys(data).some(key => !allowed.has(key))
          ) {
            return json(res, 400, {
              error: "valid operationId and supported subagent fields are required",
            });
          }
          const parentId = subagentMatch[1];
          return withApproval(req, res, "subagent.create", parentId, () =>
            SUBAGENT_RECORD_MOD
              .then(() => {
                const replay = mutationReplay(services, data.operationId);
                if (replay) return json(res, 200, replay);
                const config = services.loadConfig();
                const result = subagentLib.buildSubagentRecord(data, {
                  parent: config.agents.find(agent => agent.id === parentId),
                  existingIds: config.agents.map(agent => agent.id),
                  existingNodeNums: config.agents
                    .map(agent => Number(
                      (String(agent.node || "").match(/(\d+)$/) || [])[1],
                    ))
                    .filter(Number.isFinite),
                  now: new Date().toISOString(),
                });
                if (result.error) return json(res, 400, result);
                services.store.commit({
                  ...config,
                  agents: [...config.agents, result.agent],
                }, data.operationId);
                try {
                  scaffoldRuntimeVaultLane(result.agent, services.vaultPath);
                } catch (error) {
                  console.error("[subagent-scaffold]", error.message);
                }
                sysEvent(
                  result.agent.id,
                  "ok",
                  `subagent created under ${parentId}`,
                );
                const response = rememberMutation(services, data.operationId, {
                  operationId: data.operationId,
                  agent: result.agent,
                  event: {
                    type: "subagent.created",
                    agentId: result.agent.id,
                    parentId,
                  },
                });
                return json(res, 201, response);
              })
              .catch(error => {
                console.error("[subagent-api]", error.message);
                return json(res, 503, { error: "subagent service unavailable" });
              }),
          );
        });
      let lifecycleMatch = url.match(/^\/api\/agents\/([a-z0-9][a-z0-9-]{1,63})$/);
      if (lifecycleMatch && req.method === "PATCH")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON" }); }
          const id = lifecycleMatch[1];
          if (!validOperationId(data.operationId)) {
            return json(res, 400, { error: "valid operationId is required" });
          }
          const allowed = new Set(["operationId", "enabled", "name", "role", "note"]);
          if (Object.keys(data).some(key => !allowed.has(key))) {
            return json(res, 400, { error: "unsupported profile field" });
          }
          const type = Object.hasOwn(data, "enabled")
            ? data.enabled ? "enable" : "disable"
            : "edit";
          return withApproval(req, res, `agent.${type}`, id, () =>
            withLifecycleModules(res, () => {
              try {
                const config = services.loadConfig();
                const next = lifecycleLib.applyLifecycleChange(config, {
                  type,
                  id,
                  patch: data,
                });
                const committed = services.store.commit(next, data.operationId);
                const state = lifecycleState(services, id, committed.config);
                return json(res, 200, {
                  operationId: data.operationId,
                  state,
                  event: { type: "agent.profile_updated", agentId: id },
                  replayed: committed.replayed,
                });
              } catch (error) {
                return json(res, /not found|unknown agent/i.test(error.message) ? 404 : 400, {
                  error: error.message,
                });
              }
            }),
          );
        });
      lifecycleMatch = url.match(/^\/api\/agents\/([a-z0-9][a-z0-9-]{1,63})\/activate$/);
      if (lifecycleMatch && req.method === "POST")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON" }); }
          const id = lifecycleMatch[1];
          const allowed = new Set(["operationId"]);
          if (
            !validOperationId(data.operationId) ||
            Object.keys(data).some(key => !allowed.has(key))
          ) {
            return json(res, 400, { error: "valid operationId is required" });
          }
          return withApproval(req, res, "agent.activate", id, () =>
            withLifecycleModules(res, () => {
              try {
                const next = lifecycleLib.applyLifecycleChange(services.loadConfig(), {
                  type: "activate",
                  id,
                });
                const committed = services.store.commit(next, data.operationId);
                return json(res, 200, {
                  operationId: data.operationId,
                  state: lifecycleState(services, id, committed.config),
                  event: { type: "agent.activated", agentId: id },
                  replayed: committed.replayed,
                });
              } catch (error) {
                return json(res, /not found|unknown agent/i.test(error.message) ? 404 : 409, {
                  error: error.message,
                });
              }
            }),
          );
        });
      lifecycleMatch = url.match(/^\/api\/agents\/([a-z0-9][a-z0-9-]{1,63})\/remove$/);
      if (lifecycleMatch && req.method === "POST")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON" }); }
          const id = lifecycleMatch[1];
          const allowed = new Set(["operationId", "detachChildren"]);
          if (
            !validOperationId(data.operationId) ||
            Object.keys(data).some(key => !allowed.has(key))
          ) {
            return json(res, 400, { error: "valid operationId is required" });
          }
          return withTwoApprovals(
            req,
            res,
            { type: "agent.remove", target: id },
            { type: "agent.remove.confirm", target: id },
            () =>
            withLifecycleModules(res, () => {
              const config = services.loadConfig();
              const childIds = config.agents
                .filter(agent => agent.parentId === id)
                .map(agent => agent.id);
              if (childIds.length && data.detachChildren !== true) {
                return json(res, 409, {
                  error: "agent has child profiles",
                  childIds,
                });
              }
              try {
                const result = services.store.removeProfile(
                  config,
                  id,
                  { detachChildren: data.detachChildren === true },
                  data.operationId,
                );
                return json(res, 200, {
                  operationId: data.operationId,
                  state: lifecycleState(services, id, result.config),
                  event: { type: "agent.profile_removed", agentId: id },
                  retained: result.retained,
                  replayed: result.replayed,
                });
              } catch (error) {
                return json(res, /not found/i.test(error.message) ? 404 : 400, {
                  error: error.message,
                });
              }
            }),
          );
        });
      lifecycleMatch = url.match(/^\/api\/agents\/([a-z0-9][a-z0-9-]{1,63})\/restore$/);
      if (lifecycleMatch) {
        return json(res, 410, { error: "removed agent profiles are final and cannot be restored" });
      }
      lifecycleMatch = url.match(/^\/api\/marketplace\/([a-z0-9][a-z0-9-]{1,63})\/install$/);
      if (lifecycleMatch && req.method === "POST")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON" }); }
          const id = lifecycleMatch[1];
          const allowed = new Set(["adapterId", "operationId", "register"]);
          if (Object.keys(data).some(key => !allowed.has(key)) || !validOperationId(data.operationId)) {
            return json(res, 400, { error: "only adapterId, operationId, and register are accepted" });
          }
          return withApproval(req, res, "agent.install", id, () =>
            withLifecycleModules(res, () => {
              const entry = marketplaceLib.marketplaceEntry(id);
              if (!entry) return json(res, 404, { error: "unknown Marketplace entity" });
              try {
                const result = installMarketplace(services, entry, data);
                return json(res, result.code, result.body);
              } catch (error) {
                return json(res, error.status || 400, {
                  error: error.message,
                  ...(error.collisions ? { collisions: error.collisions } : {}),
                });
              }
            }),
          );
        });
      lifecycleMatch = url.match(/^\/api\/agents\/([a-z0-9][a-z0-9-]{1,63})\/uninstall$/);
      if (lifecycleMatch && req.method === "POST")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON" }); }
          const id = lifecycleMatch[1];
          const allowed = new Set(["operationId", "adapterId"]);
          if (
            !validOperationId(data.operationId) ||
            Object.keys(data).some(key => !allowed.has(key))
          ) {
            return json(res, 400, { error: "valid operationId is required" });
          }
          return withTwoApprovals(
            req,
            res,
            { type: "agent.uninstall", target: id },
            { type: "agent.uninstall.confirm", target: id },
            () => withLifecycleModules(res, () => {
              const entry = marketplaceLib.marketplaceEntry(id);
              if (!entry) return json(res, 404, { error: "unknown Marketplace entity" });
              const config = services.loadConfig();
              const profile = config.agents.find(agent =>
                agent.id === id || agent.gateway?.marketplaceId === id
              );
              const childIds = profile
                ? config.agents
                    .filter(agent => agent.parentId === profile.id)
                    .map(agent => agent.id)
                : [];
              if (childIds.length) {
                return json(res, 409, {
                  error: "agent has child profiles; remove or detach them before uninstall",
                  childIds,
                });
              }
              try {
                const result = uninstallMarketplace(services, entry, data);
                return json(res, result.code, result.body);
              } catch (error) {
                return json(res, error.status || 400, { error: error.message });
              }
            }),
          );
        });
      if (url === "/api/state" || url === "/api/config") {
        try {
          if (services === DEFAULT_RUNTIME_SERVICES) {
            const state = buildState();
            state.activeAgentId = loadConfig().activeAgentId || null;
            return json(res, 200, state);
          }
          const config = services.loadConfig();
          return json(res, 200, {
            vault: services.vaultPath,
            agency: config.agency || "AGENTIC//OS",
            activeAgentId: config.activeAgentId || null,
            generatedAt: new Date().toISOString(),
            agents: config.agents
              .filter(agent => agent.kind !== "subagent")
              .map(agent => ({ ...agent, gateway: undefined })),
            stats: {},
            events: [],
            review: [],
            projects: [],
            knowledge: [],
          });
        } catch (error) {
          console.error("[api/state]", error?.message || error);
          return json(res, 500, {
            error: "failed to build dashboard state",
            detail: String(error?.message || error).slice(0, 200),
          });
        }
      }
      if (url === "/api/procs") {
        const cfg = services.loadConfig();
        return json(res, 200, cfg.agents
          .filter(a => a.kind !== "subagent")
          .map(a => ({ id: a.id, name: a.name, icon: a.icon, enabled: a.enabled, note: a.note || null, cwd: a.gateway && a.gateway.cwd, bin: a.gateway && a.gateway.bin, actions: gwActions(a), ...procInfo(a.id) })));
      }
      let m = url.match(/^\/api\/proc\/([\w-]+)\/(start|stop|restart|status|run|log|terminal|stop-term)$/);
      if (m) {
        const [, id, action] = m;
        const routeAgent = services.loadConfig().agents.find(agent => agent.id === id);
        if (!routeAgent || routeAgent.kind === "subagent") {
          return json(res, 404, { error: "top-level agent not found" });
        }
        if (services !== DEFAULT_RUNTIME_SERVICES) {
          return json(res, 409, {
            error: "process control is unavailable in an isolated runtime",
          });
        }
        if (action === "log") {
          const p = procs.get(id);
          const since = Number(new URL(req.url, "http://x").searchParams.get("since") || 0);
          const native = runtimeAdapter(routeAgent, "logs");
          const respond = nativeResult => {
            const manager = processManager();
            const nativeLogs = manager?.logs(id, since, "native-logs");
            const managed = manager?.logs(id, since);
            return json(res, nativeResult?.error ? 400 : 200, {
              lines: nativeLogs?.lines?.length ? nativeLogs.lines : managed?.lines?.length ? managed.lines : p ? p.log.filter(l => l.i >= since) : [],
              next: nativeLogs?.next ?? managed?.next ?? p?.seq ?? 0,
              ...(nativeResult ? { native: nativeResult } : {}),
              ...procInfo(id),
            });
          };
          if (native?.available) return gwCtl(id, "logs", respond);
          return respond(null);
        }
        if (req.method !== "POST") return json(res, 405, { error: "POST only" });
        if (action === "status") return gwCtl(id, action, r => json(res, r.error ? 400 : 200, r));
        return withApproval(req, res, action === "terminal" ? "terminal.open" : `process.${action}`, id, () => {
        if (action === "terminal") {
          const mode = new URL(req.url, "http://x").searchParams.get("mode") || "summon";
          return gwTerminal(id, mode, r => json(res, r.error ? 400 : 200, r));
        }
        if (action === "stop-term") return gwStopTerm(id, r => json(res, r.error ? 400 : 200, r));
        if (action === "run") { const r = gwRun(id); return json(res, r.error ? 400 : 200, r); }
        if (action === "stop") return gwStop(id, r => json(res, r.error ? 400 : 200, r));
        return gwCtl(id, action, r => json(res, r.error ? 400 : 200, r)); // start | restart | status
        });
      }
      if (url === "/api/proc/start-all" && req.method === "POST") {
        return withApproval(req, res, "process.start-all", "enabled-agents", () => {
          if (services !== DEFAULT_RUNTIME_SERVICES) {
            return json(res, 409, {
              error: "process control is unavailable in an isolated runtime",
            });
          }
          const list = services.loadConfig().agents.filter(
            a => a.kind !== "subagent"
              && a.enabled
              && a.gateway
              && gwActions(a).includes("start"),
          );
          if (!list.length) return json(res, 200, {});
          const results = {};
          let pending = list.length;
          list.forEach(a => gwCtl(a.id, "start", r => { results[a.id] = r; if (--pending === 0) json(res, 200, results); }));
        });
      }
      /* Memory API endpoints */
      if (url.startsWith("/api/memory/")) {
        return buildParityGraph().then(memoryGraph => {
          if (url === "/api/memory/graph" && req.method === "GET") return json(res, 200, memoryGraph);
          if (url === "/api/memory/graph/stats" && req.method === "GET") return json(res, 200, memoryGraph.stats || {});
          if (url === "/api/memory/health" && req.method === "GET") return json(res, 200, memoryGraph.health || { status: "healthy" });
          if (url === "/api/memory/activity" && req.method === "GET") {
            const activity = (memoryGraph.nodes || []).filter(n => n.updatedAt).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 50);
            return json(res, 200, { activity });
          }
          let mId = url.match(/^\/api\/memory\/node\/(.+)$/);
          if (mId && req.method === "GET") {
            const nodeId = decodeURIComponent(mId[1]);
            const node = (memoryGraph.nodes || []).find(n => n.id === nodeId);
            if (!node) return json(res, 404, { error: "Node not found" });
            return json(res, 200, node);
          }
          mId = url.match(/^\/api\/memory\/neighborhood\/(.+)$/);
          if (mId && req.method === "GET") {
            const nodeId = decodeURIComponent(mId[1]);
            const neighbors = (memoryGraph.edges || []).filter(e => e.source === nodeId || e.target === nodeId).map(e => e.source === nodeId ? e.target : e.source);
            const nodes = (memoryGraph.nodes || []).filter(n => n.id === nodeId || neighbors.includes(n.id));
            return json(res, 200, { focusId: nodeId, nodes, edgeCount: neighbors.length });
          }
          if (url.startsWith("/api/memory/search") && req.method === "GET") {
            const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
            const q = (u.searchParams.get("q") || "").toLowerCase();
            const results = (memoryGraph.nodes || []).filter(n => (n.label || "").toLowerCase().includes(q) || (n.id || "").toLowerCase().includes(q)).slice(0, 100);
            return json(res, 200, { query: q, count: results.length, results });
          }
          return json(res, 404, { error: "Memory endpoint not found" });
        }).catch(err => json(res, 500, { error: err.message }));
      }
      if (url === "/api/graph" || url === "/api/vault/graph") return buildParityGraph().then(data => json(res, 200, data)).catch(error => json(res, 500, { error: error.message }));
      if (url === "/api/agent-topology") return buildLiveAgentTopology(services).then(data => json(res, 200, data)).catch(error => json(res, 500, { error: error.message }));
      if (url === "/api/report") return json(res, 200, buildReport());
      if (url === "/api/report/save" && req.method === "POST") return json(res, 200, saveReport());
      if (url === "/api/agents/synchronization-prompt" && req.method === "GET") {
        try {
          return json(res, 200, operationalSyncPrompt(services));
        } catch (error) {
          return json(res, 500, { error: error.message });
        }
      }
      if (url === "/api/agents/synchronization-prompt/send" && req.method === "POST")
        return readBody(req, res, body => {
          let data;
          try { data = JSON.parse(body); }
          catch { return json(res, 400, { error: "body must be JSON {operationId}" }); }
          if (
            Object.keys(data).some(key => key !== "operationId") ||
            !validOperationId(data.operationId)
          ) {
            return json(res, 400, { error: "valid operationId is required" });
          }
          try {
            return json(res, 200, sendOperationalSyncPrompt(
              services,
              data.operationId,
            ));
          } catch (error) {
            return json(res, 409, { error: error.message });
          }
        });
      if (url === "/api/workflows" && req.method === "GET") {
        const cfg = loadConfig();
        return json(res, 200, { workflows: cfg.workflows || DEFAULT_WORKFLOWS });
      }
      if (url === "/api/workflows" && req.method === "POST") {
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          const cfg = loadConfig();
          if (Array.isArray(d.workflows)) {
            cfg.workflows = d.workflows;
          } else if (d.id && d.who && d.t && d.d) {
            const list = cfg.workflows || [...DEFAULT_WORKFLOWS];
            const idx = list.findIndex(w => w.id === d.id);
            if (idx >= 0) list[idx] = { id: d.id, who: d.who, t: d.t, d: d.d };
            else list.push({ id: d.id, who: d.who, t: d.t, d: d.d });
            cfg.workflows = list;
          } else {
            return json(res, 400, { error: "invalid workflows payload" });
          }
          saveConfig(cfg);
          json(res, 200, { ok: true, workflows: cfg.workflows });
        });
      }
      if (url === "/api/task" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {agent,title,detail?}" }); }
          const r = createTask(d.agent, d.title, d.detail);
          json(res, r.error ? 400 : 200, r);
        });
      if (url === "/api/projects") return json(res, 200, buildProjects(walkVault()));
      m = url.match(/^\/api\/projects\/([\w-]+)$/);
      if (m && req.method === "GET") { const d = projectDetail(m[1]); return json(res, d.error ? 404 : 200, d); }
      if (url === "/api/project" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {name,goal?}" }); }
          const r = createProject(d);
          json(res, r.error ? 400 : 200, r);
        });
      m = url.match(/^\/api\/project\/([\w-]+)$/);
      if (m) { const d = projectDetail(m[1]); return json(res, d.error ? 404 : 200, d); }
      m = url.match(/^\/api\/project\/([\w-]+)\/decision$/);
      if (m && req.method === "POST") {
        const slug = m[1];
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {text,agent?}" }); }
          const r = addDecision(slug, d);
          json(res, r.error ? 400 : 200, r);
        });
      }
      if (url === "/api/task/done" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {source,text}" }); }
          const r = markTaskDone(d.source, d.text);
          json(res, r.error ? 400 : 200, r);
        });
      if (url === "/api/agents/add" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {catalogId} or {id,name,icon?,role?,accent?,trigger?,home?}" }); }
          return withApproval(req, res, "agents.add", "registry", () => {
            const r = addAgent(d, services);
            json(res, r.error ? 400 : 200, r);
          });
        });
      // === WORK LIFECYCLE API ===
      if (url === "/api/work/missions" && req.method === "GET") {
        const store = getWorkStore(services);
        if (respondIfModuleBlocked(res, "work-lifecycle", { loading: "work lifecycle store loading", failed: "work lifecycle store unavailable" })) return;
        const u = new URL(req.url, "http://localhost");
        const projectId = u.searchParams.get("projectId");
        return json(res, 200, { missions: store.listMissions(projectId) });
      }
      if (url === "/api/work/missions" && req.method === "POST") {
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          const store = getWorkStore(services);
          if (respondIfModuleBlocked(res, "work-lifecycle", { loading: "work lifecycle store loading", failed: "work lifecycle store unavailable" })) return;
          try {
            const m = store.saveMission(workLifecycleLib.createMission(d));
            json(res, 201, m);
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      }
      m = url.match(/^\/api\/work\/missions\/([\w-]+)$/);
      if (m && req.method === "GET") {
        const store = getWorkStore(services);
        if (respondIfModuleBlocked(res, "work-lifecycle", { loading: "work lifecycle store loading", failed: "work lifecycle store unavailable" })) return;
        const mission = store.getMission(m[1]);
        return json(res, mission ? 200 : 404, mission || { error: "mission not found" });
      }
      if (m && req.method === "PATCH") {
        const missionId = m[1];
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          const store = getWorkStore(services);
          if (respondIfModuleBlocked(res, "work-lifecycle", { loading: "work lifecycle store loading", failed: "work lifecycle store unavailable" })) return;
          const mission = store.getMission(missionId);
          if (!mission) return json(res, 404, { error: "mission not found" });
          try {
            const updated = store.saveMission(workLifecycleLib.transitionMission(mission, d.status, { reason: d.reason, actor: d.actor }));
            json(res, 200, updated);
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      }
      if (url === "/api/work/contracts" && req.method === "POST") {
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          const store = getWorkStore(services);
          if (respondIfModuleBlocked(res, "work-lifecycle", { loading: "work lifecycle store loading", failed: "work lifecycle store unavailable" })) return;
          try {
            const contract = store.saveWorkContract(workLifecycleLib.createWorkContract(d));
            json(res, 201, contract);
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      }
      if (url === "/api/work/runs" && req.method === "POST") {
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          const store = getWorkStore(services);
          if (respondIfModuleBlocked(res, "work-lifecycle", { loading: "work lifecycle store loading", failed: "work lifecycle store unavailable" })) return;
          try {
            const run = store.saveRun(workLifecycleLib.createRun(d));
            json(res, 201, run);
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      }

      // === SOCIAL PUBLISHING API ===
      if (url === "/api/social/campaigns" && req.method === "GET") {
        const store = getPublishingStore(services);
        if (respondIfModuleBlocked(res, "publishing-domain", { loading: "publishing store loading", failed: "publishing store unavailable" })) return;
        const u = new URL(req.url, "http://localhost");
        const projectId = u.searchParams.get("projectId");
        return json(res, 200, { campaigns: store.listCampaigns(projectId) });
      }
      if (url === "/api/social/campaigns" && req.method === "POST") {
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          const store = getPublishingStore(services);
          const gateway = getPublishingGateway(services);
          if (respondIfModuleBlocked(res, "publishing-domain", { loading: "publishing modules loading", failed: "publishing modules unavailable" })) return;
          if (respondIfModuleBlocked(res, "publishing-gateway", { loading: "publishing modules loading", failed: "publishing modules unavailable" })) return;
          try {
            const campaign = store.saveCampaign(publishingDomainLib.createCampaign(d));
            const variants = gateway.generateVariants(campaign);
            json(res, 201, { campaign, variants });
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      }
      m = url.match(/^\/api\/social\/campaigns\/([\w-]+)$/);
      if (m && req.method === "GET") {
        const store = getPublishingStore(services);
        if (respondIfModuleBlocked(res, "publishing-domain", { loading: "publishing store loading", failed: "publishing store unavailable" })) return;
        const campaign = store.getCampaign(m[1]);
        if (!campaign) return json(res, 404, { error: "campaign not found" });
        const variants = store.listVariantsForCampaign(m[1]);
        const jobs = store.listJobsForCampaign(m[1]);
        const receipts = jobs.map(j => store.getReceiptForJob(j.jobId)).filter(Boolean);
        return json(res, 200, { campaign, variants, jobs, receipts });
      }
      m = url.match(/^\/api\/social\/campaigns\/([\w-]+)\/schedule$/);
      if (m && req.method === "POST") {
        const campaignId = m[1];
        return readBody(req, res, async body => {
          let d = {}; try { if (body) d = JSON.parse(body); } catch {}
          const store = getPublishingStore(services);
          const scheduler = getPublishingScheduler(services);
          if (respondIfModuleBlocked(res, "publishing-domain", { loading: "publishing scheduler loading", failed: "publishing scheduler unavailable" })) return;
          if (respondIfModuleBlocked(res, "publishing-scheduler", { loading: "publishing scheduler loading", failed: "publishing scheduler unavailable" })) return;
          const campaign = store.getCampaign(campaignId);
          if (!campaign) return json(res, 404, { error: "campaign not found" });
          try {
            const result = await scheduler.scheduleCampaign(campaign, { approvalRef: d.approvalRef, scheduledFor: d.scheduledFor });
            json(res, 200, result);
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      }
      m = url.match(/^\/api\/social\/campaigns\/([\w-]+)\/publish$/);
      if (m && req.method === "POST") {
        const campaignId = m[1];
        return readBody(req, res, async body => {
          let d = {}; try { if (body) d = JSON.parse(body); } catch {}
          const store = getPublishingStore(services);
          const queue = await APPROVAL_QUEUE;
          const scheduler = getPublishingScheduler(services, queue);
          if (respondIfModuleBlocked(res, "publishing-domain", { loading: "publishing scheduler loading", failed: "publishing scheduler unavailable" })) return;
          if (respondIfModuleBlocked(res, "publishing-scheduler", { loading: "publishing scheduler loading", failed: "publishing scheduler unavailable" })) return;
          try {
            const result = await scheduler.processCampaign(campaignId, { connectorConfigs: d.connectorConfigs || {}, approvalId: d.approvalId });
            json(res, 200, result);
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      }
      m = url.match(/^\/api\/social\/campaigns\/([\w-]+)\/retry$/);
      if (m && req.method === "POST") {
        const campaignId = m[1];
        return readBody(req, res, async body => {
          let d = {}; try { if (body) d = JSON.parse(body); } catch {}
          const scheduler = getPublishingScheduler(services);
          if (respondIfModuleBlocked(res, "publishing-scheduler", { loading: "publishing scheduler loading", failed: "publishing scheduler unavailable" })) return;
          try {
            const result = await scheduler.retryFailedJobs(campaignId, { connectorConfigs: d.connectorConfigs || {} });
            json(res, 200, result);
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      }
      if (url === "/api/social/connectors" && req.method === "GET") {
        const store = getPublishingStore(services);
        if (respondIfModuleBlocked(res, "publishing-domain", { loading: "publishing store loading", failed: "publishing store unavailable" })) return;
        return json(res, 200, { connectors: store.listConnectors() });
      }
      if (url === "/api/social/connectors" && req.method === "POST") {
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          const store = getPublishingStore(services);
          if (respondIfModuleBlocked(res, "publishing-domain", { loading: "publishing store loading", failed: "publishing store unavailable" })) return;
          try {
            const conn = store.saveConnectorProfile(publishingDomainLib.createConnectorProfile(d));
            json(res, 201, conn);
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      }

      if (url === "/api/version") return json(res, 200, versionInfo());
      if (url === "/api/update" && req.method === "POST")
        return withApproval(req, res, "system.update", "dashboard", () => {
          const r = startUpdate();
          json(res, r.error ? 409 : 200, r);
        });
      if (url === "/api/schedule") return buildSchedule(r => json(res, 200, r));
      if (url.startsWith("/api/switchboard/messages") && req.method === "GET") {
        if (respondIfModuleBlocked(res, "switchboard", { loading: "switchboard module is still loading", failed: "switchboard module unavailable" })) return;
        const u = new URL(url, "http://localhost");
        const agentId = u.searchParams.get("agentId") || u.searchParams.get("to");
        let list = readSwitchboardMessages();
        if (agentId) list = list.filter(m => m.toAgentId === agentId || m.fromAgentId === agentId);
        return json(res, 200, { messages: list });
      }
      if (url === "/api/switchboard/messages" && req.method === "POST") return parseBody(req, body => {
        if (respondIfModuleBlocked(res, "switchboard", { loading: "switchboard module is still loading", failed: "switchboard module unavailable" })) return;
        const created = switchboardLib.createSwitchboardMessage(body || {});
        if (created.error) return json(res, 400, { error: created.error });
        const list = readSwitchboardMessages();
        list.push(created);
        saveSwitchboardMessages(list);
        try { writeAgentTask(created.toAgentId, `[Switchboard] ${created.fromAgentId}: ${created.message}`); } catch (_) {}
        // If target is online, deliver immediately and mark read
        try { processPendingAgentTasks(created.toAgentId); } catch (_) {}
        return json(res, 200, { ok: true, message: created });
      });
      if (url === "/api/switchboard/read" && req.method === "POST") return parseBody(req, body => {
        if (respondIfModuleBlocked(res, "switchboard", { loading: "switchboard module is still loading", failed: "switchboard module unavailable" })) return;
        const list = readSwitchboardMessages();
        const marked = switchboardLib.markSwitchboardRead(list, body || {});
        if (marked.updated) saveSwitchboardMessages(marked.messages);
        return json(res, 200, { ok: true, count: marked.messages.length, updated: marked.updated });
      });
      if (url === "/api/skills/sync" && req.method === "POST") return parseBody(req, body => {
        try {
          if (respondIfModuleBlocked(res, "managed-bundle", { loading: "modules still loading", failed: "modules unavailable" })) return;
          if (respondIfModuleBlocked(res, "marketplace-manifest", { loading: "modules still loading", failed: "modules unavailable" })) return;
          const pluginId = String(body?.pluginId || "hypertaks-agent");
          const agentId = String(body?.agentId || "").trim();
          const entry = marketplaceLib.marketplaceEntry(pluginId);
          if (!entry || (entry.kind !== "plugin" && entry.kind !== "skill")) {
            return json(res, 404, { error: `unknown plugin/skill '${pluginId}'` });
          }
          const sourceRoot = path.join(DEFAULT_RUNTIME_SERVICES.bundleRoot || RUNTIME_PATHS.bundleRoot, "hypertaks-agent");
          const userHome = os.homedir();
          // Base install into ~/.agents
          const plan = managedBundleLib.buildHypertaksCopyPlan({
            sourceRoot,
            userHome,
            kind: entry.kind === "skill" ? "skill" : "plugin",
          });
          const receipt = receiptPath(DEFAULT_RUNTIME_SERVICES, entry.id);
          let result;
          try {
            result = managedBundleLib.applyCopyPlan(plan, receipt);
          } catch (error) {
            // If already installed globally, continue to per-agent sync
            result = { ok: false, error: error.message, collisions: true };
          }
          const synced = [];
          if (agentId && switchboardLib) {
            const agent = loadConfig().agents.find(a => a.id === agentId);
            if (!agent) return json(res, 404, { error: `unknown agent '${agentId}'` });
            const skillSrc = path.join(sourceRoot, "skills", "hypertaks");
            if (fs.existsSync(skillSrc)) {
              for (const targetRoot of switchboardLib.agentSkillTargets(agent, userHome)) {
                const dest = path.join(targetRoot, "hypertaks");
                try {
                  fs.mkdirSync(targetRoot, { recursive: true });
                  fs.cpSync(skillSrc, dest, { recursive: true, force: true });
                  synced.push(dest);
                } catch (error) {
                  synced.push(`${dest} (failed: ${error.message})`);
                }
              }
            }
          }
          return json(res, 200, {
            ok: true,
            pluginId: entry.id,
            agentId: agentId || null,
            globalInstall: result?.ok === true,
            collisions: result?.collisions || null,
            synced,
          });
        } catch (error) {
          return json(res, 500, { error: error.message });
        }
      });      // R#8
      if (url === "/api/vault-health") return buildVaultHealth(r => json(res, 200, r)); // R#9
      if (url === "/api/bootstrap/status" && req.method === "GET") {
        if (!bootstrapInstance) return json(res, 503, { error: "Bootstrap module not loaded" });
        return json(res, 200, bootstrapInstance.getStatus());
      }
      if (url === "/api/bootstrap/run" && req.method === "POST") {
        if (!bootstrapInstance) return json(res, 503, { error: "Bootstrap module not loaded" });
        try { const result = bootstrapInstance.run(); return json(res, result.success ? 200 : 207, result); }
        catch (e) { return json(res, 500, { error: e.message }); }
      }
      m = url.match(/^\/api\/agent\/([\w-]+)\/detail$/);
      if (m) { const d = agentDetail(m[1], services); return json(res, d.error ? 404 : 200, d); }
      m = url.match(/^\/api\/agent\/([\w-]+)\/avatar$/);
      if (m && req.method === "POST") {
        const id = m[1];
        if (!loadConfig().agents.some(a => a.id === id)) return json(res, 404, { error: "unknown agent" });
        return readBody(req, res, body => {
          let data; try { data = JSON.parse(body).data; } catch { return json(res, 400, { error: "body must be JSON {data}" }); }
          const r = saveAvatar(id, data);
          json(res, r.error ? 400 : 200, r);
        });
      }
      if ((url === "/api/doctor/scan" || url === "/api/system-doctor") && req.method === "GET") {
        Promise.all([SYSTEM_DOCTOR_MOD, BACKUP_ENGINE_MOD, MIGRATION_ENGINE_MOD])
          .then(([{ createSystemDoctor }, { createBackupEngine }, { createMigrationEngine }]) => {
            const doctor = createSystemDoctor({
              services: DEFAULT_RUNTIME_SERVICES,
              loadConfig,
              saveConfig,
              backupEngine: createBackupEngine({ services: DEFAULT_RUNTIME_SERVICES }),
              migrationEngine: createMigrationEngine({ services: DEFAULT_RUNTIME_SERVICES }),
              processManager,
            });
            doctor.scan().then(report => json(res, 200, report)).catch(e => json(res, 500, { error: e.message }));
          }).catch(e => json(res, 500, { error: e.message }));
        return;
      }
      if (url === "/api/doctor/repair" && req.method === "POST") {
        return readBody(req, res, body => {
          let data; try { data = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {checkId, actionName}" }); }
          Promise.all([SYSTEM_DOCTOR_MOD, BACKUP_ENGINE_MOD, MIGRATION_ENGINE_MOD])
            .then(([{ createSystemDoctor }, { createBackupEngine }, { createMigrationEngine }]) => {
              const doctor = createSystemDoctor({
                services: DEFAULT_RUNTIME_SERVICES,
                loadConfig,
                saveConfig,
                backupEngine: createBackupEngine({ services: DEFAULT_RUNTIME_SERVICES }),
                migrationEngine: createMigrationEngine({ services: DEFAULT_RUNTIME_SERVICES }),
                processManager,
              });
              doctor.runRepair({ checkId: data.checkId, actionName: data.actionName })
                .then(result => json(res, result.ok ? 200 : 400, result))
                .catch(e => json(res, 500, { error: e.message }));
            }).catch(e => json(res, 500, { error: e.message }));
        });
      }
      if (url === "/api/doctor/export" && req.method === "GET") {
        Promise.all([SYSTEM_DOCTOR_MOD, BACKUP_ENGINE_MOD, MIGRATION_ENGINE_MOD])
          .then(([{ createSystemDoctor }, { createBackupEngine }, { createMigrationEngine }]) => {
            const doctor = createSystemDoctor({
              services: DEFAULT_RUNTIME_SERVICES,
              loadConfig,
              saveConfig,
              backupEngine: createBackupEngine({ services: DEFAULT_RUNTIME_SERVICES }),
              migrationEngine: createMigrationEngine({ services: DEFAULT_RUNTIME_SERVICES }),
              processManager,
            });
            doctor.scan().then(report => json(res, 200, {
              exportId: `diag_${Date.now()}`,
              exportedAt: new Date().toISOString(),
              system: {
                appVersion: APP_VERSION,
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
              },
              report,
            })).catch(e => json(res, 500, { error: e.message }));
          }).catch(e => json(res, 500, { error: e.message }));
        return;
      }
      return json(res, 404, { error: "unknown api" });
    } catch (err) { console.error("[api]", (err && err.stack) || err); return json(res, 500, { error: "internal error" }); }  // S12: don't echo internal details
  }

  // S5: path-traversal guard using path.relative (not startsWith), + URL decode
  let rel; try { rel = url === "/" ? "index.html" : decodeURIComponent(url.slice(1)); } catch { res.writeHead(400); return res.end("bad request"); }

  /* Resolve a request against a root, refusing anything that escapes it. */
  const resolve = (root, r) => {
    const file = path.normalize(path.join(root, r));
    const inside = path.relative(root, file);
    if (inside.startsWith("..") || path.isAbsolute(inside)) return null;
    try { return fs.existsSync(file) && !fs.statSync(file).isDirectory() ? file : null; } catch { return null; }
  };

  // /avatars/* is runtime-written and always served from the ignored state directory.
  let file = null;
  if (rel.startsWith("avatars/")) {
    file = resolve(AVATAR_DIR, rel.slice("avatars/".length));
  } else {
    for (const root of [DIST, PUBLIC]) { file = resolve(root, rel); if (file) break; }
  }

  // SPA fallback: unknown non-asset path → the built index.html (client-side routing)
  if (!file && !path.extname(rel)) file = resolve(DIST, "index.html");

  if (!file) {
    const hint = fs.existsSync(DIST) ? "not found" : "not built - run: npm run build";
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end(hint);
  }
  try {
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(500, { "Content-Type": "text/plain" }); res.end("error"); }
}

function createServer(runtime) {
  const services = runtime ? createRuntimeServices(runtime) : DEFAULT_RUNTIME_SERVICES;
  return http.createServer((req, res) => requestHandler(req, res, services));
}
const server = createServer();

/* R1+R3: shutdown & crash handlers - SIGINT/SIGTERM/SIGHUP + uncaughtException are not covered by
   process.on("exit") (the event loop is dead at 'exit', so async taskkill never runs). Here the loop is still alive. */
let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return; shuttingDown = true;
  console.error(`[agentic-os] shutdown (${sig}) - stopping owned processes`);
  try { processManager()?.stopAll(); } catch {}
  for (const id of procs.keys()) killOwned(id);
  try { server.close(); } catch {}
  setTimeout(() => process.exit(0), 500);   // give async taskkill time to finish
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => shutdown(sig));
process.on("uncaughtException", e => { console.error("[uncaughtException]", (e && e.stack) || e); shutdown("uncaughtException"); });
process.on("unhandledRejection", e => { console.error("[unhandledRejection]", (e && e.stack) || e); });
process.on("exit", () => {
  try { processManager()?.stopAll(); } catch {}
  for (const id of procs.keys()) killOwned(id);
});

if (require.main === module) {
  server.on("error", e => {
    if (e.code === "EADDRINUSE") { console.error(`\n  Port ${PORT} is already in use. Run on another port: set PORT=4322 then npm run dev\n`); }
    else console.error("[server]", (e && e.stack) || e);
    process.exit(1);
  });

  // Gate listen() until required HTTP modules are READY or FAILED — never announce
  // rempeyek:ready while Work/Publishing/Switchboard are still loading.
  whenHttpModulesReady().then(snapshot => {
    const failed = Object.entries(snapshot.modules)
      .filter(([, state]) => state === "failed")
      .map(([id]) => id);
    if (failed.length) console.error("[http-readiness] required or optional modules failed:", failed.join(", "));
    server.listen(PORT, process.env.DASH_HOST || "127.0.0.1", () => {
  const listeningPort = server.address().port;
  if (typeof process.send === "function") {
    process.send({ type: "rempeyek:ready", port: listeningPort });
  }
  console.log(`\n  Agentic OS running at  http://localhost:${listeningPort}`);
  console.log(`  Vault data source:     ${VAULT}`);
  console.log(`  Agent config:          ${CONFIG_PATH}`);
  console.log(TOKEN ? "  Auth: token ACTIVE (x-dash-token)" : "  Auth: no token (local only). For remote access: set DASH_TOKEN.\n");
  setTimeout(pollAllStatus, 3000);       // initial status
  setInterval(pollAllStatus, 45000);     // R4: interval (45s) > gwCtl timeout (30s) + in-flight guard
  setTimeout(pollInstalled, 1500);       // installed-state probe (where <trigger>) - drives Install/Summon UI
  setInterval(pollInstalled, 120000);    // installs change rarely → slow refresh keeps spawns cheap
  setTimeout(pollSummons, 3000);         // pick up summoned-terminal pid files from a previous run
  setInterval(pollSummons, 45000);       // keep summoned-terminal liveness fresh
  setTimeout(runDailyBridge, 10000);     // R#2: run the daily bridge once at startup
  setInterval(runDailyBridge, 3600000);  // R#2: then hourly (it existed before but was never invoked)
  setTimeout(captureMemory, 8000);       // project memory: telemetry task_done → decisions.md
  setInterval(captureMemory, 120000);    // watermarked, so re-runs never duplicate entries
    });
  });
}

module.exports = { createRuntimeServices, createServer, legacyDecisionContext, whenHttpModulesReady, httpReadiness };

/* R#2: run scripts/hermes-daily-bridge.cjs (sync telemetry + vault daily note) */
function runDailyBridge() {
  const f = path.join(ROOT, "scripts", "hermes-daily-bridge.cjs");
  if (!fs.existsSync(f)) return;
  execFile(process.execPath, [f], { windowsHide: true, env: process.env }, e => { if (e) console.error("[daily-bridge]", e.message); });
}
