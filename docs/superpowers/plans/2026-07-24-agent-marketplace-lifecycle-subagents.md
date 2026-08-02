# Agent Marketplace, Lifecycle, and Subagents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the public 20-agent Marketplace, safe install/plugin adapters, complete non-destructive agent lifecycle, Settings management, and primary-profile subagent creation without changing the existing visual design.

**Architecture:** The Node control plane remains authoritative. A reviewed typed Marketplace manifest replaces executable catalog strings, pure lifecycle/subagent modules validate state, a single atomic config store owns registry mutations, and the existing React surfaces consume redacted APIs. Installed software and registered profiles remain independent axes.

**Tech Stack:** Node.js 22, CommonJS server, ESM pure libraries, `node:test`, React 18, existing `@rempeyek/ui`, existing approval queue, filesystem-backed per-user state.

## Global Constraints

- Preserve the existing shell, navigation, cards, Agent Map, four structural themes, typography, palette, tokens, spacing, and interaction language.
- Use existing `Btn`, `Overlay`, `Panel`, `PageHead`, `SectionRow`, `Empty`, `Pill`, and existing CSS classes; add no new color, font, theme, animation, or page-layout system.
- No production code is written before its focused test exists and fails for the expected reason.
- No browser request or remote catalog may supply an executable, shell command, package, repository, URL, argument, working directory, target path, or uninstaller.
- Every process adapter uses a fixed program plus argument array and `shell: false`.
- Installed software and registered profiles are independent state axes.
- Removing a profile preserves vault lanes, telemetry, activity, workflows, logs, credentials, installed software, and user files.
- Software uninstall is a separate Settings > Agents > Advanced action requiring two consumed approvals.
- Crimson Odyssey is present in Marketplace but has no executable adapter until its repository owner mismatch is resolved.
- Hypertaks Agent is the first featured plugin and its reviewed source is pinned to commit `b45cc6b9c686c30615b971f880c532b1ed48e80b`.
- A primary-agent removal never cascades into subagent data.
- API responses and logs never return executable commands, secret values, or owner-specific absolute paths.
- Each task ends with focused tests, the full suite when it changes an integration seam, `git diff --check`, an independently reviewable commit, and the phase checkpoint required by the project.

---

## File structure

### New pure/runtime modules

- `apps/web/lib/marketplace-manifest.mjs` - reviewed agent/plugin/skill metadata and redacted public projection.
- `apps/web/lib/process-adapters.mjs` - platform-specific fixed `program + argv` resolution and probe specification.
- `apps/web/lib/managed-bundle.mjs` - collision-safe plugin/skill copy plans, SHA-256 receipts, and hash-aware removal.
- `scripts/sync-hypertaks-bundle.mjs` - maintainer-only, commit-verifying vendor sync for the reviewed public bundle.
- `marketplace/bundles/hypertaks-agent/` - public, offline-installable snapshot containing only the reviewed plugin manifest and Hypertaks skill tree.
- `apps/web/lib/config-store.cjs` - atomic registry commit, one bounded backup, tombstones, and idempotent mutation IDs.
- `apps/web/lib/agent-lifecycle.mjs` - independent state axes and allowed transitions.
- `apps/web/lib/subagent-record.mjs` - parent-bound subagent validation and record construction.

### New React components

- `apps/web/src/components/AgentManagementPanel.jsx` - Settings lifecycle controls.
- `apps/web/src/components/ConfirmAgentAction.jsx` - typed-name impact confirmation using the existing `Overlay`.
- `apps/web/src/components/SubagentModal.jsx` - existing-style subagent creation form.

### Existing files modified surgically

- `apps/web/lib/agent-catalog.mjs` - compatibility builder backed by the new manifest; remove command strings.
- `apps/web/server.js` - module wiring, adapter execution, registry routes, Marketplace projection, topology parent edges, and settings facts.
- `apps/web/src/components/CatalogGrid.jsx` - kinds/compatibility/adapter IDs without command display.
- `apps/web/src/components/AddAgentModal.jsx` - consume the redacted Marketplace contract.
- `apps/web/src/views/MarketplaceView.jsx` - existing view gains kind filters and featured ordering.
- `apps/web/src/views/SettingsView.jsx` - compose lifecycle management in the current stack.
- `apps/web/src/components/AgentDetail.jsx` - add the existing-style `+` entry point and configured subagents.
- `apps/web/src/hooks/useGateway.js` - reusable approval helper accepts a caller-provided confirmation function.
- `apps/web/lib/agent-topology.mjs` - no algorithm change; consume persisted parent relations through the existing `subagents` input.
- `apps/web/test/*.test.mjs` - focused model, store, adapter, API, and regression coverage.
- `checkpoint.md` and configured vault checkpoint notes - phase evidence.

---

## Phase and checkpoint map

- Phase A - Marketplace foundation: Tasks 1-3.
- Phase B - Lifecycle and Settings: Tasks 4-8.
- Phase C - Subagents and public closure: Tasks 9-11.

At the end of Tasks 3, 8, and 11, before the listed commit:

1. append the phase result, evidence, boundaries, and exact next task to public
   `checkpoint.md`;
2. update the canonical vault project checkpoint, same-date Codex daily note,
   and Codex brain memory under
   `$env:USERPROFILE\Rempeyek-Agent-Os\Obsidian Vault`;
3. add one small shared-memory update note under
   `$env:USERPROFILE\.codex\memories\extensions\ad_hoc\notes`;
4. refresh the current handoff under `$env:TEMP`, including branch, HEAD,
   worktree state, tests, design lock, and resume command;
5. stage only the public repository checkpoint with the phase code. Vault,
   shared-memory, and temporary handoff files stay outside the public commit.

Every checkpoint must say whether the result is implemented, merely planned, or
not yet verified. No checkpoint may claim desktop packaging, installer
mutation, or release publication unless the corresponding evidence exists.

---

### Task 1: Replace the eight-entry command catalog with a redacted typed Marketplace manifest

**Files:**

- Create: `apps/web/lib/marketplace-manifest.mjs`
- Create: `apps/web/test/marketplace-manifest.test.mjs`
- Modify: `apps/web/lib/agent-catalog.mjs`
- Modify: `apps/web/test/agent-catalog.test.mjs`

**Interfaces:**

- Produces: `MARKETPLACE_ENTRIES`, `marketplaceEntry(id)`, `validateMarketplace(entries)`, `publicMarketplaceEntry(entry, state)`, and `agentSeed(entry)`.
- Compatibility: `agent-catalog.mjs` keeps `catalogEntry` and `buildAgentRecord`; `catalogInstallCommand` is removed in Task 2.
- Public entries expose `adapterIds` and `officialUrl`, never installer specifications.

- [ ] **Step 1: Write the failing manifest contract tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETPLACE_ENTRIES,
  marketplaceEntry,
  publicMarketplaceEntry,
  validateMarketplace,
} from "../lib/marketplace-manifest.mjs";

const AGENT_IDS = [
  "claude-code", "codex", "kilo-code", "cline", "pi", "antigravity",
  "hermes", "openclaw", "gemini-cli", "github-copilot-cli", "opencode",
  "aider", "goose", "openhands", "qwen-code", "kimi-code",
  "mistral-vibe", "cursor-agent", "crush", "crimson-odyssey",
];

test("launch manifest contains the exact curated 20 agents", () => {
  assert.deepEqual(
    MARKETPLACE_ENTRIES.filter(entry => entry.kind === "agent").map(entry => entry.id),
    AGENT_IDS,
  );
  assert.deepEqual(validateMarketplace(MARKETPLACE_ENTRIES), { ok: true, errors: [] });
});

test("Hypertaks is featured and exposes one public skill child", () => {
  const plugin = marketplaceEntry("hypertaks-agent");
  assert.equal(plugin.kind, "plugin");
  assert.equal(plugin.featured, true);
  assert.equal(plugin.sourceRef, "b45cc6b9c686c30615b971f880c532b1ed48e80b");
  assert.deepEqual(plugin.children, ["hypertaks-founder"]);
  assert.equal(marketplaceEntry("hypertaks-founder").kind, "skill");
});

test("Crimson Odyssey is visible but cannot execute an installer", () => {
  const entry = marketplaceEntry("crimson-odyssey");
  assert.equal(entry.sourceUrl, "https://github.com/Crimson-Rift-Studio/crimson-odyssey");
  assert.deepEqual(entry.installers, []);
  assert.match(entry.availabilityNote, /canonical install owner/i);
});

test("public projection hides adapters unsupported on the active platform", () => {
  assert.deepEqual(
    publicMarketplaceEntry(marketplaceEntry("cline"), { platform: "win32" }).adapterIds,
    [],
  );
  assert.deepEqual(
    publicMarketplaceEntry(marketplaceEntry("cline"), { platform: "darwin" }).adapterIds,
    ["npm"],
  );
});

test("public Marketplace projection strips executable adapter details", () => {
  const projected = publicMarketplaceEntry(marketplaceEntry("codex"), {
    registered: false,
    installed: true,
  });
  assert.deepEqual(projected.adapterIds, ["npm"]);
  assert.equal(projected.installed, true);
  assert.equal(projected.registered, false);
  for (const forbidden of ["program", "args", "package", "packageId", "sourceRef"]) {
    assert.equal(Object.hasOwn(projected, forbidden), false);
    assert.equal(JSON.stringify(projected).includes(`"${forbidden}"`), false);
  }
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```powershell
node --test apps/web/test/marketplace-manifest.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `marketplace-manifest.mjs`.

- [ ] **Step 3: Implement the reviewed manifest and public projection**

Use this exact seed data. `external-link` is display/instruction metadata and is
never returned as an executable adapter:

```js
const agent = (id, name, icon, role, trigger, home, sourceUrl, installers = [], extra = {}) => ({
  schemaVersion: 1,
  id,
  kind: "agent",
  name,
  publisher: extra.publisher || new URL(sourceUrl).hostname,
  summary: role,
  sourceUrl,
  officialUrl: extra.officialUrl || sourceUrl,
  curatedAt: "2026-07-24",
  compatibility: { platforms: extra.platforms || ["win32", "darwin", "linux"], hosts: [] },
  capabilities: extra.capabilities || ["local-agent"],
  agent: { icon, role, trigger, home, envAllow: extra.envAllow || [] },
  installers,
  uninstallers: extra.uninstallers || [],
  featured: false,
  children: [],
  availabilityNote: extra.availabilityNote || "",
});

export const MARKETPLACE_ENTRIES = Object.freeze([
  agent("claude-code", "Claude Code", "⚫", "Coding & technical specialist", "claude", ".claude",
    "https://github.com/anthropics/claude-code",
    [{ id: "npm", type: "npm-global", package: "@anthropic-ai/claude-code" }],
    { envAllow: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] }),
  agent("codex", "OpenAI Codex", "⬜", "Repository-aware software engineering agent", "codex", ".codex",
    "https://github.com/openai/codex",
    [{ id: "npm", type: "npm-global", package: "@openai/codex" }],
    { envAllow: ["OPENAI_API_KEY"] }),
  agent("kilo-code", "Kilo Code", "🟣", "Development agent for coding and debugging", "kilo", ".kilocode",
    "https://github.com/Kilo-Org/kilocode",
    [{ id: "npm", type: "npm-global", package: "@kilocode/cli" }]),
  agent("cline", "Cline", "🟡", "Autonomous coding agent", "cline", ".cline",
    "https://github.com/cline/cline",
    [{ id: "npm", type: "npm-global", package: "cline", platforms: ["linux", "darwin"] }],
    { availabilityNote: "Cline CLI currently marks Windows support as coming soon; Windows users receive the official page instead of a one-click adapter." }),
  agent("pi", "Pi", "🌀", "Minimal open-source coding agent", "pi", ".pi",
    "https://github.com/badlogic/pi-mono",
    [{ id: "npm", type: "npm-global", package: "@mariozechner/pi-coding-agent" }]),
  agent("antigravity", "Antigravity", "🟠", "Advanced agentic coding and integration", "agy", ".gemini",
    "https://antigravity.google", [],
    { envAllow: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], platforms: ["win32"] }),
  agent("hermes", "Hermes", "🟢", "Crypto, research, and operations agent", "hermes", ".hermes",
    "https://github.com/aabrur/Rempeyek-Agent-OS"),
  agent("openclaw", "OpenClaw", "🔵", "Strategy and business analysis agent", "openclaw", ".openclaw",
    "https://github.com/aabrur/Rempeyek-Agent-OS"),
  agent("gemini-cli", "Gemini CLI", "💎", "Google terminal coding agent", "gemini", ".gemini",
    "https://github.com/google-gemini/gemini-cli",
    [{ id: "npm", type: "npm-global", package: "@google/gemini-cli" }],
    { envAllow: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] }),
  agent("github-copilot-cli", "GitHub Copilot CLI", "◉", "GitHub terminal coding agent", "copilot", ".copilot",
    "https://github.com/github/copilot-cli",
    [{ id: "npm", type: "npm-global", package: "@github/copilot@prerelease" }]),
  agent("opencode", "OpenCode", "⌘", "Provider-agnostic terminal coding agent", "opencode", ".config/opencode",
    "https://github.com/anomalyco/opencode",
    [{ id: "npm", type: "npm-global", package: "opencode-ai" }]),
  agent("aider", "Aider", "A", "AI pair programming in the terminal", "aider", ".aider",
    "https://github.com/Aider-AI/aider"),
  agent("goose", "Goose", "G", "Open-source local agent for code and workflows", "goose", ".config/goose",
    "https://github.com/aaif-goose/goose"),
  agent("openhands", "OpenHands", "🙌", "AI-driven software development agent", "openhands", ".openhands",
    "https://github.com/OpenHands/OpenHands"),
  agent("qwen-code", "Qwen Code", "Q", "Open-source Qwen terminal coding agent", "qwen", ".qwen",
    "https://github.com/QwenLM/qwen-code",
    [{ id: "npm", type: "npm-global", package: "@qwen-code/qwen-code@latest" }]),
  agent("kimi-code", "Kimi Code", "K", "Moonshot terminal AI agent", "kimi", ".kimi",
    "https://github.com/MoonshotAI/kimi-cli"),
  agent("mistral-vibe", "Mistral Vibe", "M", "Mistral terminal coding agent", "vibe", ".vibe",
    "https://github.com/mistralai/mistral-vibe",
    [{ id: "uv", type: "python-tool", package: "mistral-vibe" }]),
  agent("cursor-agent", "Cursor Agent", "C", "Cursor terminal AI agent", "cursor-agent", ".cursor",
    "https://docs.cursor.com/en/cli/overview"),
  agent("crush", "Crush", "💘", "Charm terminal coding agent", "crush", ".config/crush",
    "https://github.com/charmbracelet/crush",
    [
      { id: "npm", type: "npm-global", package: "@charmland/crush" },
      { id: "winget", type: "winget", packageId: "charmbracelet.crush", platforms: ["win32"] },
    ]),
  agent("crimson-odyssey", "Crimson Odyssey", "🔺", "Crimson Rift Studio agent platform", "crimson", ".crimson",
    "https://github.com/Crimson-Rift-Studio/crimson-odyssey", [],
    { availabilityNote: "One-click install is disabled until the public README and repository agree on the canonical install owner." }),
  {
    schemaVersion: 1,
    id: "hypertaks-agent",
    kind: "plugin",
    name: "Hypertaks Agent",
    publisher: "aabrur",
    summary: "Founder operating system with contract-bound execution.",
    sourceUrl: "https://github.com/aabrur/hypertaks-agent",
    officialUrl: "https://github.com/aabrur/hypertaks-agent",
    sourceRef: "b45cc6b9c686c30615b971f880c532b1ed48e80b",
    curatedAt: "2026-07-24",
    compatibility: {
      platforms: ["win32", "darwin", "linux"],
      hosts: ["claude-code", "codex", "cursor-agent", "kimi-code", "openclaw", "hermes", "opencode", "pi"],
    },
    capabilities: ["plugin", "agent-skill"],
    installers: [{ id: "agents-standard", type: "plugin-copy", target: "agents-standard" }],
    uninstallers: [{ id: "agents-standard", type: "plugin-copy", target: "agents-standard" }],
    featured: true,
    children: ["hypertaks-founder"],
    availabilityNote: "",
  },
  {
    schemaVersion: 1,
    id: "hypertaks-founder",
    kind: "skill",
    name: "Hypertaks Founder",
    publisher: "aabrur",
    summary: "The public Hypertaks founder skill.",
    sourceUrl: "https://github.com/aabrur/hypertaks-agent/tree/main/skills/hypertaks",
    officialUrl: "https://github.com/aabrur/hypertaks-agent/tree/main/skills/hypertaks",
    sourceRef: "b45cc6b9c686c30615b971f880c532b1ed48e80b",
    curatedAt: "2026-07-24",
    compatibility: { platforms: ["win32", "darwin", "linux"], hosts: ["agents-standard"] },
    capabilities: ["agent-skill"],
    installers: [{ id: "agents-standard", type: "skill-copy", target: "agents-standard" }],
    uninstallers: [{ id: "agents-standard", type: "skill-copy", target: "agents-standard" }],
    featured: false,
    children: [],
    availabilityNote: "",
  },
]);

const BY_ID = new Map(MARKETPLACE_ENTRIES.map(entry => [entry.id, entry]));

export function marketplaceEntry(id) {
  return BY_ID.get(String(id || "")) || null;
}

export function validateMarketplace(entries = MARKETPLACE_ENTRIES) {
  const errors = [];
  const ids = new Set();
  for (const entry of entries) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(entry.id || ""))) errors.push(`${entry.id}: invalid id`);
    if (ids.has(entry.id)) errors.push(`${entry.id}: duplicate id`);
    ids.add(entry.id);
    if (!["agent", "plugin", "skill"].includes(entry.kind)) errors.push(`${entry.id}: invalid kind`);
    if (!entry.name || !entry.sourceUrl || entry.schemaVersion !== 1) errors.push(`${entry.id}: incomplete metadata`);
  }
  return { ok: errors.length === 0, errors };
}

export function publicMarketplaceEntry(entry, state = {}) {
  const adapters = entry.installers.filter(installer =>
    !state.platform || !installer.platforms || installer.platforms.includes(state.platform),
  );
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    publisher: entry.publisher,
    summary: entry.summary,
    officialUrl: entry.officialUrl,
    featured: entry.featured,
    compatibility: entry.compatibility,
    capabilities: entry.capabilities,
    children: entry.children,
    availabilityNote: entry.availabilityNote,
    adapterIds: adapters.map(installer => installer.id),
    registered: Boolean(state.registered),
    installed: state.installed ?? null,
  };
}

export function agentSeed(entry) {
  return entry?.kind === "agent" ? { id: entry.id, name: entry.name, ...entry.agent } : null;
}
```

In `agent-catalog.mjs`, import the manifest, derive `AGENT_CATALOG` from the
20 agent entries, keep the existing `buildAgentRecord` validation, and replace
its copied `gateway.install` field with `gateway.marketplaceId = entry.id`.

- [ ] **Step 4: Run focused and compatibility tests**

Run:

```powershell
node --test apps/web/test/marketplace-manifest.test.mjs apps/web/test/agent-catalog.test.mjs
```

Expected: all tests PASS; the compatibility test expects 20 agents and no
`gateway.install.cmd`.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/lib/marketplace-manifest.mjs apps/web/lib/agent-catalog.mjs apps/web/test/marketplace-manifest.test.mjs apps/web/test/agent-catalog.test.mjs
git commit -m "feat: add typed public marketplace manifest"
```

---

### Task 2: Replace shell installers with fixed process adapters

**Files:**

- Create: `apps/web/lib/process-adapters.mjs`
- Create: `apps/web/test/process-adapters.test.mjs`
- Modify: `apps/web/lib/agent-catalog.mjs`
- Modify: `apps/web/server.js:965-1034`

**Interfaces:**

- Consumes: `marketplaceEntry(id).installers`.
- Produces: `resolveAdapter({ entry, adapterId, action, platform })`,
  `resolveProbe({ entry, platform })`, and
  `startResolvedProcess(spec, options)`.
- `ResolvedProcessSpec` is `{ program, args, display, probe }`; it never contains
  a shell string.

- [ ] **Step 1: Write failing adapter tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceEntry } from "../lib/marketplace-manifest.mjs";
import { resolveAdapter, resolveProbe } from "../lib/process-adapters.mjs";

test("npm adapter resolves fixed Windows program and argv", () => {
  assert.deepEqual(
    resolveAdapter({ entry: marketplaceEntry("codex"), adapterId: "npm", action: "install", platform: "win32" }),
    {
      program: "npm.cmd",
      args: ["install", "--global", "@openai/codex"],
      display: "npm install --global @openai/codex",
      probe: { program: "where.exe", args: ["codex"] },
    },
  );
});

test("npm uninstall is typed and not available for link-only agents", () => {
  assert.deepEqual(
    resolveAdapter({ entry: marketplaceEntry("codex"), adapterId: "npm", action: "uninstall", platform: "linux" }),
    {
      program: "npm",
      args: ["uninstall", "--global", "@openai/codex"],
      display: "npm uninstall --global @openai/codex",
      probe: { program: "which", args: ["codex"] },
    },
  );
  assert.equal(resolveAdapter({ entry: marketplaceEntry("aider"), adapterId: "npm", action: "install", platform: "win32" }), null);
  assert.equal(resolveAdapter({ entry: marketplaceEntry("crimson-odyssey"), adapterId: "npm", action: "install", platform: "win32" }), null);
});

test("winget and uv adapters use fixed identifiers", () => {
  assert.equal(resolveAdapter({ entry: marketplaceEntry("crush"), adapterId: "winget", action: "install", platform: "win32" }).program, "winget.exe");
  assert.deepEqual(
    resolveAdapter({ entry: marketplaceEntry("mistral-vibe"), adapterId: "uv", action: "install", platform: "win32" }).args,
    ["tool", "install", "mistral-vibe"],
  );
});

test("platform-limited adapters become official-link only instead of failing", () => {
  assert.equal(
    resolveAdapter({ entry: marketplaceEntry("cline"), adapterId: "npm", action: "install", platform: "win32" }),
    null,
  );
  assert.equal(
    resolveAdapter({ entry: marketplaceEntry("cline"), adapterId: "npm", action: "install", platform: "darwin" }).program,
    "npm",
  );
});

test("probes contain a fixed program and argument array", () => {
  assert.deepEqual(resolveProbe({ entry: marketplaceEntry("gemini-cli"), platform: "win32" }), {
    program: "where.exe",
    args: ["gemini"],
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test apps/web/test/process-adapters.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement minimal adapter resolution**

```js
const executable = (platform, windows, other) => platform === "win32" ? windows : other;

export function resolveProbe({ entry, platform = process.platform } = {}) {
  const trigger = entry?.agent?.trigger;
  if (!trigger) return null;
  return platform === "win32"
    ? { program: "where.exe", args: [trigger] }
    : { program: "which", args: [trigger] };
}

export function resolveAdapter({ entry, adapterId, action, platform = process.platform } = {}) {
  if (!entry || !["install", "uninstall"].includes(action)) return null;
  const source = action === "install" ? entry.installers : entry.uninstallers;
  const adapter = (source || entry.installers || []).find(item => item.id === adapterId);
  if (!adapter || (adapter.platforms && !adapter.platforms.includes(platform))) return null;
  const probe = resolveProbe({ entry, platform });
  if (adapter.type === "npm-global") {
    const verb = action === "install" ? "install" : "uninstall";
    const program = executable(platform, "npm.cmd", "npm");
    const args = [verb, "--global", adapter.package];
    return { program, args, display: `${program.replace(/\.cmd$/, "")} ${args.join(" ")}`, probe };
  }
  if (adapter.type === "winget" && platform === "win32") {
    const args = action === "install"
      ? ["install", "--exact", "--id", adapter.packageId, "--accept-package-agreements", "--accept-source-agreements"]
      : ["uninstall", "--exact", "--id", adapter.packageId];
    return { program: "winget.exe", args, display: `winget ${args.join(" ")}`, probe };
  }
  if (adapter.type === "python-tool") {
    const verb = action === "install" ? "install" : "uninstall";
    const program = executable(platform, "uv.exe", "uv");
    const args = ["tool", verb, adapter.package];
    return { program, args, display: `${program.replace(/\.exe$/, "")} ${args.join(" ")}`, probe };
  }
  return null;
}

export function startResolvedProcess(spec, { spawnImpl, cwd, env } = {}) {
  if (!spec || !spec.program || !Array.isArray(spec.args)) throw new Error("resolved process spec is required");
  if (typeof spawnImpl !== "function") throw new Error("spawnImpl is required");
  return spawnImpl(spec.program, spec.args, {
    cwd,
    env,
    shell: false,
    windowsHide: true,
  });
}
```

Add uninstall metadata automatically for `npm-global`, `winget`, and
`python-tool` entries during manifest construction so the package identifier is
defined once. Delete `catalogInstallCommand`.

Replace `spawn(cmd, [], { shell: true })` in `installAgent` with the resolved
spec and `startResolvedProcess`. Log `spec.display`, but do not return it through
the API. Replace catalog probing with:

```js
spawnSync(probe.program, probe.args, {
  shell: false,
  windowsHide: true,
  encoding: "utf8",
  timeout: 5_000,
});
```

- [ ] **Step 4: Verify no shell execution remains in the agent install path**

Run:

```powershell
node --test apps/web/test/process-adapters.test.mjs apps/web/test/agent-catalog.test.mjs
rg -n "installAgent|shell: true|catalogInstallCommand" apps/web/server.js apps/web/lib
```

Expected: tests PASS; `installAgent` contains no `shell: true`; no
`catalogInstallCommand` symbol remains. The source-checkout updater is removed
from `shell: true` in the desktop plan, not hidden by this check.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/lib/process-adapters.mjs apps/web/lib/agent-catalog.mjs apps/web/server.js apps/web/test/process-adapters.test.mjs apps/web/test/agent-catalog.test.mjs
git commit -m "refactor: execute catalog installers without a shell"
```

---

### Task 3: Implement hash-aware Hypertaks plugin and skill installation

**Files:**

- Create: `apps/web/lib/managed-bundle.mjs`
- Create: `apps/web/test/managed-bundle.test.mjs`
- Create: `scripts/sync-hypertaks-bundle.mjs`
- Create: `marketplace/bundles/hypertaks-agent/bundle.manifest.json`
- Create: `marketplace/bundles/hypertaks-agent/.agents/plugins/hypertaks.json`
- Create: `marketplace/bundles/hypertaks-agent/skills/hypertaks/**`
- Modify: `apps/web/lib/runtime-paths.cjs`
- Modify: `apps/web/test/runtime-paths.test.mjs`

**Interfaces:**

- Produces: `buildHypertaksCopyPlan({ sourceRoot, userHome, kind })`,
  `inspectCopyPlan(plan)`, `applyCopyPlan(plan, receiptPath)`, and
  `removeManagedFiles(receiptPath)`.
- Receipt shape: `{ schemaVersion: 1, entityId, sourceUrl, sourceRef, installedAt, files: [{ path, sha256 }] }`.
- Managed standard target is `%USERPROFILE%\.agents`; no other host path is guessed.
- Runtime source is the committed `marketplace/bundles/hypertaks-agent`
  snapshot, never a developer checkout or a mutable network response.
- Bundle provenance pins commit
  `b45cc6b9c686c30615b971f880c532b1ed48e80b` and records the SHA-256 of
  every committed file.

- [ ] **Step 1: Write failing filesystem tests with a temporary fixture**

```js
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyCopyPlan,
  buildHypertaksCopyPlan,
  inspectCopyPlan,
  removeManagedFiles,
} from "../lib/managed-bundle.mjs";

const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

test("Hypertaks plan targets only the managed .agents plugin and skill paths", () => {
  const plan = buildHypertaksCopyPlan({
    sourceRoot: "C:\\cache\\hypertaks",
    userHome: "C:\\Users\\test",
    kind: "plugin",
  });
  assert.deepEqual(plan.map(item => item.to.replaceAll("\\", "/")), [
    "C:/Users/test/.agents/plugins/hypertaks.json",
    "C:/Users/test/.agents/skills/hypertaks",
  ]);
});

test("committed bundle matches its pinned source ref and every recorded hash", () => {
  const root = path.resolve("marketplace/bundles/hypertaks-agent");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "bundle.manifest.json"), "utf8"));
  assert.equal(manifest.sourceRef, "b45cc6b9c686c30615b971f880c532b1ed48e80b");
  assert.deepEqual(manifest.roots, [
    ".agents/plugins/hypertaks.json",
    "skills/hypertaks",
  ]);
  const actual = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name !== "bundle.manifest.json") {
        actual.push(path.relative(root, absolute).replaceAll("\\", "/"));
      }
    }
  };
  walk(root);
  assert.deepEqual(actual.sort(), manifest.files.map(file => file.path).sort());
  for (const file of manifest.files) {
    const absolute = path.resolve(root, file.path);
    assert.equal(absolute.startsWith(path.resolve(root) + path.sep), true);
    assert.equal(hash(absolute), file.sha256);
  }
});

test("install refuses collisions and uninstall preserves user edits", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-bundle-"));
  const source = path.join(root, "source");
  const home = path.join(root, "home");
  const receipt = path.join(root, "receipt.json");
  fs.mkdirSync(path.join(source, ".agents", "plugins"), { recursive: true });
  fs.mkdirSync(path.join(source, "skills", "hypertaks"), { recursive: true });
  fs.writeFileSync(path.join(source, ".agents", "plugins", "hypertaks.json"), "{\"name\":\"hypertaks\"}\n");
  fs.writeFileSync(path.join(source, "skills", "hypertaks", "SKILL.md"), "# Hypertaks\n");
  const plan = buildHypertaksCopyPlan({ sourceRoot: source, userHome: home, kind: "plugin" });
  assert.deepEqual(inspectCopyPlan(plan).collisions, []);
  applyCopyPlan(plan, receipt);
  const skill = path.join(home, ".agents", "skills", "hypertaks", "SKILL.md");
  fs.appendFileSync(skill, "\nuser edit\n");
  const removed = removeManagedFiles(receipt);
  assert.deepEqual(removed.preserved, [skill]);
  assert.equal(fs.existsSync(path.join(home, ".agents", "plugins", "hypertaks.json")), false);
  assert.equal(fs.existsSync(skill), true);
  fs.rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test apps/web/test/managed-bundle.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement containment, hashing, copy, receipt, and safe removal**

First create `scripts/sync-hypertaks-bundle.mjs`. It accepts exactly one
positional source-checkout path, runs `git rev-parse HEAD` with `execFile`,
requires the pinned commit, rejects symlinks, empties only the exact destination
`marketplace/bundles/hypertaks-agent` after proving it is contained by the
repository root, copies only:

```text
.agents/plugins/hypertaks.json
skills/hypertaks/**
```

It then writes sorted forward-slash paths and SHA-256 values to
`bundle.manifest.json`. It refuses extra arguments, dirty source files within
those two roots, missing files, path escapes, and a source ref mismatch. Prepare
the reviewed bundle from the canonical repository:

```powershell
$sourceCheckout = Join-Path ([System.IO.Path]::GetTempPath()) ("hypertaks-" + [guid]::NewGuid().ToString("N"))
git clone --filter=blob:none https://github.com/aabrur/hypertaks-agent.git $sourceCheckout
git -C $sourceCheckout checkout --detach b45cc6b9c686c30615b971f880c532b1ed48e80b
node scripts/sync-hypertaks-bundle.mjs $sourceCheckout
```

Expected: `synced 35 files from
b45cc6b9c686c30615b971f880c532b1ed48e80b`; no files outside the exact bundle
destination change. For any clean public machine, the equivalent reproducible
input is a detached checkout of
`https://github.com/aabrur/hypertaks-agent.git` at that exact commit.

Then implement the runtime copy boundary:

```js
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const inside = (root, candidate) => {
  const rel = path.relative(root, candidate);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};

function filesUnder(root) {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("managed bundle may not contain symbolic links");
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else out.push(absolute);
    }
  };
  walk(root);
  return out;
}

export function buildHypertaksCopyPlan({ sourceRoot, userHome, kind }) {
  const targetRoot = path.join(userHome, ".agents");
  const pairs = kind === "skill"
    ? [[path.join(sourceRoot, "skills", "hypertaks"), path.join(targetRoot, "skills", "hypertaks")]]
    : [
        [path.join(sourceRoot, ".agents", "plugins", "hypertaks.json"), path.join(targetRoot, "plugins", "hypertaks.json")],
        [path.join(sourceRoot, "skills", "hypertaks"), path.join(targetRoot, "skills", "hypertaks")],
      ];
  return pairs.map(([from, to]) => ({ from, to, sourceRoot, targetRoot }));
}

export function inspectCopyPlan(plan) {
  const collisions = [];
  for (const item of plan) {
    if (!inside(item.sourceRoot, item.from) || !inside(item.targetRoot, item.to)) throw new Error("bundle path escapes its root");
    if (!fs.existsSync(item.from)) throw new Error(`missing reviewed source: ${item.from}`);
    if (fs.existsSync(item.to)) collisions.push(item.to);
  }
  return { collisions };
}

export function applyCopyPlan(plan, receiptPath) {
  const check = inspectCopyPlan(plan);
  if (check.collisions.length) return { ok: false, collisions: check.collisions };
  const files = [];
  for (const item of plan) {
    const sourceFiles = fs.statSync(item.from).isDirectory() ? filesUnder(item.from) : [item.from];
    for (const source of sourceFiles) {
      const relative = fs.statSync(item.from).isDirectory() ? path.relative(item.from, source) : "";
      const target = relative ? path.join(item.to, relative) : item.to;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      files.push({ path: target, sha256: hash(target) });
    }
  }
  const receipt = {
    schemaVersion: 1,
    entityId: "hypertaks-agent",
    sourceUrl: "https://github.com/aabrur/hypertaks-agent",
    sourceRef: "b45cc6b9c686c30615b971f880c532b1ed48e80b",
    installedAt: new Date().toISOString(),
    files,
  };
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  return { ok: true, receipt };
}

export function removeManagedFiles(receiptPath) {
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const removed = [];
  const preserved = [];
  for (const file of receipt.files) {
    if (!fs.existsSync(file.path)) continue;
    if (hash(file.path) !== file.sha256) {
      preserved.push(file.path);
      continue;
    }
    fs.unlinkSync(file.path);
    removed.push(file.path);
  }
  return { removed, preserved };
}
```

Extend `resolveRuntimePaths` with `receiptDir` and `installCacheDir`, both under
`stateRoot`, plus read-only `bundleRoot` resolved from
`path.resolve(__dirname, "..", "..", "marketplace", "bundles")`. Tests must
prove the writable paths never enter the source checkout and `bundleRoot`
resolves identically from source and packaged `app-root` layouts.

- [ ] **Step 4: Run focused tests**

```powershell
node --test apps/web/test/managed-bundle.test.mjs apps/web/test/runtime-paths.test.mjs
npm run audit:public
```

Expected: sync is idempotent, all tests PASS, every bundle file matches the
committed manifest, and the public audit finds no secret or owner-local path.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/lib/managed-bundle.mjs apps/web/lib/runtime-paths.cjs apps/web/test/managed-bundle.test.mjs apps/web/test/runtime-paths.test.mjs scripts/sync-hypertaks-bundle.mjs marketplace/bundles/hypertaks-agent
git commit -m "feat: add safe managed plugin receipts"
```

---

### Task 4: Add the atomic config store, lifecycle axes, and tombstones

**Files:**

- Create: `apps/web/lib/config-store.cjs`
- Create: `apps/web/lib/agent-lifecycle.mjs`
- Create: `apps/web/test/config-store.test.mjs`
- Create: `apps/web/test/agent-lifecycle.test.mjs`
- Modify: `apps/web/lib/runtime-paths.cjs`
- Modify: `apps/web/test/runtime-paths.test.mjs`

**Interfaces:**

- Produces: `createConfigStore({ configPath, tombstoneDir, fsImpl, now, randomId, onCommit })`.
- Store methods: `commit(nextConfig, operationId)`, `removeProfile(config, id, options, operationId)`,
  `restoreProfile(config, tombstoneId, operationId)`, and `listTombstones()`.
- Produces: `deriveLifecycle({ entry, agent, installed, activeAgentId })` and
  `applyLifecycleChange(config, command)`.

- [ ] **Step 1: Write failing config transaction tests**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConfigStore } = require("../lib/config-store.cjs");

test("commit writes valid JSON atomically, keeps one backup, and is idempotent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-store-"));
  const configPath = path.join(root, "agents.config.json");
  fs.writeFileSync(configPath, JSON.stringify({ agency: "R", agents: [] }));
  const store = createConfigStore({
    configPath,
    tombstoneDir: path.join(root, "tombstones"),
    randomId: () => "fixed",
    now: () => new Date("2026-07-24T00:00:00.000Z"),
  });
  const next = { agency: "R", activeAgentId: "codex", agents: [{ id: "codex", enabled: true }] };
  assert.equal(store.commit(next, "op-1").replayed, false);
  assert.equal(store.commit(next, "op-1").replayed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), next);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${configPath}.bak`, "utf8")), { agency: "R", agents: [] });
  fs.rmSync(root, { recursive: true, force: true });
});

test("profile removal preserves data references and writes a secret-free tombstone", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-remove-"));
  const configPath = path.join(root, "agents.config.json");
  const agent = {
    id: "codex",
    name: "Codex",
    enabled: true,
    lane: "Codex",
    gateway: { trigger: "codex", envAllow: ["OPENAI_API_KEY"] },
  };
  const config = { agency: "R", activeAgentId: "codex", agents: [agent] };
  fs.writeFileSync(configPath, JSON.stringify(config));
  const store = createConfigStore({
    configPath,
    tombstoneDir: path.join(root, "tombstones"),
    randomId: () => "tomb-1",
    now: () => new Date("2026-07-24T00:00:00.000Z"),
  });
  const result = store.removeProfile(config, "codex", { detachChildren: false }, "op-remove");
  assert.equal(result.config.activeAgentId, null);
  assert.deepEqual(result.config.agents, []);
  assert.deepEqual(result.retained, ["vault", "telemetry", "activity", "workflows", "logs", "credentials", "software", "user-files"]);
  assert.equal(JSON.stringify(result.tombstone).includes("OPENAI_API_KEY"), true);
  assert.equal(JSON.stringify(result.tombstone).match(/sk-|token|secret/i), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test("restore refuses an occupied id", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-restore-"));
  const configPath = path.join(root, "agents.config.json");
  fs.writeFileSync(configPath, JSON.stringify({ agency: "R", agents: [{ id: "codex" }] }));
  fs.mkdirSync(path.join(root, "tombstones"));
  fs.writeFileSync(path.join(root, "tombstones", "tomb-1.json"), JSON.stringify({
    id: "tomb-1",
    agent: { id: "codex", name: "Codex" },
  }));
  const store = createConfigStore({ configPath, tombstoneDir: path.join(root, "tombstones") });
  assert.throws(() => store.restoreProfile(JSON.parse(fs.readFileSync(configPath)), "tomb-1", "op-restore"), /already registered/);
  fs.rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Write failing lifecycle-axis tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { applyLifecycleChange, deriveLifecycle } from "../lib/agent-lifecycle.mjs";

test("installed and registered are independent", () => {
  assert.deepEqual(deriveLifecycle({ entry: { id: "codex" }, agent: null, installed: true, activeAgentId: null }), {
    id: "codex",
    software: "installed",
    profile: "absent",
    health: "unknown",
    active: false,
  });
});

test("switch changes only activeAgentId", () => {
  const config = { activeAgentId: "codex", agents: [{ id: "codex", enabled: true }, { id: "pi", enabled: true }] };
  const next = applyLifecycleChange(config, { type: "activate", id: "pi" });
  assert.equal(next.activeAgentId, "pi");
  assert.deepEqual(next.agents, config.agents);
});

test("disabled agent cannot become active", () => {
  const config = { activeAgentId: null, agents: [{ id: "pi", enabled: false }] };
  assert.throws(() => applyLifecycleChange(config, { type: "activate", id: "pi" }), /enabled/);
});
```

- [ ] **Step 3: Verify RED**

```powershell
node --test apps/web/test/config-store.test.mjs apps/web/test/agent-lifecycle.test.mjs
```

Expected: both modules are missing.

- [ ] **Step 4: Implement minimal store and lifecycle modules**

The store must write a sibling `.<basename>.<operationId>.tmp`, call
`fs.fsyncSync`, copy the previous file to `.bak`, rename the temp over the
registry, and invoke `onCommit`. It maintains an in-memory `Map` of completed
operation IDs for process-lifetime idempotency. `removeProfile` blocks a primary
profile with children unless `detachChildren === true`; detachment sets each
child to `{ ...child, enabled: false, detachedFrom: id, parentId: null }`.

Lifecycle implementation:

```js
export function deriveLifecycle({ entry, agent, installed, activeAgentId } = {}) {
  return {
    id: entry?.id || agent?.id || "",
    software: installed === true ? "installed" : installed === false ? "not_installed" : "unknown",
    profile: !agent ? "absent" : activeAgentId === agent.id ? "active" : agent.enabled === false ? "disabled" : "registered",
    health: "unknown",
    active: Boolean(agent && activeAgentId === agent.id),
  };
}

export function applyLifecycleChange(config, command = {}) {
  const agents = Array.isArray(config.agents) ? config.agents : [];
  const index = agents.findIndex(agent => agent.id === command.id);
  if (index < 0) throw new Error(`unknown agent '${command.id}'`);
  if (command.type === "activate") {
    if (agents[index].enabled === false) throw new Error("agent must be enabled before activation");
    return { ...config, activeAgentId: command.id };
  }
  if (command.type === "enable" || command.type === "disable") {
    const enabled = command.type === "enable";
    const nextAgents = agents.map((agent, i) => i === index ? { ...agent, enabled } : agent);
    return {
      ...config,
      activeAgentId: !enabled && config.activeAgentId === command.id ? null : config.activeAgentId || null,
      agents: nextAgents,
    };
  }
  if (command.type === "edit") {
    const allowed = {
      name: String(command.patch?.name || agents[index].name).trim().slice(0, 40),
      role: String(command.patch?.role || agents[index].role).trim().slice(0, 80),
      note: String(command.patch?.note || agents[index].note || "").trim().slice(0, 400),
    };
    return { ...config, agents: agents.map((agent, i) => i === index ? { ...agent, ...allowed } : agent) };
  }
  throw new Error(`unsupported lifecycle command '${command.type}'`);
}
```

Extend runtime paths with `tombstoneDir`.

- [ ] **Step 5: Run focused tests and full regression**

```powershell
node --test apps/web/test/config-store.test.mjs apps/web/test/agent-lifecycle.test.mjs apps/web/test/runtime-paths.test.mjs
npm test
```

Expected: focused tests and all repository tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/lib/config-store.cjs apps/web/lib/agent-lifecycle.mjs apps/web/lib/runtime-paths.cjs apps/web/test/config-store.test.mjs apps/web/test/agent-lifecycle.test.mjs apps/web/test/runtime-paths.test.mjs
git commit -m "feat: add atomic agent lifecycle store"
```

---

### Task 5: Wire Marketplace and lifecycle APIs into the Node control plane

**Files:**

- Create: `apps/web/test/lifecycle-api.test.mjs`
- Modify: `apps/web/server.js:31-51,89-139,455-477,965-1075,1586-1741`
- Modify: `apps/web/test/server-lifecycle.test.mjs`

**Interfaces:**

- Consumes: manifest, adapter, managed bundle, config store, and lifecycle modules.
- Produces:
  - `GET /api/marketplace`;
  - compatible alias `GET /api/catalog`;
  - `POST /api/marketplace/:id/install`;
  - `GET /api/agents/lifecycle`;
  - `PATCH /api/agents/:id`;
  - `POST /api/agents/:id/activate`;
  - `POST /api/agents/:id/remove`;
  - `POST /api/agents/:id/restore`;
  - `POST /api/agents/:id/uninstall`.
- Mutation response: `{ operationId, state, event }`.
- Lifecycle response also contains `busy`, derived only from active
  install/uninstall/plugin-copy owned processes so the desktop updater can
  refuse restart while a mutation is running.

- [ ] **Step 1: Make server creation injectable in a failing API test**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServer } = require("../server.js");

async function withServer(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-api-"));
  const configPath = path.join(root, "agents.config.json");
  fs.writeFileSync(configPath, JSON.stringify({
    agency: "Test",
    activeAgentId: "codex",
    agents: [{ id: "codex", name: "Codex", enabled: true, lane: "Codex" }],
  }));
  const server = createServer({ configPath, stateRoot: root, vaultPath: path.join(root, "Vault") });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run({ base, root }); }
  finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function approve(base, type, target) {
  const requested = await fetch(`${base}/api/approvals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, target, consequence: `${type} ${target}`, actor: "test" }),
  }).then(value => value.json());
  await fetch(`${base}/api/approvals/${requested.id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved", confirmed: true }),
  });
  return requested.id;
}

test("Marketplace response is redacted and contains 20 agents", async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/api/marketplace`).then(value => value.json());
    assert.equal(response.entries.filter(entry => entry.kind === "agent").length, 20);
    assert.equal(JSON.stringify(response).includes("\"program\""), false);
    assert.equal(JSON.stringify(response).includes("\"package\""), false);
  });
});

test("activate and disable mutate only registry state", async () => {
  await withServer(async ({ base }) => {
    const approvalId = await approve(base, "agent.disable", "codex");
    const disable = await fetch(`${base}/api/agents/codex`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-approval-id": approvalId },
      body: JSON.stringify({ operationId: "disable-1", enabled: false }),
    });
    assert.equal(disable.status, 200);
    const body = await disable.json();
    assert.equal(body.state.profile, "disabled");
    const state = await fetch(`${base}/api/state`).then(value => value.json());
    assert.equal(state.activeAgentId, null);
  });
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/web/test/lifecycle-api.test.mjs
```

Expected: FAIL because `createServer` does not accept runtime overrides and
`/api/marketplace` does not exist.

- [ ] **Step 3: Add a server runtime factory without restructuring unrelated code**

Change `createServer()` to accept an optional runtime object used only by tests
and desktop. Move path-dependent lifecycle services behind
`createRuntimeServices({ configPath, stateRoot, vaultPath })`. The command-line
path still calls `createServer()` with existing defaults.

Route behavior:

```js
// GET /api/marketplace and compatibility alias /api/catalog
const registered = new Set(loadConfig().agents.map(agent => agent.id));
const entries = marketplace.MARKETPLACE_ENTRIES.map(entry =>
  marketplace.publicMarketplaceEntry(entry, {
    platform: process.platform,
    registered: registered.has(entry.id),
    installed: entry.kind === "agent" ? catalogInstalled(entry) : receiptInstalled(entry.id),
  }),
);
return json(res, 200, { schemaVersion: 1, entries });

// PATCH /api/agents/:id
const next = lifecycle.applyLifecycleChange(loadConfig(), {
  type: Object.hasOwn(data, "enabled") ? data.enabled ? "enable" : "disable" : "edit",
  id,
  patch: data,
});
store.commit(next, data.operationId);
return json(res, 200, {
  operationId: data.operationId,
  state: lifecycle.deriveLifecycle({
    agent: next.agents.find(agent => agent.id === id),
    installed: installedState(id),
    activeAgentId: next.activeAgentId,
  }),
  event: { type: "agent.profile_updated", agentId: id },
});
```

All mutations require a non-empty UUID/slug `operationId`. Edit, enable,
disable, activate, remove, restore, Marketplace install, and uninstall use
`withApproval` with the exact action type and entity ID. The Marketplace route
accepts only `{ adapterId, operationId, register }`; an agent install with
`register: true` adds its reviewed profile through the same atomic transaction,
while plugin/skill installation writes only managed files and a receipt.
Uninstall consumes two
headers:

```js
function withTwoApprovals(req, res, first, second, run) {
  return APPROVAL_QUEUE.then(queue => {
    const a = queue.authorize(req.headers["x-approval-id"], { ...first, actor: "dashboard" });
    if (!a.allowed) return json(res, 403, { error: "first approval required", reason: a.reason });
    const b = queue.authorize(req.headers["x-confirmation-id"], { ...second, actor: "dashboard" });
    if (!b.allowed) return json(res, 403, { error: "second approval required", reason: b.reason });
    return run();
  });
}
```

Remove returns `409` with `childIds` unless `detachChildren: true`. It reports
the retained list from the store. Restore accepts `tombstoneId`. No route
accepts an executable adapter specification; clients submit only reviewed
entity and adapter IDs.

For Hypertaks, resolve the source exclusively from the read-only
`bundleRoot/hypertaks-agent`, verify `bundle.manifest.json` before every copy,
build the copy plan, reject collisions, then apply the receipt. Installation
does not fetch or execute Git, npm, a shell, or any remote response.

- [ ] **Step 4: Test both approvals and data-preserving removal**

Add API tests that:

- create/decide two approvals;
- prove uninstall returns `403` with only one;
- stub the process launcher so no global package is mutated;
- remove Codex and assert telemetry/vault fixture files still exist;
- restore the tombstone and assert the same profile ID returns;
- repeat one operation ID and assert `replayed: true`.

Run:

```powershell
node --test apps/web/test/lifecycle-api.test.mjs apps/web/test/server-lifecycle.test.mjs apps/web/test/approval-queue.test.mjs
npm test
```

Expected: focused tests and full suite PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/server.js apps/web/test/lifecycle-api.test.mjs apps/web/test/server-lifecycle.test.mjs
git commit -m "feat: expose safe agent lifecycle APIs"
```

---

### Task 6: Upgrade Marketplace and Add Agent without changing their design

**Files:**

- Create: `apps/web/src/lib/marketplace-view.mjs`
- Create: `apps/web/test/marketplace-view.test.mjs`
- Modify: `apps/web/src/components/CatalogGrid.jsx`
- Modify: `apps/web/src/components/AddAgentModal.jsx`
- Modify: `apps/web/src/views/MarketplaceView.jsx`

**Interfaces:**

- Produces: `filterMarketplace(entries, kind)` and
  `marketplaceAction(entry, operationState)`.
- React uses existing classes: `aa-catalog`, `aa-cat-card`, `aa-cat-icon`,
  `aa-cat-body`, `aa-cat-state`, `aa-cat-log`, `token-sub`, and existing buttons.

- [ ] **Step 1: Write failing view-model tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { filterMarketplace, marketplaceAction } from "../src/lib/marketplace-view.mjs";

const entries = [
  { id: "codex", kind: "agent", featured: false, registered: false, installed: false, adapterIds: ["npm"] },
  { id: "hypertaks-agent", kind: "plugin", featured: true, registered: false, installed: false, adapterIds: ["agents-standard"] },
  { id: "crimson-odyssey", kind: "agent", featured: false, registered: false, installed: false, adapterIds: [], officialUrl: "https://example.test" },
];

test("featured entries sort first without changing kind filters", () => {
  assert.deepEqual(filterMarketplace(entries, "all").map(item => item.id), ["hypertaks-agent", "codex", "crimson-odyssey"]);
  assert.deepEqual(filterMarketplace(entries, "agent").map(item => item.id), ["codex", "crimson-odyssey"]);
});

test("actions never expose command text", () => {
  assert.deepEqual(marketplaceAction(entries[0]), { kind: "install", label: "Install + register", adapterId: "npm" });
  assert.deepEqual(marketplaceAction(entries[2]), { kind: "official-link", label: "Official page ↗", adapterId: null });
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/web/test/marketplace-view.test.mjs
```

Expected: module missing.

- [ ] **Step 3: Implement the pure view model**

```js
export function filterMarketplace(entries = [], kind = "all") {
  return entries
    .filter(entry => kind === "all" || entry.kind === kind)
    .sort((a, b) => Number(b.featured) - Number(a.featured));
}

export function marketplaceAction(entry, operationState = {}) {
  if (operationState.runningId) return {
    kind: "state",
    label: operationState.runningId === entry.id ? "installing…" : "-",
    adapterId: null,
  };
  if (entry.registered && entry.installed) return { kind: "state", label: "✓ ready", adapterId: null };
  if (entry.adapterIds?.length) return {
    kind: "install",
    label: entry.kind === "agent" && !entry.registered ? "Install + register" : "Install",
    adapterId: entry.adapterIds[0],
  };
  if (entry.kind === "agent" && !entry.registered) return { kind: "register", label: "Register", adapterId: null };
  return { kind: "official-link", label: "Official page ↗", adapterId: null };
}
```

- [ ] **Step 4: Migrate the existing UI contract**

`CatalogGrid` fetches `/api/marketplace`; it never reads `entry.install.cmd`.
Approval consequence says `Install the reviewed <adapterId> adapter for
<entry.name>` without rendering a command. For plugins/skills, submit the same
install route with entity ID and adapter ID. For external links, render an
ordinary `<a>` using `officialUrl`.

`MarketplaceView` adds three existing `Btn` controls-Agents, Plugins, Skills-
inside `SectionRow`; “All” is the initial state. Featured Hypertaks remains the
first normal catalog card with an existing `Pill`/text marker, not a new hero.

`AddAgentModal` passes `kind="agent"` so the current two-path modal remains an
agent registration surface. No CSS file is changed.

- [ ] **Step 5: Verify**

```powershell
node --test apps/web/test/marketplace-view.test.mjs
npm run build
npm test
```

Expected: pure test, production build, and full suite PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/marketplace-view.mjs apps/web/test/marketplace-view.test.mjs apps/web/src/components/CatalogGrid.jsx apps/web/src/components/AddAgentModal.jsx apps/web/src/views/MarketplaceView.jsx
git commit -m "feat: surface agents plugins and skills in marketplace"
```

---

### Task 7: Add lifecycle management to Settings

**Files:**

- Create: `apps/web/src/components/ConfirmAgentAction.jsx`
- Create: `apps/web/src/components/AgentManagementPanel.jsx`
- Create: `apps/web/src/lib/agent-management-view.mjs`
- Create: `apps/web/test/agent-management-view.test.mjs`
- Modify: `apps/web/src/views/SettingsView.jsx`
- Modify: `apps/web/src/hooks/useGateway.js`

**Interfaces:**

- Produces: `agentManagementRows(lifecycle)` and
  `removalImpact(agent, children)`.
- `ConfirmAgentAction` props:
  `{ open, title, agentName, impact, confirmLabel, onCancel, onConfirm }`.
- `AgentManagementPanel` props: `{ state, refresh }`.

- [ ] **Step 1: Write failing view-model tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { agentManagementRows, removalImpact } from "../src/lib/agent-management-view.mjs";

test("management rows keep software and profile state separate", () => {
  const rows = agentManagementRows([
    { id: "codex", name: "Codex", software: "installed", profile: "disabled", active: false },
  ]);
  assert.deepEqual(rows[0].badges, ["installed", "disabled"]);
  assert.deepEqual(rows[0].actions, ["edit", "enable", "activate", "remove", "uninstall"]);
});

test("removal impact names retained data and child blocker", () => {
  const impact = removalImpact({ id: "codex", name: "Codex" }, [{ id: "reviewer" }]);
  assert.deepEqual(impact.retained, ["vault", "telemetry", "activity", "workflows", "logs", "credentials", "software", "user files"]);
  assert.deepEqual(impact.childIds, ["reviewer"]);
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/web/test/agent-management-view.test.mjs
```

Expected: module missing.

- [ ] **Step 3: Implement the view model and typed confirmation**

`ConfirmAgentAction` uses the existing `Overlay`, `.aa-box`, `.aa-field`,
`.aa-actions`, `Btn`, and an input whose submit stays disabled until its value
equals `agentName`. The impact list is plain text inside the modal. Escape and
Cancel close it and return focus through `Overlay`.

`AgentManagementPanel` renders one existing `Panel title="AGENTS"` and
`aa-cat-card` per lifecycle row. Actions:

- edit: one approval and an existing-style overlay containing only Name, Role,
  and Note; `PATCH /api/agents/:id` accepts only those three fields;
- enable/disable: one approval, `PATCH /api/agents/:id`;
- activate: one approval, `POST /api/agents/:id/activate`;
- remove: typed confirmation plus one approval, `POST /api/agents/:id/remove`;
- restore: one approval, `POST /api/agents/:id/restore`;
- uninstall: typed confirmation, then two calls to `approveAction`, then
  `POST /api/agents/:id/uninstall` with `x-approval-id` and
  `x-confirmation-id`.

Generate `operationId` with `crypto.randomUUID()` in the browser. Do not show an
uninstall action when the API says `uninstallable: false`.

If Remove returns `409` with `childIds`, keep the profile unchanged and open a
second typed-name impact confirmation. Its only mutation choice is
**Detach children and remove profile**; retry with `detachChildren: true`.
Detached children remain registered, disabled, and restorable. Cancel performs
no mutation.

- [ ] **Step 4: Compose into the current Settings stack**

In `SettingsView`, load `/api/agents/lifecycle`, render
`<AgentManagementPanel state={lifecycle} refresh={loadLifecycle} />` immediately
after Appearance, and leave existing Software and Workspace panels intact.
Pass only existing props from `App.jsx`; no navigation change.

- [ ] **Step 5: Verify**

```powershell
node --test apps/web/test/agent-management-view.test.mjs
npm run build
npm test
```

Then start a temporary server with a temporary config and verify through the
browser:

- four themes render the same Settings layout;
- enable/disable and active switch update badges;
- remove confirmation requires the exact name;
- removed profile disappears and Restore appears;
- vault/telemetry fixture files remain;
- no console errors.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/components/ConfirmAgentAction.jsx apps/web/src/components/AgentManagementPanel.jsx apps/web/src/lib/agent-management-view.mjs apps/web/test/agent-management-view.test.mjs apps/web/src/views/SettingsView.jsx apps/web/src/hooks/useGateway.js
git commit -m "feat: manage agent lifecycle from settings"
```

---

### Task 8: Add storage, recovery, diagnostics, and privacy controls to Settings

**Files:**

- Create: `apps/web/lib/runtime-settings.mjs`
- Create: `apps/web/test/runtime-settings.test.mjs`
- Create: `apps/web/src/components/RuntimeSettingsPanel.jsx`
- Modify: `apps/web/server.js:31-68,455-485,1586-1741`
- Modify: `apps/web/src/views/SettingsView.jsx`

**Interfaces:**

- Produces: `runtimeSettingsSnapshot(context)`,
  `applyRuntimeSettings(config, patch)`, `diagnosticsSnapshot(context)`, and
  `clearOwnedLogs({ logDir, confirmedNames })`.
- API:
  - `GET /api/settings/runtime`;
  - `PATCH /api/settings/runtime`;
  - `POST /api/settings/restore-backup`;
  - `POST /api/settings/clear-logs`;
  - `GET /api/diagnostics`.
- Defaults: `logRetentionDays: 30`, `anonymousTelemetry: false`.

- [ ] **Step 1: Write failing runtime-settings tests**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyRuntimeSettings,
  clearOwnedLogs,
  diagnosticsSnapshot,
  runtimeSettingsSnapshot,
} from "../lib/runtime-settings.mjs";

test("runtime snapshot exposes paths and provider names but never values", () => {
  const snapshot = runtimeSettingsSnapshot({
    stateRoot: "C:\\Users\\test\\AppData\\Local\\Rempeyek-Agent-OS",
    vaultPath: "D:\\Vault",
    logDir: "C:\\Users\\test\\AppData\\Local\\Rempeyek-Agent-OS\\telemetry\\logs",
    config: {
      settings: { logRetentionDays: 14, anonymousTelemetry: false },
      agents: [{ gateway: { envAllow: ["OPENAI_API_KEY"] } }],
    },
    env: { OPENAI_API_KEY: "must-not-leak" },
    tombstones: [{ id: "tomb-1", agent: { id: "codex", name: "Codex" } }],
    backupExists: true,
  });
  assert.equal(snapshot.settings.logRetentionDays, 14);
  assert.deepEqual(snapshot.providerVariables, [{ name: "OPENAI_API_KEY", detected: true }]);
  assert.equal(JSON.stringify(snapshot).includes("must-not-leak"), false);
  assert.equal(snapshot.backups.length, 1);
  assert.equal(snapshot.tombstones[0].id, "tomb-1");
});

test("runtime patch accepts only bounded retention and telemetry preference", () => {
  const config = { agents: [], settings: {} };
  assert.deepEqual(applyRuntimeSettings(config, {
    logRetentionDays: 60,
    anonymousTelemetry: true,
    injected: "no",
  }).settings, { logRetentionDays: 60, anonymousTelemetry: true });
  assert.throws(() => applyRuntimeSettings(config, { logRetentionDays: 0 }), /1 and 365/);
});

test("Clear Logs deletes only named files directly inside the owned log directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-logs-"));
  const logDir = path.join(root, "logs");
  fs.mkdirSync(logDir);
  fs.writeFileSync(path.join(logDir, "codex.log"), "owned");
  fs.writeFileSync(path.join(root, "keep.txt"), "keep");
  const result = clearOwnedLogs({ logDir, confirmedNames: ["codex.log"] });
  assert.deepEqual(result.removed, ["codex.log"]);
  assert.equal(fs.existsSync(path.join(root, "keep.txt")), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("diagnostics replaces the home path and excludes secret values", () => {
  const result = diagnosticsSnapshot({
    home: "C:\\Users\\test",
    version: { version: "2.2.0" },
    paths: { stateRoot: "C:\\Users\\test\\AppData\\Local\\Rempeyek-Agent-OS" },
    lifecycle: [{ id: "codex", profile: "registered", software: "installed" }],
    providerVariables: [{ name: "OPENAI_API_KEY", detected: true }],
    recentErrors: [],
  });
  assert.equal(JSON.stringify(result).includes("C:\\\\Users\\\\test"), false);
  assert.match(result.paths.stateRoot, /%USERPROFILE%/);
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/web/test/runtime-settings.test.mjs
```

Expected: module missing.

- [ ] **Step 3: Implement the pure settings boundary**

`runtimeSettingsSnapshot` returns resolved local paths, one `.bak` registry
backup, tombstone summaries, provider variable names/detected booleans, approval
audit counts, and preferences. It never returns environment values, gateway
commands, receipt hashes, or tombstone record bodies.

`applyRuntimeSettings` copies the config and writes only:

```js
const settings = {
  logRetentionDays: Number(patch.logRetentionDays ?? config.settings?.logRetentionDays ?? 30),
  anonymousTelemetry: Boolean(patch.anonymousTelemetry ?? config.settings?.anonymousTelemetry ?? false),
};
if (!Number.isInteger(settings.logRetentionDays) || settings.logRetentionDays < 1 || settings.logRetentionDays > 365) {
  throw new Error("logRetentionDays must be between 1 and 365");
}
return { ...config, settings };
```

`clearOwnedLogs` validates every name with `/^[a-z0-9][a-z0-9-]*\.log$/i`,
joins it directly under `logDir`, verifies containment with `path.relative`,
and unlinks only those enumerated files. It never recursively deletes.

`diagnosticsSnapshot` is bounded to version, platform, redacted paths, lifecycle
states, provider variable names, and the 50 newest redacted error/event records.

- [ ] **Step 4: Wire approved APIs**

- `PATCH /api/settings/runtime` accepts only the two pure settings fields,
  requires approval type `settings.runtime`, commits through `configStore`, and
  returns the redacted snapshot.
- `POST /api/settings/restore-backup` requires approval and typed agency-name
  confirmation, parses `.bak`, validates `agents` as an array, then commits it;
  the current config becomes the next `.bak`.
- `POST /api/settings/clear-logs` requires approval and the exact array returned
  by the preview endpoint; the server re-enumerates before delete.
- `GET /api/diagnostics` returns `Content-Disposition:
  attachment; filename="rempeyek-diagnostics.json"` and bounded JSON.

- [ ] **Step 5: Add existing-style Settings controls**

`RuntimeSettingsPanel` uses existing `Panel`, `settings-facts`, `settings-note`,
`aa-cat-card`, `Btn`, and `ConfirmAgentAction`:

- Storage & Recovery: State root, Vault, Log folder, `.bak` state, tombstone
  count, Restore Backup, and Clear Logs impact confirmation.
- Privacy & Execution: anonymous telemetry toggle (off by default), retention
  selector 1-365 days, provider variable names/detected state, approval audit
  count, Download Diagnostics, and Reset UI Preferences.

Reset UI Preferences removes only `aos-theme`, `aos-release-check`, and
`dashToken` after confirmation; it never calls a server data mutation.

- [ ] **Step 6: Verify**

```powershell
node --test apps/web/test/runtime-settings.test.mjs apps/web/test/lifecycle-api.test.mjs
npm test
npm run build
```

Browser verification proves the panels use the existing Settings stack in all
four themes, Clear Logs previews exact filenames, diagnostics contain no secret
value, and backup restore leaves the previous config recoverable.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/lib/runtime-settings.mjs apps/web/test/runtime-settings.test.mjs apps/web/src/components/RuntimeSettingsPanel.jsx apps/web/server.js apps/web/src/views/SettingsView.jsx
git commit -m "feat: add recovery and privacy settings"
```

---

### Task 9: Add parent-bound subagent records, API, scaffold, and topology evidence

**Files:**

- Create: `apps/web/lib/subagent-record.mjs`
- Create: `apps/web/test/subagent-record.test.mjs`
- Modify: `apps/web/server.js:106-139,1170-1178,1375-1397,1729-1740`
- Modify: `apps/web/test/agent-topology.test.mjs`
- Modify: `apps/web/test/lifecycle-api.test.mjs`

**Interfaces:**

- Produces: `buildSubagentRecord(input, context)`.
- Required input: `{ name, domain, outcome, workspaceScope }`.
- Optional input: `{ permissionProfile, memoryPolicy, activation, modelProvider,
  toolIds, skillIds, allowedPaths, cadence, eventTrigger, checkpointRule,
  instructions }`.
- API: `POST /api/agents/:id/subagents`.

- [ ] **Step 1: Write failing record tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildSubagentRecord } from "../lib/subagent-record.mjs";

const parent = { id: "codex", name: "Codex", lane: "Codex", node: "Node-12", kind: "agent" };

test("builds a parent-bound subagent with safe defaults", () => {
  const result = buildSubagentRecord({
    name: "Security Reviewer",
    domain: "Application security",
    outcome: "Review changed code and report actionable findings",
    workspaceScope: "current-project",
  }, {
    parent,
    existingIds: ["codex"],
    existingNodeNums: [12],
    now: "2026-07-24T00:00:00.000Z",
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.agent, {
    id: "codex-security-reviewer",
    kind: "subagent",
    parentId: "codex",
    name: "Security Reviewer",
    domain: "Application security",
    role: "Application security",
    outcome: "Review changed code and report actionable findings",
    workspaceScope: "current-project",
    permissions: { profile: "standard", allowedPaths: [] },
    memoryPolicy: "isolated",
    activation: "manual",
    modelProvider: "",
    toolIds: [],
    skillIds: [],
    cadence: "",
    eventTrigger: "",
    checkpointRule: "",
    instructions: "",
    node: "Node-13",
    lane: "Codex/Subagents/SecurityReviewer",
    enabled: true,
    createdAt: "2026-07-24T00:00:00.000Z",
  });
});

test("rejects missing purpose, non-primary parent, and escaping paths", () => {
  assert.match(buildSubagentRecord({ name: "X" }, { parent, existingIds: [], existingNodeNums: [] }).error, /domain/);
  assert.match(buildSubagentRecord({
    name: "X", domain: "D", outcome: "O", workspaceScope: "current-project",
  }, { parent: { ...parent, kind: "subagent" }, existingIds: [], existingNodeNums: [] }).error, /primary/);
  assert.match(buildSubagentRecord({
    name: "X", domain: "D", outcome: "O", workspaceScope: "current-project", allowedPaths: ["..\\secret"],
  }, { parent, existingIds: [], existingNodeNums: [] }).error, /allowed path/);
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/web/test/subagent-record.test.mjs
```

Expected: module missing.

- [ ] **Step 3: Implement minimal validation and builder**

Use slug normalization already used by agent registration. Allowed permission
profiles are `read-only`, `standard`, and `custom`; memory policies are
`inherit-summaries`, `isolated`, and `shared-project`; activation values are
`manual`, `cadence`, and `event`. Reject absolute or `..` allowed paths.
Generate the lane from alphanumeric parent lane and child name.

- [ ] **Step 4: Add the approved API and non-clobbering scaffold**

Route:

```js
const match = url.match(/^\/api\/agents\/([\w-]+)\/subagents$/);
if (match && req.method === "POST") {
  return readBody(req, res, body => {
    let data;
    try { data = JSON.parse(body); }
    catch { return json(res, 400, { error: "body must be JSON" }); }
    return withApproval(req, res, "subagent.create", match[1], () => {
      const cfg = loadConfig();
      const result = subagentLib.buildSubagentRecord(data, {
        parent: cfg.agents.find(agent => agent.id === match[1]),
        existingIds: cfg.agents.map(agent => agent.id),
        existingNodeNums: cfg.agents.map(agent => Number(String(agent.node || "").replace(/\D/g, ""))).filter(Number.isFinite),
        now: new Date().toISOString(),
      });
      if (result.error) return json(res, 400, result);
      store.commit({ ...cfg, agents: [...cfg.agents, result.agent] }, data.operationId);
      scaffoldVaultLane(result.agent);
      sysEvent(result.agent.id, "ok", `subagent created under ${match[1]}`);
      return json(res, 201, {
        operationId: data.operationId,
        agent: result.agent,
        event: { type: "subagent.created", agentId: result.agent.id, parentId: match[1] },
      });
    });
  });
}
```

`agentDetail(parentId)` returns `configuredSubagents` from registry separately
from telemetry activity. `buildLiveAgentTopology` passes:

```js
const configuredSubagents = state.agents
  .filter(agent => agent.kind === "subagent" && agent.parentId)
  .map(agent => ({
    id: `registry:${agent.parentId}:${agent.id}`,
    parentAgentId: agent.parentId,
    agentId: agent.id,
    status: agent.enabled === false ? "disabled" : "configured",
  }));
```

No session, success, progress, or activity telemetry is synthesized.

- [ ] **Step 5: Verify record, API, and topology**

```powershell
node --test apps/web/test/subagent-record.test.mjs apps/web/test/lifecycle-api.test.mjs apps/web/test/agent-topology.test.mjs
npm test
```

Expected: tests PASS; the topology contains one provenance-backed
`spawned_subagent` edge with source `subagent`.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/lib/subagent-record.mjs apps/web/test/subagent-record.test.mjs apps/web/server.js apps/web/test/lifecycle-api.test.mjs apps/web/test/agent-topology.test.mjs
git commit -m "feat: create parent-bound subagents"
```

---

### Task 10: Add the `+` subagent form to existing agent profiles

**Files:**

- Create: `apps/web/src/components/SubagentModal.jsx`
- Create: `apps/web/src/lib/subagent-form.mjs`
- Create: `apps/web/test/subagent-form.test.mjs`
- Modify: `apps/web/src/components/AgentDetail.jsx:62-75,77-218`

**Interfaces:**

- Produces: `normalizeSubagentForm(form)` and `validateSubagentForm(form)`.
- `SubagentModal` props: `{ open, parent, onClose, onCreated }`.
- Uses existing `.aa-box`, `.aa-grid`, `.aa-field`, `.wide`, `.aa-actions`,
  `.subrow`, `.ty`, `.nm`, `.st`, and `Btn`.

- [ ] **Step 1: Write failing form tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSubagentForm, validateSubagentForm } from "../src/lib/subagent-form.mjs";

test("normalizes required and advanced values", () => {
  assert.deepEqual(normalizeSubagentForm({
    name: "  Security Reviewer ",
    domain: " AppSec ",
    outcome: " Review the diff ",
    workspaceScope: "current-project",
    permissionProfile: "read-only",
    allowedPaths: "apps/web\npackages/ui",
    toolIds: "rg, git",
    skillIds: "backend-code-review",
  }), {
    name: "Security Reviewer",
    domain: "AppSec",
    outcome: "Review the diff",
    workspaceScope: "current-project",
    permissionProfile: "read-only",
    memoryPolicy: "isolated",
    activation: "manual",
    modelProvider: "",
    allowedPaths: ["apps/web", "packages/ui"],
    toolIds: ["rg", "git"],
    skillIds: ["backend-code-review"],
    cadence: "",
    eventTrigger: "",
    checkpointRule: "",
    instructions: "",
  });
});

test("requires name, domain, outcome, and scope", () => {
  assert.deepEqual(validateSubagentForm({}), {
    name: "Name is required",
    domain: "Field/domain is required",
    outcome: "Concrete outcome is required",
    workspaceScope: "Workspace scope is required",
  });
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/web/test/subagent-form.test.mjs
```

Expected: module missing.

- [ ] **Step 3: Implement form normalization and existing-style modal**

The visible form contains Name, Field/domain, Concrete outcome, Workspace
scope, Permission profile, Memory policy, and Activation. An ordinary
`<details>` contains model/provider, tools, skills, allowed paths, cadence,
event trigger, checkpoint rule, and instructions. Submit:

1. validates locally;
2. requests approval `subagent.create` for the parent ID;
3. sends normalized values plus `operationId`;
4. renders field errors or the server error without closing;
5. calls `onCreated` and closes only on HTTP 201 success.

- [ ] **Step 4: Insert the profile entry point and honest configured list**

Change the Subagents heading to:

```jsx
<h3>
  Subagents / Tasks <span className="cnt">{activity.subagents.length + configuredSubagents.length}</span>
  {d.kind !== "subagent" && <Btn variant="dim" onClick={() => setAddingSubagent(true)}>＋</Btn>}
</h3>
```

Render configured children first with status `configured`, `disabled`, or
`detached`; render telemetry rows through the existing `Subagents` component.
Do not merge configured rows into `activity.subagents`.

- [ ] **Step 5: Verify**

```powershell
node --test apps/web/test/subagent-form.test.mjs
npm run build
npm test
```

Browser verification with temporary state:

- open a primary profile in all four themes;
- `+` opens the modal without shifting the profile layout;
- keyboard focus stays inside and returns to `+`;
- submit creates one registry child and five missing lane scaffold entries;
- re-open shows the configured child;
- Agent Map gets one real parent edge;
- a subagent profile has no nested `+`;
- console has no errors.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/components/SubagentModal.jsx apps/web/src/lib/subagent-form.mjs apps/web/test/subagent-form.test.mjs apps/web/src/components/AgentDetail.jsx
git commit -m "feat: create subagents from agent profiles"
```

---

### Task 11: Close the web-platform phase with public, regression, and recovery evidence

**Files:**

- Modify: `README.md`
- Modify: `docs/Agent-System.md`
- Modify: `docs/Roadmap.md`
- Modify: `agents.config.example.json`
- Modify: `checkpoint.md`
- Modify: configured vault `Projects/Agentic OS Checkpoint.md`
- Modify: configured vault daily Codex log and Codex memory
- Modify: temporary handoff note

**Interfaces:**

- Documents the exact lifecycle semantics delivered by Tasks 1-10.
- Produces a recovery brief for the desktop plan.

- [ ] **Step 1: Update public documentation without local paths**

Document:

- 20-agent curation date and non-ranking meaning;
- Agents/Plugins/Skills filters;
- Hypertaks featured plugin and managed `.agents` target;
- Crimson Odyssey official-link boundary;
- registered versus installed;
- enable/disable/active switch;
- non-destructive Remove and Restore;
- Advanced double-approved uninstall;
- primary-profile subagent creation and non-cascade behavior.

Use `%USERPROFILE%` in public examples. Remove the Roadmap statement that delete
is permanently manual; replace it with the shipped profile-removal semantics.

- [ ] **Step 2: Run the complete gate**

```powershell
npm test
npm run build
npm run audit:public
git diff --check
```

Expected:

- all tests PASS with zero skipped tests added by this work;
- Vite production build succeeds;
- public audit reports no personal path, runtime data, roster leak, raster
  evidence, or high-confidence secret;
- diff check is silent.

- [ ] **Step 3: Run live API probes**

Start with temporary `AGENT_STATE_DIR` and `VAULT_PATH`, then verify:

```text
GET  /api/state
GET  /api/marketplace
GET  /api/agents/lifecycle
GET  /api/agent/codex/detail
POST /api/agents/codex/subagents
POST /api/agents/codex/remove
POST /api/agents/codex/restore
```

Expected: no 401 on loopback; mutations require their exact approvals; response
bodies contain no command, secret, or owner-specific path; removal leaves the
temporary vault and telemetry files byte-identical.

- [ ] **Step 4: Run visual/interaction regression**

Verify desktop-width and narrow-width views for Cyberpunk, Minimalist,
Brutalist, and Glassmorph:

- Marketplace ordering/filtering;
- Add Agent;
- Settings management;
- typed confirmation;
- primary profile `+` modal;
- Agent Map parent edge;
- reduced motion and keyboard navigation;
- zero browser console errors.

Record evidence paths outside tracked public assets.

- [ ] **Step 5: Update Graphify and checkpoints**

If `graphify-out/graph.json` exists after implementation:

```powershell
graphify update .
```

Append the completed phase, exact tests, commits, retained-data proof, and
remaining desktop-plan boundary to `checkpoint.md`, the configured Obsidian
checkpoint, Codex daily log, Codex memory, and the temporary handoff note.

- [ ] **Step 6: Commit**

```powershell
git add README.md docs/Agent-System.md docs/Roadmap.md agents.config.example.json checkpoint.md
git commit -m "docs: close public agent lifecycle phase"
```

Do not stage the external vault or temporary handoff file in the public
repository.
