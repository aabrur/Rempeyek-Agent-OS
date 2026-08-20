# Unify Release Copy And Empty-By-Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every *current-release* user-facing string match `APP_VERSION` (`2.4.3`) and make onboarding copy match the consent contract: a clean install has zero registered agents.

**Architecture:** One source of truth already exists: `apps/web/lib/version.mjs` plus root/web/desktop `package.json` (already locked together by `apps/desktop/test/package-config.test.mjs`). This plan does not add a version helper. Runtime CJS uses a packaging-safe literal `2.4.3`, locked against `APP_VERSION` by `release-copy.test.mjs`. ESM web code imports `APP_VERSION`. Static HTML/markdown are lockstep-tested against `APP_VERSION`. Desktop `createIncidentRecord` default stays a string (packaging-safe) but a test fails if it drifts.

**Tech Stack:** Node.js built-in test runner (`node --test`), existing CJS `apps/web/server.js`, ESM `*.mjs`, markdown docs, static HTML.

## Global Constraints

- Repo root: `C:/Users/abrur/Documents/Rempeyek-Agent-Os`
- Slice A only. Do not persist WorkUnit/Verification (Plan B). Do not split `requestHandler`.
- Do not git commit unless the Boss explicitly asks. Skip every Commit step until then.
- Do not edit `CHANGELOG.md` historical `## [2.4.2]` / `## [2.3.9]` sections.
- Do not retarget `apps/desktop/test/packaged-app-smoke.test.mjs` installer filenames (dist artifacts, not copy).
- Do not rename brand (`Agentic OS`, `AGENTIC//OS`, 🤖, 🧠, Trakteer). Out of slice.
- Do not invent macOS/Linux desktop support; public installer is Windows x64 (`README.md` Requirements).
- `APP_VERSION` in `apps/web/lib/version.mjs` is `'2.4.3'` — do not bump it.
- Shell is git-bash. Web tests: `node --test apps/web/test/<file>.test.mjs` from repo root. Desktop tests: `node --test test/<file>.test.mjs` from `apps/desktop`. Do not use `npm run test:desktop` (git-bash wrapper is broken).
- Match existing style. Touch only listed files.

## Karpathy goals (loop until these pass)

1. `README.md` current-download copy equals `APP_VERSION` and does not mention `2.4.2` or `2.3.9`.
2. `docs/GETTING-STARTED.md` does not say the OS registers system agents; it says the registry starts empty.
3. `docs/FIRST-RUN.md` example `nodeCount` is `0`.
4. `/api/doctor/export` `system.appVersion` is not a hardcoded `"2.4.2"`.
5. System Doctor desktop fallback version is `APP_VERSION`.
6. Recovery shell `Build Version` equals `APP_VERSION`.
7. `web/index.html` does not claim `21 Registered Agents`.
8. `npm test` (web) still 411+ and the new tests pass. Desktop recovery tests still pass.

## File map

| File | Role |
|------|------|
| Create: `apps/web/test/release-copy.test.mjs` | Lockstep tests for README, onboarding docs, recovery HTML, legacy `web/index.html`, `server.js` source |
| Modify: `README.md` | Download badge, tag, Setup exe name, updater sentence |
| Modify: `docs/GETTING-STARTED.md` | OS line; bootstrap step 4 empty registry |
| Modify: `docs/FIRST-RUN.md` | Step 4 wording; example `nodeCount` |
| Modify: `apps/web/lib/system-doctor.mjs` | Fallback `APP_VERSION` import |
| Modify: `apps/web/test/system-doctor.test.mjs` | Fallback test; keep injected `"2.4.2"` fixture (echo test) |
| Modify: `apps/web/server.js` | Packaging-safe `APP_VERSION` literal `2.4.3`; doctor export |
| Modify: `apps/web/index.html` | Recovery diagnostics version string only |
| Modify: `apps/desktop/boot-recovery.mjs` | Default `appVersion` string `2.4.3` |
| Modify: `apps/desktop/test/recovery-architecture.test.mjs` | Default matches `APP_VERSION`; keep explicit `"2.4.2"` echo test |
| Modify: `web/index.html` | Empty roster copy |

---

### Task 1: README current-release copy tracks APP_VERSION

**Objective:** Fail, then make README advertise `2.4.3` only.

**Files:**
- Create: `apps/web/test/release-copy.test.mjs`
- Modify: `README.md` (lines 15, 32, 37, 49)
- Test: `apps/web/test/release-copy.test.mjs`

**Interfaces:**
- Consumes: `APP_VERSION` from `apps/web/lib/version.mjs`
- Produces: `release-copy.test.mjs` as the lockfile for later tasks

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APP_VERSION } from "../lib/version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("README download copy matches APP_VERSION and drops stale release pins", () => {
  const readme = read("README.md");
  const escaped = APP_VERSION.replace(/\./g, "\\.");
  assert.match(readme, new RegExp(`Download v${escaped}`));
  assert.match(readme, new RegExp(`releases/tag/v${escaped}`));
  assert.match(readme, new RegExp(`Rempeyek-Agent-OS-Setup-${escaped}\\.exe`));
  assert.match(readme, /Empty by default/);
  assert.equal(readme.includes("v2.3.9"), false);
  assert.equal(readme.includes("v2.4.2"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (repo root):

```bash
node --test apps/web/test/release-copy.test.mjs
```

Expected: FAIL — `Download v2.4.3` not found (README still says `v2.4.2`) and/or `v2.3.9` still present.

- [ ] **Step 3: Write minimal implementation**

In `README.md` replace only these four sites:

1. Badge + link (was v2.4.2):

```markdown
[![Download v2.4.3](https://img.shields.io/badge/Download-v2.4.3-ff8a00?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/aabrur/Rempeyek-Agent-OS/releases/tag/v2.4.3)
```

2. Install step 1: `Open the public **v2.4.3** release above.`

3. Hash command:

```powershell
Get-FileHash "$HOME\Downloads\Rempeyek-Agent-OS-Setup-2.4.3.exe" -Algorithm SHA256
```

4. Updates paragraph — delete the stale `v2.3.9` pin:

```markdown
The desktop updater supports automated background checks, release manifest verification via `latest.yml`, and a one-click update flow. When the in-app updater finds a newer verified release, click the update control and let the desktop app restart after the download is ready. This public release is unsigned, so manual downloads must be verified against `SHA256SUMS.txt`. User settings, installed-agent records, telemetry, avatars, and Vault data remain in place across application upgrades.
```

Do not edit the Features list or Requirements.

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test apps/web/test/release-copy.test.mjs
```

Expected: PASS — `tests 1`, `pass 1`.

- [ ] **Step 5: Commit**

Skip unless the Boss says to commit.

```bash
git add apps/web/test/release-copy.test.mjs README.md
git commit -m "docs: pin README download copy to APP_VERSION 2.4.3"
```

---

### Task 2: Onboarding docs match empty-by-default

**Objective:** GETTING-STARTED and FIRST-RUN no longer imply auto-registered agents or a 4-node family.

**Files:**
- Modify: `docs/GETTING-STARTED.md:11-12, 57`
- Modify: `docs/FIRST-RUN.md:20-21, 56`
- Test: `apps/web/test/release-copy.test.mjs` (append)

**Interfaces:**
- Consumes: `read()` helper from Task 1
- Produces: onboarding copy aligned with `no-auto-register.test.mjs`

- [ ] **Step 1: Append failing tests to `release-copy.test.mjs`**

```js
test("GETTING-STARTED does not auto-register agents and does not claim macOS/Linux desktop", () => {
  const text = read("docs/GETTING-STARTED.md");
  assert.equal(/registering system agents/i.test(text), false);
  assert.match(text, /zero agents/i);
  assert.equal(/macOS/i.test(text), false);
  assert.equal(/Linux/i.test(text), false);
});

test("FIRST-RUN example registry starts empty", () => {
  const text = read("docs/FIRST-RUN.md");
  assert.equal(text.includes("\"nodeCount\": 4"), false);
  assert.match(text, /"nodeCount": 0/);
  assert.match(text, /zero agents|nodeCount is 0/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test apps/web/test/release-copy.test.mjs
```

Expected: FAIL — GETTING-STARTED still has `registering system agents` and `macOS`; FIRST-RUN still has `"nodeCount": 4`.

- [ ] **Step 3: Write minimal implementation**

`docs/GETTING-STARTED.md` prerequisites OS bullet (replace the macOS/Linux line):

```markdown
* **Operating System**: Windows 10/11. The public desktop installer is Windows x64.
```

Keep the Node.js and Git bullets.

Replace bootstrap step 4:

```markdown
4. Initializing the **AI Family Registry** with zero agents. You add agents yourself from Marketplace.
```

`docs/FIRST-RUN.md` step 4 — replace the paragraph with:

```markdown
4. **Initialize AI Family Registry**
   Writes `Vault/System/AI-Family/family-registry.json` from currently registered agents. When none are registered, `nodeCount` is 0.
```

In the example JSON, change `"nodeCount": 4` to `"nodeCount": 0`.

Do not rewrite the rest of either doc. Do not retarget the broken `file:///docs/FIRST-RUN.md` link (out of slice).

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test apps/web/test/release-copy.test.mjs
```

Expected: PASS — `tests 3`, `pass 3`.

- [ ] **Step 5: Commit**

Skip unless the Boss says to commit.

```bash
git add docs/GETTING-STARTED.md docs/FIRST-RUN.md apps/web/test/release-copy.test.mjs
git commit -m "docs: empty-by-default onboarding; Windows-only desktop claim"
```

---

### Task 3: System Doctor fallback uses APP_VERSION

**Objective:** Missing `services.appVersion` reports `APP_VERSION`, not `2.4.2`.

**Files:**
- Modify: `apps/web/lib/system-doctor.mjs:1-4, 37`
- Modify: `apps/web/test/system-doctor.test.mjs` (import + one new test)
- Test: `apps/web/test/system-doctor.test.mjs`

**Interfaces:**
- Consumes: `export const APP_VERSION` from `./version.mjs`
- Produces: fallback string `Version: ${APP_VERSION}`
- Leave `createTestDoctorEnvironment` `appVersion: "2.4.2"` — that fixture tests echo, not current release.

- [ ] **Step 1: Write the failing test**

Add import:

```js
import { APP_VERSION } from "../lib/version.mjs";
```

Append:

```js
test("desktop check falls back to APP_VERSION when services.appVersion is omitted", async () => {
  const env = createTestDoctorEnvironment();
  try {
    delete env.services.appVersion;
    const doctor = createSystemDoctor({
      services: env.services,
      loadConfig: () => env.mockConfig,
      saveConfig: () => {},
      backupEngine: env.mockBackupEngine,
      migrationEngine: env.mockMigrationEngine,
      processManager: env.mockProcessManager,
    });
    const report = await doctor.scan();
    const desktop = report.checks.find(c => c.id === "desktop_runtime");
    assert.ok(desktop);
    assert.match(desktop.details, new RegExp(`Version: ${APP_VERSION.replace(/\\./g, "\\.")}`));
    assert.equal(desktop.details.includes("Version: 2.4.2"), false);
  } finally {
    env.cleanup();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test apps/web/test/system-doctor.test.mjs
```

Expected: FAIL — details still contain `Version: 2.4.2` after delete.

- [ ] **Step 3: Write minimal implementation**

`apps/web/lib/system-doctor.mjs` add import after the existing node imports:

```js
import { APP_VERSION } from "./version.mjs";
```

Replace the details template:

```js
details: `Electron: ${process.versions?.electron || "Node.js runtime"}, Packaged: ${services.isPackaged ?? false}, Version: ${services.appVersion || APP_VERSION}`,
```

Do not change other checks.

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test apps/web/test/system-doctor.test.mjs
```

Expected: PASS (existing tests + new one). Injected fixture `"2.4.2"` still allowed.

- [ ] **Step 5: Commit**

Skip unless the Boss says to commit.

```bash
git add apps/web/lib/system-doctor.mjs apps/web/test/system-doctor.test.mjs
git commit -m "fix: System Doctor version fallback uses APP_VERSION"
```

---

### Task 4: Doctor export and recovery shell track APP_VERSION

**Objective:** `server.js` doctor export and recovery HTML stop hardcoding `2.4.2`. Desktop incident default string matches `APP_VERSION` without importing web into the packaged desktop graph.

**Files:**
- Modify: `apps/web/server.js` (after `path` require, and line 3818)
- Modify: `apps/web/index.html` line 119
- Modify: `apps/desktop/boot-recovery.mjs` line 29
- Modify: `apps/desktop/test/recovery-architecture.test.mjs`
- Test: `apps/web/test/release-copy.test.mjs` (append) + desktop recovery test

**Interfaces:**
- Consumes: packaging-safe CJS literal `const APP_VERSION = "2.4.3";`, locked against imported `APP_VERSION` by `release-copy.test.mjs`
- Produces: `appVersion: APP_VERSION` in `/api/doctor/export`
- Do not import `../web/lib/version.mjs` from `boot-recovery.mjs` (asar fileset may omit it). Tests may import it.

- [ ] **Step 1: Write the failing tests**

Append to `release-copy.test.mjs`:

```js
test("server doctor export and recovery shell do not hardcode 2.4.2", () => {
  const server = read("apps/web/server.js");
  const recovery = read("apps/web/index.html");
  const escaped = APP_VERSION.replace(/\./g, "\\.");
  assert.match(server, new RegExp(`const APP_VERSION\\s*=\\s*"${escaped}";`));
  assert.equal(server.includes('require("./package.json").version'), false);
  assert.match(server, /appVersion:\s*APP_VERSION/);
  assert.equal(/appVersion:\s*"2\.4\.2"/.test(server), false);
  assert.match(recovery, new RegExp(`Build Version: ${escaped}`));
  assert.equal(recovery.includes("Build Version: 2.4.2"), false);
});
```

In `apps/desktop/test/recovery-architecture.test.mjs` add:

```js
import { APP_VERSION } from "../../web/lib/version.mjs";
```

Keep the existing echo test that passes `appVersion: "2.4.2"`. Append:

```js
test("createIncidentRecord default appVersion matches APP_VERSION", () => {
  const incident = createIncidentRecord({ error: new Error("boot") });
  assert.equal(incident.appVersion, APP_VERSION);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test apps/web/test/release-copy.test.mjs
```

From `apps/desktop`:

```bash
node --test test/recovery-architecture.test.mjs
```

Expected: FAIL — server still has `appVersion: "2.4.2"`; HTML still `Build Version: 2.4.2`; default incident still `"2.4.2"` if `APP_VERSION` is `2.4.3`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/server.js` after `const path = require("path");`:

```js
const APP_VERSION = "2.4.3";
```

Replace doctor export field:

```js
appVersion: APP_VERSION,
```

`apps/web/index.html` diagnostics alert — only the version token:

```js
alert("System Status:\\n• Desktop Shell: Running\\n• Phase: " + currentPhase + "\\n• Path: %LOCALAPPDATA%\\\\Rempeyek-Agent-OS\\n• Build Version: 2.4.3");
```

(Keep surrounding recovery copy unchanged.)

`apps/desktop/boot-recovery.mjs` default:

```js
appVersion = "2.4.3",
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test apps/web/test/release-copy.test.mjs
```

```bash
node --test test/recovery-architecture.test.mjs
```

(cwd `apps/desktop` for the second.)

Expected: PASS.

- [ ] **Step 5: Commit**

Skip unless the Boss says to commit.

```bash
git add apps/web/server.js apps/web/index.html apps/web/test/release-copy.test.mjs apps/desktop/boot-recovery.mjs apps/desktop/test/recovery-architecture.test.mjs
git commit -m "fix: doctor export and recovery version follow 2.4.3"
```

---

### Task 5: Legacy `web/` dashboard does not fake a 21-agent roster

**Objective:** `web/index.html` status badge matches empty-by-default.

**Files:**
- Modify: `web/index.html:13`
- Test: `apps/web/test/release-copy.test.mjs` (append)

**Interfaces:**
- Consumes: none
- Produces: badge text without a fake count

- [ ] **Step 1: Write the failing test**

```js
test("legacy web dashboard does not claim 21 registered agents", () => {
  const html = read("web/index.html");
  assert.equal(html.includes("21 Registered Agents"), false);
  assert.match(html, /No registered agents/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test apps/web/test/release-copy.test.mjs
```

Expected: FAIL — still `21 Registered Agents`.

- [ ] **Step 3: Write minimal implementation**

Replace line 13:

```html
      <div id="status-badge" style="font-size: 0.875rem; color: var(--text-muted);">No registered agents</div>
```

Do not rewrite `web/app.js` or the rest of `web/index.html`.

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test apps/web/test/release-copy.test.mjs
```

Expected: PASS — all tests in the file green.

- [ ] **Step 5: Commit**

Skip unless the Boss says to commit.

```bash
git add web/index.html apps/web/test/release-copy.test.mjs
git commit -m "fix: legacy dashboard empty-roster copy"
```

---

### Task 6: Full suite gate

**Objective:** Slice A does not regress the living suite.

**Files:** none new

- [ ] **Step 1: Run web tests**

```bash
npm test
```

Expected: exit 0, `fail 0`. Count will be previous 411 plus the new `release-copy` tests (5) plus one System Doctor test → about 417. Do not treat 411 as a frozen number.

If `lifecycle-api.test.mjs` flakes (prior session: timeout under load, isolated rerun 14/14), rerun that file alone:

```bash
node --test apps/web/test/lifecycle-api.test.mjs
```

Expected: 14 pass. Then rerun `npm test` once.

- [ ] **Step 2: Run desktop recovery + version lock tests**

```bash
node --test test/recovery-architecture.test.mjs test/package-config.test.mjs
```

(cwd `apps/desktop`)

Expected: PASS, including `root, web, and desktop report the same release version`.

- [ ] **Step 3: Commit**

Skip unless the Boss says to commit.

---

## Self-review

1. **Spec coverage:** Version pins (README, doctor export, doctor fallback, recovery HTML, boot-recovery default) each have a task. Empty-by-default (GETTING-STARTED, FIRST-RUN, `web/index.html`) each have a task. Full suite gate is Task 6.
2. **Placeholder scan:** no TBD / “add validation” / “similar to Task N”.
3. **Out of scope left out:** WorkUnit persist, `requestHandler` extract, brand rename, CHANGELOG history, packaged installer filenames, `file://` GETTING-STARTED link.
4. **Type consistency:** `APP_VERSION` string; doctor export field name stays `appVersion`.

## Plan B (not written)

Persist `saveWorkUnit` / `saveVerification` to `Vault/Work/...` with a cold-restart test. Separate plan, after this slice ships.
