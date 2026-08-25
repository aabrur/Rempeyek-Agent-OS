# v2.4.6 Maintenance Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile Rempeyek Agent OS v2.4.6 in-place: fix the HTTP startup readiness race, add a real Playwright E2E release gate, sync lockfile metadata, harden release-artifact provenance, refresh current QA docs, and republish the existing GitHub Release v2.4.6 from one canonical artifact set.

**Architecture:** Keep the local-first dashboard. Extract only an HTTP module-readiness registry (CJS, require-able from `apps/web/server.js`) so `server.listen()` and `rempeyek:ready` cannot fire while required route modules are still `loading`. Do not rewrite `server.js`. Playwright becomes a hard CI dependency with no HTTP-only fallback. GitHub `desktop-release` on tag `v2.4.6` remains the single publisher; export/root copy may only copy those bytes.

**Tech Stack:** Node 22, node:test, Playwright Chromium, npm workspaces, electron-builder 26.15.3, GitHub Actions, `gh` as `aabrur`.

## Global Constraints

- Product version remains exactly `2.4.6`. Do not create `v2.4.7`.
- Target branch is `main`. Do not force-push `main`. Annotated tag `v2.4.6` may be moved only after Commit A is on `origin/main` and CI is green.
- BASE_SHA=`9c5ef67424eee26472a30483236cf8242ca72278`. OLD_RELEASE_TAG_SHA (annotated tag object)=`dadc5c9fbda3fe43338c3d48a530fba3c1e78f4e`. OLD_RELEASE_COMMIT (peeled)=`87cdf385b5e1916d465b91cc7dbb101b05716248`.
- Preserve loopback-first auth, timing-safe tokens, remote-mode restrictions, child-env allowlists, process ownership, durable-config, empty-by-default clean install, in-memory fail-closed approval queue (do not persist it).
- Windows release stays unsigned unless existing `CSC_LINK`/`CSC_KEY_PASSWORD`/`DESKTOP_PUBLISHER_SUBJECT` are present. Never fabricate signing.
- `*.exe` is gitignored. Do not commit installer binaries. Root `Rempeyek-Agent-OS-Setup-2.4.6.exe` is a local convenience copy that must match the public GitHub asset byte-for-byte after publication.
- Independently versioned workspace packages (`packages/ui`, `theme-engine`, `neural-engine`, `design-system` at `2.1.0`) stay at `2.1.0`.
- TDD for every behavioral bug: RED → watch fail → GREEN → verify. No arbitrary sleeps to hide races.
- Never kill a process before confirming ownership. Never mutate unrelated external-agent config.
- One source Commit A after verification. Optional Commit B only for post-release local/docs sync that does not rebuild binaries.
- Do not deploy to external hosting. Network actions are Git/GitHub only.
- Implementers must NOT commit. Parent creates Commit A after the full verification gate.

## File Map

- Create: `apps/web/lib/http-readiness.cjs` — authoritative HTTP module readiness contract
- Create: `apps/web/test/http-readiness.test.mjs` — delayed-loader RED/GREEN + failed-vs-loading
- Create: `apps/web/test/work-publishing-readiness.test.mjs` — post-ready work/social must not say loading; 20x fork stress
- Create: `scripts/release-version-sync.mjs` + `apps/web/test/release-version-sync.test.mjs`
- Create: `scripts/release-artifact-integrity.mjs` + `apps/web/test/release-artifact-integrity.test.mjs`
- Create: `playwright.config.mjs`, `tests/e2e/app.spec.mjs`, `tests/e2e/responsive.spec.mjs`
- Modify: `apps/web/server.js` listen gate + 503 state distinction (surgical)
- Modify: `tests/playwright/ui-all-buttons.spec.mjs` — fail if Playwright/browser missing
- Modify: `package.json` scripts (`test:e2e`), `package-lock.json` versions, CI + release workflows
- Modify: `scripts/export-public-release.mjs` — copy-only, fail closed, hash-equal
- Modify: `docs/RELEASE-QA-REPORT.md`, `Checkpoint.md`, `CHANGELOG.md` (2.4.6 maintenance addendum only)
- Do not rewrite historical CHANGELOG entries, old specs, or old plans

---

### Task 1: HTTP readiness registry (TDD)

**Files:**
- Create: `apps/web/lib/http-readiness.cjs`
- Create: `apps/web/test/http-readiness.test.mjs`
- Test: `node --test apps/web/test/http-readiness.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `MODULE_STATES`, `REQUIRED_HTTP_MODULE_IDS`, `OPTIONAL_HTTP_MODULE_IDS`, `createHttpReadinessRegistry(entries)`, `routeModuleError(registry, id, { loading, failed })`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const readinessPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "http-readiness.cjs");

test("delayed required module keeps registry unready until it resolves", async () => {
  const { createHttpReadinessRegistry, MODULE_STATES, REQUIRED_HTTP_MODULE_IDS } = require(readinessPath);
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("work-lifecycle"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("publishing-domain"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("publishing-gateway"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("publishing-scheduler"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("switchboard"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("process-manager"));

  let resolveWork;
  const work = new Promise(resolve => { resolveWork = resolve; });
  const registry = createHttpReadinessRegistry([
    { id: "work-lifecycle", promise: work, required: true },
  ]);
  assert.equal(registry.status("work-lifecycle"), MODULE_STATES.LOADING);
  assert.equal(registry.isReady(), false);

  const raced = await Promise.race([
    registry.awaitReady().then(() => "ready"),
    new Promise(resolve => setTimeout(() => resolve("timeout"), 40)),
  ]);
  assert.equal(raced, "timeout");

  resolveWork({ ok: true });
  await registry.awaitReady();
  assert.equal(registry.isReady(), true);
  assert.equal(registry.status("work-lifecycle"), MODULE_STATES.READY);
});

test("rejected required module becomes failed, not loading, and awaitReady still settles", async () => {
  const { createHttpReadinessRegistry, MODULE_STATES, routeModuleError } = require(readinessPath);
  const registry = createHttpReadinessRegistry([
    { id: "publishing-domain", promise: Promise.reject(new Error("boom")), required: true },
  ]);
  await registry.awaitReady();
  assert.equal(registry.isReady(), true);
  assert.equal(registry.status("publishing-domain"), MODULE_STATES.FAILED);
  const err = routeModuleError(registry, "publishing-domain", {
    loading: "publishing store loading",
    failed: "publishing store unavailable",
  });
  assert.equal(err.state, "unavailable");
  assert.equal(err.error, "publishing store unavailable");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/test/http-readiness.test.mjs`
Expected: FAIL — `Cannot find module .../http-readiness.cjs`

- [ ] **Step 3: Write minimal implementation**

```js
"use strict";

const MODULE_STATES = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
});

const REQUIRED_HTTP_MODULE_IDS = Object.freeze([
  "agent-detail",
  "agent-catalog",
  "marketplace-manifest",
  "process-adapters",
  "process-manager",
  "agent-lifecycle",
  "managed-bundle",
  "runtime-settings",
  "subagent-record",
  "release-check",
  "source-update",
  "switchboard",
  "work-lifecycle",
  "publishing-domain",
  "publishing-gateway",
  "publishing-scheduler",
]);

const OPTIONAL_HTTP_MODULE_IDS = Object.freeze([
  "bootstrap",
  "unified-memory-graph",
  "system-doctor",
  "backup-engine",
  "migration-engine",
]);

function createHttpReadinessRegistry(entries = []) {
  const states = new Map();
  const pending = [];

  for (const entry of entries) {
    const id = entry.id;
    states.set(id, MODULE_STATES.LOADING);
    const tracked = Promise.resolve(entry.promise).then(
      value => {
        states.set(id, MODULE_STATES.READY);
        return value;
      },
      error => {
        states.set(id, MODULE_STATES.FAILED);
        return { error };
      },
    );
    pending.push(tracked);
  }

  return {
    status(id) {
      return states.get(id) || MODULE_STATES.FAILED;
    },
    isReady() {
      for (const entry of entries) {
        if (!entry.required) continue;
        if (states.get(entry.id) === MODULE_STATES.LOADING) return false;
      }
      return true;
    },
    async awaitReady() {
      await Promise.all(pending);
      return this.snapshot();
    },
    snapshot() {
      const modules = {};
      for (const [id, state] of states) modules[id] = state;
      return { ready: this.isReady(), modules };
    },
  };
}

function routeModuleError(registry, id, messages) {
  const state = registry.status(id);
  if (state === MODULE_STATES.LOADING) {
    return { error: messages.loading, state: "loading" };
  }
  if (state === MODULE_STATES.FAILED) {
    return { error: messages.failed, state: "unavailable" };
  }
  return null;
}

module.exports = {
  MODULE_STATES,
  REQUIRED_HTTP_MODULE_IDS,
  OPTIONAL_HTTP_MODULE_IDS,
  createHttpReadinessRegistry,
  routeModuleError,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/test/http-readiness.test.mjs`
Expected: PASS

- [ ] **Step 5: Do not commit** (parent makes Commit A later)

---

### Task 2: Wire server.js listen gate + 503 distinction

**Files:**
- Modify: `apps/web/server.js` (top imports ~135-181, work/social 503s ~3486-3688, listen ~3899-3930, exports ~3933)
- Create: `apps/web/test/work-publishing-readiness.test.mjs`
- Modify: export `whenHttpModulesReady` / `httpReadiness` from `module.exports`

**Interfaces:**
- Consumes: `createHttpReadinessRegistry`, `REQUIRED_HTTP_MODULE_IDS`, `routeModuleError`
- Produces: `whenHttpModulesReady()` used by listen + tests; after `rempeyek:ready`, work/social routes never return `* loading`

Root cause (already established): `Promise.allSettled` at line 3900 omits `WORK_LIFECYCLE_MOD`, `PUBLISHING_*`, `PROCESS_MANAGER_MOD`, `SWITCHBOARD_MOD`. Routes then return 503 `"work lifecycle store loading"` after the app has announced ready.

- [ ] **Step 1: Write failing integration test first**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "server.js");
const src = fs.readFileSync(serverPath, "utf8");

test("listen gate awaits work and publishing modules", () => {
  assert.match(src, /createHttpReadinessRegistry/);
  assert.match(src, /WORK_LIFECYCLE_MOD/);
  assert.match(src, /PUBLISHING_SCHEDULER_MOD/);
  assert.match(src, /SWITCHBOARD_MOD/);
  assert.match(src, /PROCESS_MANAGER_MOD/);
  assert.doesNotMatch(
    src,
    /Promise\.allSettled\(\[\s*AGENT_DETAIL,\s*AGENT_CATALOG_MOD,[\s\S]*SOURCE_UPDATE_MOD,\s*\]\)\.then\(\(\) => server\.listen/,
  );
});

async function forkReadyServer() {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-ready-"));
  fs.writeFileSync(path.join(stateRoot, "agents.config.json"), JSON.stringify({ agency: "Ready", agents: [] }));
  const child = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: "0",
      DASH_HOST: "127.0.0.1",
      AGENT_STATE_DIR: stateRoot,
      AGENTS_CONFIG: path.join(stateRoot, "agents.config.json"),
      VAULT_PATH: path.join(stateRoot, "Vault"),
    },
    silent: true,
  });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ready timeout")), 20000);
    child.on("message", message => {
      if (message?.type === "rempeyek:ready") {
        clearTimeout(timer);
        resolve(message);
      }
    });
    child.once("exit", code => {
      clearTimeout(timer);
      reject(new Error(`exited ${code}`));
    });
  });
  return { child, stateRoot, origin: `http://127.0.0.1:${ready.port}` };
}

test("after rempeyek:ready, work and social routes are not loading", async () => {
  const { child, stateRoot, origin } = await forkReadyServer();
  try {
    const work = await fetch(`${origin}/api/work/missions?projectId=x`);
    const workBody = await work.json();
    assert.notEqual(workBody.error, "work lifecycle store loading");
    assert.equal(work.status, 200);
    const social = await fetch(`${origin}/api/social/campaigns?projectId=x`);
    const socialBody = await social.json();
    assert.notEqual(socialBody.error, "publishing store loading");
    assert.equal(social.status, 200);
  } finally {
    child.kill();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("20 clean startups never return work/social loading after ready", async () => {
  for (let i = 0; i < 20; i++) {
    const { child, stateRoot, origin } = await forkReadyServer();
    try {
      const work = await (await fetch(`${origin}/api/work/missions`)).json();
      const social = await (await fetch(`${origin}/api/social/campaigns`)).json();
      assert.notEqual(work.error, "work lifecycle store loading", `iter ${i}`);
      assert.notEqual(social.error, "publishing store loading", `iter ${i}`);
    } finally {
      child.kill();
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  }
});
```

- [ ] **Step 2: Run to verify RED**

Run: `node --test apps/web/test/work-publishing-readiness.test.mjs`
Expected: FAIL on listen-gate source assertion (current `Promise.allSettled` list).

- [ ] **Step 3: Wire server.js surgically**

At top, after existing CJS requires:

```js
const {
  createHttpReadinessRegistry,
  routeModuleError,
} = require("./lib/http-readiness.cjs");
```

After all `import()` assignments (work + publishing + switchboard + process-manager), create:

```js
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
```

Replace work/social/switchboard `if (!store)` blocks with:

```js
const blocked = routeModuleError(httpReadiness, "work-lifecycle", {
  loading: "work lifecycle store loading",
  failed: "work lifecycle store unavailable",
});
if (blocked) return json(res, 503, blocked);
```

Same pattern for publishing-domain / publishing-gateway / publishing-scheduler / switchboard.

Replace listen gate:

```js
whenHttpModulesReady().then(() => server.listen(PORT, process.env.DASH_HOST || "127.0.0.1", () => {
  // existing rempeyek:ready + timers unchanged
}));
```

Export:

```js
module.exports = { createRuntimeServices, createServer, legacyDecisionContext, whenHttpModulesReady, httpReadiness };
```

Log failed required modules with sanitized `e.message` only (already the existing `[work-lifecycle]` pattern). Do not leak stacks to clients.

- [ ] **Step 4: Run focused tests GREEN**

Run:
- `node --test apps/web/test/http-readiness.test.mjs apps/web/test/work-publishing-readiness.test.mjs apps/web/test/work-and-social-api.test.mjs apps/web/test/server-lifecycle.test.mjs`
Expected: PASS. 20 iterations, 0 loading races.

- [ ] **Step 5: Do not commit**

---

### Task 3: Real Playwright E2E + CI (no HTTP fallback)

**Files:**
- Create: `playwright.config.mjs`
- Create: `tests/e2e/app.spec.mjs`
- Create: `tests/e2e/responsive.spec.mjs`
- Modify: `package.json` (devDependency `@playwright/test`, script `test:e2e`)
- Modify: `tests/playwright/ui-all-buttons.spec.mjs` — throw if playwright/chromium missing or launch fails
- Modify: `.github/workflows/ci.yml` — install Chromium + `npm run test:e2e`
- Modify: `scripts/public-release-audit.mjs` — require `npm run test:e2e` in ci.yml

**Interfaces:**
- Consumes: `createServer` from `apps/web/server.js`, built `apps/web/dist`
- Produces: `npm run test:e2e` fails closed without a browser

- [ ] **Step 1: Write E2E specs that fail if Playwright is absent**

`playwright.config.mjs`: testDir `tests/e2e`, fullyParallel false, timeout 60000, use `{ baseURL }` from webServer, webServer is NOT used (tests start isolated createServer after requiring built dist). Forbid `process.env.CI` retries > 1.

`tests/e2e/app.spec.mjs` must:
- `import { chromium } from "@playwright/test"` — missing package fails the run
- launch Chromium; launch failure fails the test (no catch-and-fetch)
- start isolated `createServer` on 127.0.0.1:0 with empty agents
- `page.goto(origin)`
- wait for sidebar `nav[aria-label="Primary"]` and disappearance of "Opening your workspace"
- click Agents / Projects / Memory / Switchboard / Marketplace / Observatory / Settings
- assert main content visible, no `pageerror`, no console `error` except known benign
- GET `/api/state` and `/api/procs` 200
- open Settings, click theme radio "Brutalist" then "Cyberpunk", assert `html[data-theme]` changes and page still up
- zero-agent Agents view does not invent agents

`tests/e2e/responsive.spec.mjs`:
- Desktop 1440x900 and mobile 390x844
- no `document.documentElement.scrollWidth > innerWidth + 1`
- Primary nav or a reachable control exists (mobile may collapse; Settings + at least one dest must be clickable)

`ui-all-buttons.spec.mjs`: delete the fetch fallback. If `!playwright?.chromium` throw `Playwright Chromium is required`. If launch throws, rethrow.

- [ ] **Step 2: Run `npm run test:e2e` and watch RED** (script missing / playwright missing)

- [ ] **Step 3: `npm install -D @playwright/test` in repo root, add script, `npx playwright install chromium`**

Do not bump product version. Lockfile will change — Task 4 syncs workspace versions.

- [ ] **Step 4: GREEN locally then add CI job steps on ubuntu-latest after build:**

```yaml
- run: npx playwright install --with-deps chromium
- run: npm run test:e2e
```

E2E must not require internet except localhost / Playwright browser download in CI setup.

- [ ] **Step 5: Do not commit**

---

### Task 4: package-lock + version consistency gate

**Files:**
- Create: `scripts/release-version-sync.mjs`
- Create: `apps/web/test/release-version-sync.test.mjs`
- Modify: `package-lock.json` (root, `packages[""]`, `apps/web`, `apps/desktop` → `2.4.6` only)
- Modify: `package.json` script `audit:release` or add `npm run audit:version` invoked by `audit:release` / CI

**Interfaces:**
- Consumes: `APP_VERSION` from `apps/web/lib/version.mjs` and the three 2.4.6 manifests
- Produces: CI fail if lockfile workspace metadata drifts

- [ ] **Step 1: Failing test** asserting `package-lock.json` root/`""`/`apps/web`/`apps/desktop` versions equal `APP_VERSION` and that `packages/ui` remains `2.1.0`.

- [ ] **Step 2: RED** (lockfile still `2.4.4`)

- [ ] **Step 3: `npm install --package-lock-only` then confirm only those four lock entries moved to 2.4.6. Add `scripts/release-version-sync.mjs` that exits 1 on drift. Call it from `scripts/dependency-audit-policy.mjs` or a new npm script wired into `audit:release` and CI.**

- [ ] **Step 4: `npm ci` in a clean check (or at least `node scripts/release-version-sync.mjs` + `npm ci` when ready)**

- [ ] **Step 5: Do not commit**

---

### Task 5: Release artifact provenance

**Files:**
- Create: `scripts/release-artifact-integrity.mjs`
- Create: `apps/web/test/release-artifact-integrity.test.mjs`
- Modify: `scripts/export-public-release.mjs`
- Modify: `.github/workflows/release.yml`

**Root cause:** GitHub Release Setup is `101414401` / `3a5f641362e1126cd28ff8d636d0992cb75f4104888730360512c263a41cacbc`. Local root copy is `101414285` / different hash because `export-public-release.mjs` copies whatever `apps/desktop/dist` last built and only `console.warn`s on copy failure. Two builds of the same version are not byte-identical (unsigned NSIS).

**Required behavior:**
- Canonical publisher = tag workflow `signed-tag-release` building once per publication.
- Export copies `apps/desktop/dist/Rempeyek-Agent-OS-Setup-${version}.exe` → root only after SHA256(source)==SHA256(dest). Never rebuild inside export.
- Export fails (exit 1) if source missing or hashes diverge after copy.
- `release-artifact-integrity.mjs` hashes Setup, Portable, SHA256SUMS.txt, checks `latest.yml` version + url entries exist beside the hashed files. Never hand-edit checksums.
- release.yml: generate SHA256SUMS from the same dist folder; verify each listed file; before upload, `gh release delete-asset` same names on existing tag (ignore missing) OR `gh release upload --clobber` as the single replace path. Choose clobber-via-gh-release-action only if we add an explicit delete-asset step first so stale duplicates cannot remain.
- Add CI unit tests around the integrity script using tiny temp files (not 100MB installers).

- [ ] **Step 1: Write integrity tests that fail if export still warn-only**
- [ ] **Step 2: RED**
- [ ] **Step 3: Implement fail-closed export + integrity script + workflow replace**
- [ ] **Step 4: GREEN focused tests**
- [ ] **Step 5: Do not commit**

---

### Task 6: Durability / diagnostic comments on touched catches

**Files:**
- Modify only catches touched by Tasks 2 and 5 (`export-public-release.mjs`, readiness failures, any new boot helpers)
- Do not sweep the repo for `catch {}`

Classify:
- Best-effort cleanup (`fs.rmSync` in tests, process.exit handlers already in server): leave silent + one-line comment if ambiguous
- Operational truth (module import failure, export copy, integrity hash): log sanitized message, fail closed, no secrets

Do not persist Approval Queue.

---

### Task 7: Current QA/release documentation from real results

**Files:**
- Rewrite: `docs/RELEASE-QA-REPORT.md` as **current** 2.4.6 report (it currently claims 2.3.0 / 314/314)
- Update: `Checkpoint.md` current-status header (currently claims v2.4.3 P0 as current)
- Add a maintenance subsection under existing `## [2.4.6]` in `CHANGELOG.md` only — do not rewrite older entries
- Do not invent counts. Fill after Task 8 verification.

Must include: version 2.4.6, source SHA, npm test totals, desktop totals, E2E result, build, audit:public, audit:release, desktop:test-package, artifact verification, signing status (unsigned unless proven).

---

### Task 8: Full verification gate (parent, not subagent)

Run fresh, do not infer from old CI:

```
npm ci
npm test
npm run test:desktop
npm run build
npm run audit:public
npm run audit:release
npm run test:e2e
npm run desktop:pack
npm run desktop:test-package
```

Plus 20-iter readiness stress (already in Task 2 test). Probe `/api/state` and `/api/procs` on a live isolated server. Zero-agent state is expected.

Then Commit A, push `origin/main`, wait for Actions green.

---

### Task 9: Move tag + republish GitHub Release v2.4.6

After CI green on Commit A:

1. Recreate annotated tag `v2.4.6` on Commit A (preserve annotated style).
2. `git push origin refs/tags/v2.4.6 --force` (tag only).
3. Let `desktop-release` / `signed-tag-release` be the sole publisher. Do not race `gh release upload`.
4. Wait for the workflow. If it cannot replace assets, delete same-named assets then re-run or use the workflow's delete-asset step.
5. Download public assets to a clean temp dir. Hash them. Compare to `apps/desktop/dist` from that same workflow artifact if retained; otherwise treat downloaded GitHub files as canonical and copy Setup to repo root locally.
6. Verify latest.yml + blockmap + SHA256SUMS against downloaded bytes.
7. Update release notes with a concise maintenance section.
8. If root copy hash-sync or QA SHA fields need a follow-up that is not a rebuild: Commit B `chore(release): sync canonical v2.4.6 artifact metadata` — tag stays on A.

---

## Spec coverage

| Requirement | Task |
|---|---|
| Work/Publishing readiness race | 1, 2 |
| 20 clean startups | 2 |
| Real Playwright E2E + CI, no fallback | 3 |
| Desktop 1440 + mobile 390 | 3 |
| package-lock 2.4.6 sync + CI | 4 |
| Canonical artifacts + SHA equality | 5, 9 |
| Stale current QA docs | 7 |
| server.js surgical extract | 1, 2 |
| Durability on touched catches | 6 |
| Security preserved | 2 + existing security tests in Task 8 |
| Commit A / optional B / no v2.4.7 | 8, 9 |

## Placeholder scan

None. Exact files, commands, and code are above.

## Type consistency

- States: `loading` | `ready` | `failed`
- Client-facing failed error uses `unavailable` in `state` and `"… store unavailable"` in `error`
- `whenHttpModulesReady()` is the only listen gate
- Version string always `2.4.6`
