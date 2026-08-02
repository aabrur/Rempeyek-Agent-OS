# Electron Desktop and Verified Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Rempeyek Agent OS UI and Node control plane as a Windows-first Electron desktop application with single-instance lifecycle, per-user state, native settings, and verified stable-release auto-update.

**Architecture:** Electron main owns the native process and starts the existing Node server as an isolated Node child on a random loopback port. The renderer remains the existing Vite build and receives only a minimal context-isolated preload bridge. `electron-updater` owns packaged releases while a typed sequential runner preserves source-checkout updating without shell execution.

**Tech Stack:** Node.js 22, Electron `43.2.0`, electron-builder `26.15.3`, electron-updater `6.8.9`, Sharp `0.35.3`, png-to-ico `3.0.2`, React 18, Node `node:test`, GitHub Actions Windows runner.

## Global Constraints

- The desktop application reuses the existing web UI exactly; no shell, navigation, theme, card, graph, typography, palette, spacing, or motion redesign.
- Electron main and preload contain no product UI markup except a native server-start failure message.
- `nodeIntegration` is `false`, `contextIsolation` is `true`, sandbox is enabled where compatible, web security remains enabled, and untrusted window creation/navigation is denied.
- The server listens only on `127.0.0.1` with an operating-system-assigned port in packaged desktop mode.
- Desktop API calls require an unguessable session token in addition to
  loopback host validation. Electron injects it through `webRequest`; renderer
  JavaScript and preload never expose or store the token.
- A second app launch focuses the existing window.
- Packaged files are read-only application assets. Registry, vault, telemetry, logs, receipts, settings, and update state live under Electron `userData`.
- The packaged updater checks after the main window is usable and every six hours.
- Stable channel, automatic check, and background download are defaults; applying an update always requires user-approved restart.
- Update application pauses during lifecycle mutation and never writes into the vault.
- SHA-512 release metadata is mandatory. Authenticode verification is required when a publisher name is configured; an unsigned development package cannot be described as a signed public release.
- The source-checkout updater remains separate and uses sequential `execFile` calls with no shell.
- No release publication, tag push, code-signing purchase, deployment, or repository visibility mutation occurs without separate user approval.
- Every task follows RED-GREEN-REFACTOR, runs its focused tests, runs `git diff --check`, and ends in an independently reviewable commit.

---

## File structure

### New desktop workspace

- `apps/desktop/package.json` - pinned runtime/dev dependencies, desktop scripts, electron-builder config.
- `apps/desktop/main.mjs` - app lifecycle, BrowserWindow, single instance, tray, IPC registration.
- `apps/desktop/preload.mjs` - narrow `contextBridge` API.
- `apps/desktop/server-process.mjs` - child server startup, ready IPC, timeout, and shutdown.
- `apps/desktop/desktop-settings.mjs` - atomic native preferences.
- `apps/desktop/update-service.mjs` - injected `electron-updater` state machine.
- `apps/desktop/security.mjs` - external URL and navigation allowlists.
- `apps/desktop/scripts/build-icon.mjs` - deterministic conversion of the existing WebP brand asset into Windows ICO sizes.
- `apps/desktop/test/*.test.mjs` - process, settings, security, and updater tests.
- `apps/desktop/assets/icon.ico` - mechanically derived from the existing Rempeyek brand asset; no new art direction.

### Existing files modified

- `package.json` - include `apps/desktop` workspace and desktop scripts.
- `package-lock.json` - lock Electron dependencies.
- `apps/web/server.js` - random-port ready IPC and desktop session-token enforcement.
- `apps/web/lib/access-policy.cjs` and `.mjs` - desktop token policy.
- `apps/web/lib/source-update.mjs` - typed sequential source update.
- `apps/web/src/components/UpdateBanner.jsx` - packaged bridge versus source update.
- `apps/web/src/views/SettingsView.jsx` - native settings/status inside existing panels.
- `.github/workflows/ci.yml` - desktop tests.
- `.github/workflows/release.yml` - Windows artifacts and update metadata.
- `scripts/public-release-audit.mjs` - packaged-content and desktop-secret boundaries.
- public documentation and checkpoints.

---

## Phase and checkpoint map

- Phase D - Desktop runtime: Tasks 1-4.
- Phase E - Verified updates and packaging: Tasks 5-7.
- Phase F - Clean-machine acceptance and release-ready closure: Task 8.

At the end of Tasks 4, 7, and 8, before the listed commit:

1. append the phase result, evidence, boundaries, and exact next task to public
   `checkpoint.md`;
2. update the canonical vault project checkpoint, same-date Codex daily note,
   and Codex brain memory under
   `$env:USERPROFILE\Rempeyek-Agent-Os\Obsidian Vault`;
3. add one small shared-memory update note under
   `$env:USERPROFILE\.codex\memories\extensions\ad_hoc\notes`;
4. refresh the current handoff under `$env:TEMP`, including branch, HEAD,
   worktree state, tests, signing state, and resume command;
5. stage only the public checkpoint with implementation files. Vault,
   shared-memory, and temporary handoff files stay outside the public commit.

Every checkpoint must distinguish a local unsigned test package from a signed
public release and must preserve the design-lock statement.

---

### Task 1: Create the pinned desktop workspace and packaging boundary

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/scripts/build-icon.mjs`
- Create: `apps/desktop/assets/icon.ico`
- Create: `apps/desktop/test/package-config.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/desktop/README.md`

**Interfaces:**

- Root scripts: `test:desktop`, `desktop:dev`, `desktop:pack`, `desktop:dist`.
- Package product identity: `appId = com.rempeyek.agentos`,
  `productName = Rempeyek Agent OS`.
- Packaged server root: `process.resourcesPath/app-root`.

- [ ] **Step 1: Write the failing package contract test**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(DESKTOP, "..", "..");

test("desktop package pins the reviewed runtime and packages only required app files", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, "package.json"), "utf8"));
  assert.equal(pkg.name, "@rempeyek/desktop");
  assert.equal(pkg.main, "main.mjs");
  assert.equal(pkg.devDependencies.electron, "43.2.0");
  assert.equal(pkg.devDependencies["electron-builder"], "26.15.3");
  assert.equal(pkg.devDependencies.sharp, "0.35.3");
  assert.equal(pkg.devDependencies["png-to-ico"], "3.0.2");
  assert.equal(pkg.dependencies["electron-updater"], "6.8.9");
  assert.equal(pkg.build.appId, "com.rempeyek.agentos");
  assert.equal(pkg.build.productName, "Rempeyek Agent OS");
  assert.deepEqual(pkg.build.win.target.map(target => target.target), ["nsis", "portable"]);
  assert.equal(JSON.stringify(pkg.build).includes("Obsidian Vault"), false);
  assert.equal(JSON.stringify(pkg.build).includes("telemetry"), false);
});

test("root workspace exposes desktop scripts", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.workspaces.includes("apps/desktop"), true);
  assert.equal(pkg.scripts["test:desktop"], "npm test --workspace @rempeyek/desktop");
  assert.equal(pkg.scripts["desktop:dist"], "npm run dist --workspace @rempeyek/desktop");
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/desktop/test/package-config.test.mjs
```

Expected: FAIL because `apps/desktop/package.json` does not exist.

- [ ] **Step 3: Add the desktop workspace**

Create:

```json
{
  "name": "@rempeyek/desktop",
  "version": "2.2.0",
  "private": true,
  "type": "module",
  "main": "main.mjs",
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "dev": "electron .",
    "build:icon": "node scripts/build-icon.mjs",
    "pack": "electron-builder --dir --win",
    "dist": "electron-builder --win --publish never"
  },
  "dependencies": {
    "electron-updater": "6.8.9"
  },
  "devDependencies": {
    "electron": "43.2.0",
    "electron-builder": "26.15.3",
    "png-to-ico": "3.0.2",
    "sharp": "0.35.3"
  },
  "build": {
    "appId": "com.rempeyek.agentos",
    "productName": "Rempeyek Agent OS",
    "asar": true,
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.mjs",
      "preload.mjs",
      "server-process.mjs",
      "desktop-settings.mjs",
      "update-service.mjs",
      "security.mjs",
      "assets/**",
      "package.json"
    ],
    "extraResources": [
      {
        "from": "../web",
        "to": "app-root/apps/web",
        "filter": ["server.js", "lib/**", "public/**", "dist/**"]
      },
      {
        "from": "../../scripts",
        "to": "app-root/scripts",
        "filter": ["hermes-daily-bridge.cjs", "report.cjs"]
      },
      {
        "from": "../../marketplace/bundles",
        "to": "app-root/marketplace/bundles",
        "filter": ["hypertaks-agent/**"]
      },
      {
        "from": "../../package.json",
        "to": "app-root/package.json"
      }
    ],
    "win": {
      "icon": "assets/icon.ico",
      "target": [
        { "target": "nsis", "arch": ["x64"] },
        { "target": "portable", "arch": ["x64"] }
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "deleteAppDataOnUninstall": false
    },
    "publish": [
      {
        "provider": "github",
        "owner": "aabrur",
        "repo": "Rempeyek-Agent-OS",
        "releaseType": "release"
      }
    ]
  }
}
```

Add `apps/desktop` to root workspaces and the exact scripts asserted above.
Install and lock dependencies:

```powershell
npm install
```

Replace the “planned” desktop README with the actual runtime boundary and
commands. Create `scripts/build-icon.mjs` exactly around the reviewed source
asset and generate the icon before packaging:

```js
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(desktop, "..", "..");
const source = path.join(root, "apps", "web", "public", "brand", "logo.webp");
const target = path.join(desktop, "assets", "icon.ico");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "rempeyek-icon-"));
const sizes = [16, 32, 48, 64, 128, 256];

try {
  const pngs = await Promise.all(sizes.map(async size => {
    const output = path.join(temporary, `icon-${size}.png`);
    await sharp(source)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .png()
      .toFile(output);
    return output;
  }));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, await pngToIco(pngs));
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
```

This preserves color, crop, mark, and composition while producing only the
platform-required raster sizes. Keep the source asset unchanged and run:

```powershell
npm run build:icon --workspace @rempeyek/desktop
```

- [ ] **Step 4: Run the package contract and dependency audit**

```powershell
node --test apps/desktop/test/package-config.test.mjs
npm ls electron electron-builder electron-updater
npm audit
```

Expected: contract PASS; exact versions resolve; audit has no high or critical
production vulnerability. If npm reports a high/critical issue, stop and revise
the dependency choice before continuing.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json apps/desktop/package.json apps/desktop/README.md apps/desktop/scripts/build-icon.mjs apps/desktop/assets/icon.ico apps/desktop/test/package-config.test.mjs
git commit -m "build: add Electron desktop workspace"
```

---

### Task 2: Start the existing server on a random loopback port with a desktop token

**Files:**

- Create: `apps/desktop/server-process.mjs`
- Create: `apps/desktop/test/server-process.test.mjs`
- Modify: `apps/web/server.js:30-35,1574-1602,1778-1822`
- Modify: `apps/web/lib/access-policy.cjs`
- Modify: `apps/web/lib/access-policy.mjs`
- Modify: `apps/web/test/access-policy.test.mjs`
- Modify: `apps/web/test/server-lifecycle.test.mjs`

**Interfaces:**

- Produces: `startServerProcess({ forkImpl, execPath, serverPath, stateRoot,
  desktopToken, timeoutMs })`.
- Resolves: `{ child, origin, port, stop() }`.
- Child sends `{ type: "rempeyek:ready", port }`.
- Main-process-injected header: `x-desktop-session`.

- [ ] **Step 1: Write failing child-process tests**

```js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { startServerProcess } from "../server-process.mjs";

class FakeChild extends EventEmitter {
  killCalls = 0;
  kill() { this.killCalls += 1; }
}

test("server child resolves only after a valid ready message", async () => {
  const child = new FakeChild();
  const started = startServerProcess({
    forkImpl: () => child,
    execPath: "electron.exe",
    serverPath: "server.js",
    stateRoot: "C:\\State",
    desktopToken: "token",
    timeoutMs: 100,
  });
  child.emit("message", { type: "rempeyek:ready", port: 51999 });
  const result = await started;
  assert.equal(result.origin, "http://127.0.0.1:51999");
  result.stop();
  assert.equal(child.killCalls, 1);
});

test("startup rejects on timeout and kills the child", async () => {
  const child = new FakeChild();
  await assert.rejects(startServerProcess({
    forkImpl: () => child,
    execPath: "electron.exe",
    serverPath: "server.js",
    stateRoot: "C:\\State",
    desktopToken: "token",
    timeoutMs: 5,
  }), /did not become ready/);
  assert.equal(child.killCalls, 1);
});
```

- [ ] **Step 2: Write failing desktop access-policy tests**

```js
test("desktop mode requires the session token even on loopback", () => {
  const policy = createAccessPolicy({ DESKTOP_SESSION_TOKEN: "desktop-secret" });
  const missing = policy.authorize(request({ host: "127.0.0.1:4321" }));
  assert.equal(missing.status, 401);
  const allowed = request({ host: "127.0.0.1:4321" });
  allowed.headers["x-desktop-session"] = "desktop-secret";
  assert.equal(policy.authorize(allowed).allowed, true);
});
```

- [ ] **Step 3: Verify RED**

```powershell
node --test apps/desktop/test/server-process.test.mjs apps/web/test/access-policy.test.mjs
```

Expected: desktop process module missing and policy test FAIL.

- [ ] **Step 4: Implement child lifecycle**

```js
import { fork } from "node:child_process";

export function startServerProcess({
  forkImpl = fork,
  execPath,
  serverPath,
  stateRoot,
  desktopToken,
  timeoutMs = 15000,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = forkImpl(serverPath, [], {
      execPath,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: "0",
        DASH_HOST: "127.0.0.1",
        AGENT_STATE_DIR: stateRoot,
        DESKTOP_SESSION_TOKEN: desktopToken,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    let settled = false;
    const finishError = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const timer = setTimeout(() => finishError(new Error("local server did not become ready")), timeoutMs);
    child.once("error", finishError);
    child.once("exit", code => finishError(new Error(`local server exited before ready (${code})`)));
    child.on("message", message => {
      if (settled || message?.type !== "rempeyek:ready" || !Number.isInteger(message.port) || message.port < 1) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        child,
        port: message.port,
        origin: `http://127.0.0.1:${message.port}`,
        stop: () => child.kill(),
      });
    });
  });
}
```

In `server.js`, parse `PORT` as a number, permit `0`, and inside the listen
callback compute `server.address().port`. Send the ready message when
`process.send` exists.

In access policy, when `DESKTOP_SESSION_TOKEN` is non-empty, require a
constant-time exact `x-desktop-session` header before ordinary local/remote
policy. Mirror the change in CJS and ESM.

Do not change `api.js`: Electron injects the session header below the renderer
network layer in Task 3. No DOM script, local storage entry, preload property,
command-line argument, log, or error payload contains the token.

- [ ] **Step 5: Verify**

```powershell
node --test apps/desktop/test/server-process.test.mjs apps/web/test/access-policy.test.mjs apps/web/test/server-lifecycle.test.mjs
npm test
```

Expected: focused tests and full suite PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop/server-process.mjs apps/desktop/test/server-process.test.mjs apps/web/server.js apps/web/lib/access-policy.cjs apps/web/lib/access-policy.mjs apps/web/test/access-policy.test.mjs apps/web/test/server-lifecycle.test.mjs
git commit -m "feat: isolate the desktop local server"
```

---

### Task 3: Add the secure Electron main process, preload bridge, single instance, and tray behavior

**Files:**

- Create: `apps/desktop/security.mjs`
- Create: `apps/desktop/preload.mjs`
- Create: `apps/desktop/main.mjs`
- Create: `apps/desktop/test/security.test.mjs`

**Interfaces:**

- Produces: `isAllowedExternalUrl(value)`,
  `isAllowedLocalNavigation(value, origin)`, and
  `withDesktopSessionHeader(details, origin, token)`.
- Preload API:
  - `getRuntime()`;
  - `getSettings()`;
  - `updateSettings(patch)`;
  - `checkForUpdates()`;
  - `restartToUpdate()`;
  - `openPath(kind)`;
  - `openExternal(url)`;
  - `onUpdateState(listener)`.

- [ ] **Step 1: Write failing security tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedExternalUrl,
  isAllowedLocalNavigation,
  withDesktopSessionHeader,
} from "../security.mjs";

test("external links allow only http and https", () => {
  assert.equal(isAllowedExternalUrl("https://github.com/aabrur/Rempeyek-Agent-OS"), true);
  assert.equal(isAllowedExternalUrl("http://127.0.0.1:4321"), true);
  assert.equal(isAllowedExternalUrl("file:///C:/secret"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
});

test("window navigation stays on the owned local origin", () => {
  assert.equal(isAllowedLocalNavigation("http://127.0.0.1:51999/settings", "http://127.0.0.1:51999"), true);
  assert.equal(isAllowedLocalNavigation("http://127.0.0.1:52000", "http://127.0.0.1:51999"), false);
  assert.equal(isAllowedLocalNavigation("https://example.com", "http://127.0.0.1:51999"), false);
});

test("session header is injected only for the exact owned origin", () => {
  const owned = withDesktopSessionHeader({
    url: "http://127.0.0.1:51999/api/state",
    requestHeaders: { Accept: "application/json" },
  }, "http://127.0.0.1:51999", "secret-value");
  assert.equal(owned["x-desktop-session"], "secret-value");
  const external = withDesktopSessionHeader({
    url: "https://example.com/",
    requestHeaders: { Accept: "text/html" },
  }, "http://127.0.0.1:51999", "secret-value");
  assert.equal(Object.hasOwn(external, "x-desktop-session"), false);
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/desktop/test/security.test.mjs
```

Expected: security module missing.

- [ ] **Step 3: Implement URL guards and narrow preload**

```js
export function isAllowedExternalUrl(value) {
  try { return new Set(["http:", "https:"]).has(new URL(value).protocol); }
  catch { return false; }
}

export function isAllowedLocalNavigation(value, origin) {
  try { return new URL(value).origin === origin; }
  catch { return false; }
}

export function withDesktopSessionHeader(details, origin, token) {
  const headers = { ...(details.requestHeaders || {}) };
  if (isAllowedLocalNavigation(details.url, origin)) {
    headers["x-desktop-session"] = token;
  } else {
    delete headers["x-desktop-session"];
  }
  return headers;
}
```

`preload.mjs` exposes only the named IPC methods, copies update payloads before
invoking a listener, and returns an unsubscribe function. It does not expose
the desktop token, `ipcRenderer`, `require`, filesystem APIs, environment
variables, process arguments, or arbitrary channels.

- [ ] **Step 4: Implement the main lifecycle**

`main.mjs`:

1. calls `app.requestSingleInstanceLock()` before `ready`;
2. generates `crypto.randomBytes(32).toString("hex")`;
3. starts the server from
   `app.isPackaged ? path.join(process.resourcesPath, "app-root", "apps", "web", "server.js") : path.resolve(import.meta.dirname, "../web/server.js")`;
4. registers `session.defaultSession.webRequest.onBeforeSendHeaders` for the
   exact owned origin and calls `withDesktopSessionHeader`; no other origin
   receives or may retain `x-desktop-session`;
5. creates one BrowserWindow with:

```js
webPreferences: {
  preload: path.join(import.meta.dirname, "preload.mjs"),
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
}
```

6. loads the local origin only after the child is ready;
7. denies `setWindowOpenHandler` and opens allowed external URLs with
   `shell.openExternal`;
8. prevents navigation away from the local origin;
9. focuses/restores the existing window on `second-instance`;
10. uses the existing brand icon for BrowserWindow and Tray;
11. applies close behavior from settings: tray hides, exit quits;
12. kills the owned server exactly once on `before-quit`.

The only native failure UI is `dialog.showMessageBox` with Retry, Open Logs,
and Exit after a server startup failure. It contains no application redesign.

- [ ] **Step 5: Verify**

```powershell
npm run build
npm run test:desktop
```

Then run:

```powershell
npm run desktop:dev
```

Expected:

- one window shows the existing UI;
- second launch focuses it;
- external links open in the system browser;
- `file:`, `javascript:`, and cross-origin navigation are blocked;
- closing follows the configured tray/exit behavior;
- exiting leaves no owned server process.

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop/security.mjs apps/desktop/preload.mjs apps/desktop/main.mjs apps/desktop/test/security.test.mjs
git commit -m "feat: add secure Electron application shell"
```

---

### Task 4: Add atomic desktop settings and native runtime IPC

**Files:**

- Create: `apps/desktop/desktop-settings.mjs`
- Create: `apps/desktop/test/desktop-settings.test.mjs`
- Modify: `apps/desktop/main.mjs`
- Modify: `apps/desktop/preload.mjs`

**Interfaces:**

- Produces: `createDesktopSettingsStore(filePath, deps)`.
- Defaults:
  - `autoCheck: true`;
  - `autoDownload: true`;
  - `updateChannel: "stable"`;
  - `launchAtLogin: false`;
  - `closeBehavior: "tray"`;
  - `startMinimized: false`;
  - `nativeNotifications: true`.

- [ ] **Step 1: Write failing settings tests**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDesktopSettingsStore } from "../desktop-settings.mjs";

test("desktop settings bootstrap and accept only allowlisted values", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-desktop-settings-"));
  const file = path.join(root, "desktop-settings.json");
  const store = createDesktopSettingsStore(file);
  assert.deepEqual(store.read(), {
    autoCheck: true,
    autoDownload: true,
    updateChannel: "stable",
    launchAtLogin: false,
    closeBehavior: "tray",
    startMinimized: false,
    nativeNotifications: true,
  });
  const next = store.update({ launchAtLogin: true, closeBehavior: "exit", injected: "no" });
  assert.equal(next.launchAtLogin, true);
  assert.equal(next.closeBehavior, "exit");
  assert.equal(Object.hasOwn(next, "injected"), false);
  assert.throws(() => store.update({ updateChannel: "nightly" }), /updateChannel/);
  fs.rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/desktop/test/desktop-settings.test.mjs
```

Expected: module missing.

- [ ] **Step 3: Implement atomic preferences**

Write a sibling temp file, fsync it, then rename over
`userData/desktop-settings.json`. Validate booleans, `stable|preview`,
and `tray|exit`; ignore unknown keys.

- [ ] **Step 4: Register exact IPC handlers**

Main handlers:

- `desktop:get-runtime` returns `{ desktop: true, packaged, version, platform,
  arch, userDataPath, vaultPath, stateRoot }`;
- `desktop:get-settings` returns the allowlisted document;
- `desktop:update-settings` validates and persists, then calls
  `app.setLoginItemSettings({ openAtLogin, args: ["--hidden"] })`;
- `desktop:open-path` maps only `state`, `vault`, and `logs` to server-resolved
  paths and calls `shell.openPath`;
- `desktop:open-external` validates with `isAllowedExternalUrl`.

No handler accepts an arbitrary local path or IPC channel.

- [ ] **Step 5: Verify**

```powershell
npm run test:desktop
npm run desktop:dev
```

Expected: settings persist across restart; launch-at-login state matches the
stored toggle; Open Folder actions resolve only the three mapped locations.

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop/desktop-settings.mjs apps/desktop/test/desktop-settings.test.mjs apps/desktop/main.mjs apps/desktop/preload.mjs
git commit -m "feat: persist desktop runtime settings"
```

---

### Task 5: Implement the packaged updater as an injected state machine

**Files:**

- Create: `apps/desktop/update-service.mjs`
- Create: `apps/desktop/test/update-service.test.mjs`
- Modify: `apps/desktop/main.mjs`
- Modify: `apps/desktop/preload.mjs`

**Interfaces:**

- Produces: `createUpdateService({ autoUpdater, settingsStore, lifecycleBusy,
  emit, now, setIntervalImpl, clearIntervalImpl })`.
- States: `idle`, `checking`, `available`, `downloading`, `ready`,
  `not-available`, `error`.
- Public methods: `start()`, `checkNow()`, `restartToUpdate()`, `stop()`,
  `snapshot()`.

- [ ] **Step 1: Write failing updater tests**

```js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createUpdateService } from "../update-service.mjs";

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  allowPrerelease = false;
  checks = 0;
  downloads = 0;
  installs = 0;
  checkForUpdates() { this.checks += 1; return Promise.resolve(); }
  downloadUpdate() { this.downloads += 1; return Promise.resolve(); }
  quitAndInstall() { this.installs += 1; }
}

test("stable updater checks, downloads, and waits for approved restart", async () => {
  const autoUpdater = new FakeUpdater();
  const emitted = [];
  const service = createUpdateService({
    autoUpdater,
    settingsStore: { read: () => ({ autoCheck: true, autoDownload: true, updateChannel: "stable" }) },
    lifecycleBusy: () => false,
    emit: state => emitted.push(state),
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  });
  service.start();
  assert.equal(autoUpdater.checks, 1);
  autoUpdater.emit("update-available", { version: "2.3.0" });
  assert.equal(autoUpdater.downloads, 1);
  autoUpdater.emit("update-downloaded", { version: "2.3.0" });
  assert.equal(service.snapshot().phase, "ready");
  assert.equal(autoUpdater.installs, 0);
  await service.restartToUpdate();
  assert.equal(autoUpdater.installs, 1);
  assert.equal(emitted.some(state => state.phase === "ready"), true);
});

test("update application is blocked while lifecycle mutation is active", async () => {
  const autoUpdater = new FakeUpdater();
  const service = createUpdateService({
    autoUpdater,
    settingsStore: { read: () => ({ autoCheck: true, autoDownload: true, updateChannel: "stable" }) },
    lifecycleBusy: async () => true,
    emit: () => {},
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  });
  service.start();
  autoUpdater.emit("update-downloaded", { version: "2.3.0" });
  await assert.rejects(service.restartToUpdate(), /lifecycle operation/);
  assert.equal(autoUpdater.installs, 0);
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test apps/desktop/test/update-service.test.mjs
```

Expected: module missing.

- [ ] **Step 3: Implement updater policy**

Implementation requirements:

```js
const SIX_HOURS = 6 * 60 * 60 * 1000;

export function createUpdateService({
  autoUpdater,
  settingsStore,
  lifecycleBusy,
  emit,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  let state = { phase: "idle", version: null, error: null, checkedAt: null };
  let timer = null;
  const publish = patch => {
    state = { ...state, ...patch };
    emit({ ...state });
  };
  const checkNow = async () => {
    publish({ phase: "checking", error: null, checkedAt: new Date().toISOString() });
    try { await autoUpdater.checkForUpdates(); }
    catch (error) { publish({ phase: "error", error: error.message }); }
    return { ...state };
  };
  autoUpdater.on("update-available", info => {
    publish({ phase: "available", version: info.version });
    if (settingsStore.read().autoDownload) {
      publish({ phase: "downloading" });
      autoUpdater.downloadUpdate().catch(error => publish({ phase: "error", error: error.message }));
    }
  });
  autoUpdater.on("update-not-available", () => publish({ phase: "not-available" }));
  autoUpdater.on("download-progress", progress => publish({ phase: "downloading", percent: Math.round(progress.percent || 0) }));
  autoUpdater.on("update-downloaded", info => publish({ phase: "ready", version: info.version, percent: 100 }));
  autoUpdater.on("error", error => publish({ phase: "error", error: error.message }));
  return {
    start() {
      const settings = settingsStore.read();
      autoUpdater.autoDownload = false;
      autoUpdater.allowPrerelease = settings.updateChannel === "preview";
      if (settings.autoCheck) checkNow();
      timer = setIntervalImpl(() => { if (settingsStore.read().autoCheck) checkNow(); }, SIX_HOURS);
    },
    checkNow,
    async restartToUpdate() {
      if (state.phase !== "ready") throw new Error("no downloaded update is ready");
      if (await lifecycleBusy()) throw new Error("finish the active lifecycle operation before restarting");
      autoUpdater.quitAndInstall(false, true);
    },
    stop() { if (timer !== null) clearIntervalImpl(timer); },
    snapshot() { return { ...state }; },
  };
}
```

Main broadcasts `desktop:update-state`; preload maps check/restart IPC and
subscription. Start the updater only after the local page emits
`did-finish-load`. In development, return `{ phase: "idle", development: true }`
and do not contact release feeds.

Main supplies an async `lifecycleBusy` function that requests
`GET /api/agents/lifecycle` from its owned loopback origin with
`x-desktop-session`; a network/error response is treated as busy and blocks
restart. The updater never trusts renderer-provided busy state.

- [ ] **Step 4: Verify**

```powershell
npm run test:desktop
```

Expected: all desktop tests PASS; restart is never invoked before ready or while
lifecycle state is busy.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/update-service.mjs apps/desktop/test/update-service.test.mjs apps/desktop/main.mjs apps/desktop/preload.mjs
git commit -m "feat: add verified desktop update lifecycle"
```

---

### Task 6: Replace the source updater shell and integrate desktop update/settings UI

**Files:**

- Create: `apps/web/lib/source-update.mjs`
- Create: `apps/web/test/source-update.test.mjs`
- Create: `apps/web/src/lib/desktop-runtime.mjs`
- Create: `apps/web/test/desktop-runtime.test.mjs`
- Modify: `apps/web/server.js:1052-1076,1721-1726`
- Modify: `apps/web/src/components/UpdateBanner.jsx`
- Modify: `apps/web/src/views/SettingsView.jsx`

**Interfaces:**

- Produces: `sourceUpdateSteps(root, platform)` and
  `runSourceUpdate({ root, platform, execFileImpl, onLine })`.
- Produces: `desktopRuntime(bridge)` with a browser-safe null implementation.
- Existing UpdateBanner remains the only update banner.

- [ ] **Step 1: Write failing typed source-update tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { runSourceUpdate, sourceUpdateSteps } from "../lib/source-update.mjs";

test("source update uses fixed sequential commands and no shell", () => {
  assert.deepEqual(sourceUpdateSteps("C:\\repo", "win32"), [
    { program: "git", args: ["status", "--porcelain"], cwd: "C:\\repo", expectEmpty: true },
    { program: "git", args: ["pull", "--ff-only"], cwd: "C:\\repo" },
    { program: "npm.cmd", args: ["ci"], cwd: "C:\\repo" },
    { program: "npm.cmd", args: ["run", "build"], cwd: "C:\\repo" },
  ]);
});

test("dirty checkout stops before pull", async () => {
  const calls = [];
  await assert.rejects(runSourceUpdate({
    root: "C:\\repo",
    platform: "win32",
    execFileImpl(program, args, options, callback) {
      calls.push({ program, args, options });
      callback(null, " M apps/web/server.js\n", "");
    },
    onLine: () => {},
  }), /working tree is not clean/);
  assert.equal(calls.length, 1);
  assert.equal(Object.hasOwn(calls[0].options, "shell"), false);
});
```

- [ ] **Step 2: Write failing desktop-runtime selection tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { desktopRuntime } from "../src/lib/desktop-runtime.mjs";

test("browser runtime is explicit and inert", async () => {
  const runtime = desktopRuntime(null);
  assert.equal(runtime.desktop, false);
  assert.deepEqual(await runtime.getSettings(), null);
});

test("desktop runtime delegates only the narrow bridge", async () => {
  const runtime = desktopRuntime({
    getRuntime: async () => ({ desktop: true, packaged: true }),
    getSettings: async () => ({ autoCheck: true }),
  });
  assert.equal(runtime.desktop, true);
  assert.deepEqual(await runtime.getSettings(), { autoCheck: true });
});
```

- [ ] **Step 3: Verify RED**

```powershell
node --test apps/web/test/source-update.test.mjs apps/web/test/desktop-runtime.test.mjs
```

Expected: both modules missing.

- [ ] **Step 4: Implement sequential source update**

Use `execFile` once per step, stream bounded stdout/stderr lines through
`onLine`, reject dirty status before pull, and never pass `shell`. In
`server.js`, replace `startUpdate` shell spawn with this runner while retaining
the existing owned process log contract.

Implement `apps/web/lib/source-update.mjs` with the fixed command graph and a
bounded output adapter:

```js
import { execFile } from "node:child_process";

const MAX_BUFFER = 2 * 1024 * 1024;
const MAX_LINE = 4_096;

export function sourceUpdateSteps(root, platform = process.platform) {
  const npm = platform === "win32" ? "npm.cmd" : "npm";
  return [
    { program: "git", args: ["status", "--porcelain"], cwd: root, expectEmpty: true },
    { program: "git", args: ["pull", "--ff-only"], cwd: root },
    { program: npm, args: ["ci"], cwd: root },
    { program: npm, args: ["run", "build"], cwd: root },
  ];
}

function boundedLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 1_000)
    .map(line => line.slice(0, MAX_LINE));
}

function runStep(step, execFileImpl, onLine) {
  return new Promise((resolve, reject) => {
    execFileImpl(step.program, step.args, {
      cwd: step.cwd,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
    }, (error, stdout = "", stderr = "") => {
      for (const line of [...boundedLines(stdout), ...boundedLines(stderr)]) onLine(line);
      if (error) return reject(error);
      if (step.expectEmpty && String(stdout).trim()) {
        return reject(new Error("working tree is not clean"));
      }
      resolve();
    });
  });
}

export async function runSourceUpdate({
  root,
  platform = process.platform,
  execFileImpl = execFile,
  onLine = () => {},
}) {
  for (const step of sourceUpdateSteps(root, platform)) {
    await runStep(step, execFileImpl, onLine);
  }
}
```

- [ ] **Step 5: Integrate the existing banner and Settings**

`desktopRuntime(globalThis.window?.rempeyekDesktop)` selects behavior:

- packaged desktop: subscribe to updater state; Update now calls
  `checkForUpdates`; when ready, the existing button says `Restart to update`
  and calls `restartToUpdate`;
- browser/source checkout: keep GitHub release checking and call the typed
  `/api/update` route;
- development Electron: show version facts, no update banner unless the bridge
  reports an available test update.

Settings keeps existing panels and adds rows to `SOFTWARE` for channel, last
check, state, and check/restart buttons. Add existing-style panels:

- `DESKTOP & STARTUP`: launch at login, close-to-tray versus exit, start
  minimized, and native notifications, all backed by `desktop-settings.mjs`;
- `STORAGE & RECOVERY`: preserve the web plan's state/vault/log paths, backup
  restore, tombstones, log retention, Clear Logs preview, and diagnostics;
  desktop additionally maps Open Folder through the three fixed preload targets;
- `PRIVACY & EXECUTION`: preserve anonymous telemetry off-by-default, provider
  variable names/detected flags, approval audit summary, and UI-preference reset.

Controls map only to the exact preload methods. Browser mode renders the current
runtime settings from `GET /api/settings/runtime` and hides native-only controls.
Packaged mode composes the same server snapshot with native settings; it does not
duplicate storage or privacy state in `desktop-settings.json`. No CSS or
navigation changes.

- [ ] **Step 6: Verify**

```powershell
node --test apps/web/test/source-update.test.mjs apps/web/test/desktop-runtime.test.mjs
npm test
npm run build
npm run test:desktop
```

Expected: all tests and build PASS; `rg -n "shell: true" apps/web/server.js`
finds no source updater or agent installer.

Browser and desktop QA:

- source banner still performs approval and live log tail;
- packaged bridge shows checking/downloading/ready/error;
- restart is a distinct user action;
- all four themes retain the same visual structure;
- no console errors.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/lib/source-update.mjs apps/web/test/source-update.test.mjs apps/web/src/lib/desktop-runtime.mjs apps/web/test/desktop-runtime.test.mjs apps/web/server.js apps/web/src/components/UpdateBanner.jsx apps/web/src/views/SettingsView.jsx
git commit -m "feat: integrate desktop and source updates"
```

---

### Task 7: Package Windows artifacts and harden CI/release metadata

**Files:**

- Create: `apps/desktop/test/package-contents.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/public-release-audit.mjs`
- Modify: `package.json`
- Modify: all workspace `package.json` versions only when preparing an approved release

**Interfaces:**

- Release artifacts: NSIS `.exe`, portable `.exe`, `.blockmap`, and
  `latest.yml`.
- CI never publishes; release workflow publishes only on an explicitly pushed
  matching `v*` tag.

- [ ] **Step 1: Write the failing package-content test**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("packaged app contains required runtime and excludes user data", () => {
  const root = path.resolve("apps/desktop/dist/win-unpacked/resources");
  assert.equal(fs.existsSync(path.join(root, "app-root", "apps", "web", "server.js")), true);
  assert.equal(fs.existsSync(path.join(root, "app-root", "apps", "web", "dist", "index.html")), true);
  const names = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else names.push(path.relative(root, full).replaceAll("\\", "/"));
    }
  };
  walk(root);
  for (const forbidden of ["agents.config.json", "Obsidian Vault/", "telemetry/", ".env", "checkpoint.md"]) {
    assert.equal(names.some(name => name.includes(forbidden)), false, forbidden);
  }
  assert.equal(
    fs.existsSync(path.join(root, "app-root", "marketplace", "bundles", "hypertaks-agent", "bundle.manifest.json")),
    true,
  );
});
```

- [ ] **Step 2: Verify RED before package**

```powershell
node --test apps/desktop/test/package-contents.test.mjs
```

Expected: FAIL because `win-unpacked` does not exist.

- [ ] **Step 3: Extend CI**

`ci.yml` runs on Ubuntu:

```yaml
- run: npm ci
- run: npm test
- run: npm run test:desktop
- run: npm run build
- run: npm run audit:public
```

Add a `desktop-package` job on `windows-latest`:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: npm
- run: npm ci
- run: npm test
- run: npm run test:desktop
- run: npm run build
- run: npm run desktop:pack
- run: node --test apps/desktop/test/package-contents.test.mjs
```

- [ ] **Step 4: Extend release workflow**

Use `windows-latest`, run all gates, build with `npm run desktop:dist`, then
upload only:

```text
apps/desktop/dist/*.exe
apps/desktop/dist/*.blockmap
apps/desktop/dist/latest.yml
```

Set `CSC_LINK` and `CSC_KEY_PASSWORD` only from repository secrets. Split the
workflow into an unsigned `workflow_dispatch` packaging path and a signed tag
release path:

- `workflow_dispatch` may upload the unsigned files only as a short-retention
  GitHub Actions artifact named `unsigned-desktop-test`; it never creates a
  GitHub Release and its job summary says `TEST ONLY - UNSIGNED`;
- a `v*` tag must fail before `electron-builder` when either signing secret is
  absent;
- only the signed tag path may create a non-draft GitHub Release and upload
  `latest.yml`;
- before upload, PowerShell runs `Get-AuthenticodeSignature` against both
  executables, requires `Status -eq "Valid"`, and compares the signer subject
  with the configured publisher;
- parse `latest.yml` and require a non-empty SHA-512 for every published file.

This prevents an unsigned package from ever becoming the stable updater feed.

- [ ] **Step 5: Build and test local package**

```powershell
npm run build
npm run desktop:pack
node --test apps/desktop/test/package-contents.test.mjs
npm run audit:public
```

Expected: unpacked app includes the server and Vite build, excludes every
forbidden user/runtime path, and public audit passes.

- [ ] **Step 6: Commit**

```powershell
git add .github/workflows/ci.yml .github/workflows/release.yml scripts/public-release-audit.mjs package.json apps/desktop/test/package-contents.test.mjs
git commit -m "ci: verify Windows desktop packages"
```

Do not create or push a release tag in this task.

---

### Task 8: Run clean-machine desktop acceptance and close the release-ready handoff

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/Architecture.md`
- Modify: `docs/Roadmap.md`
- Modify: `apps/desktop/README.md`
- Modify: `checkpoint.md`
- Modify: configured vault `Projects/Agentic OS Checkpoint.md`
- Modify: configured vault daily Codex log and Codex memory
- Modify: temporary handoff note

**Interfaces:**

- Produces the evidence required to call the desktop implementation
  release-ready.
- Does not publish, sign, tag, or deploy.

- [ ] **Step 1: Run the complete local gate**

```powershell
npm ci
npm test
npm run test:desktop
npm run build
npm run desktop:pack
node --test apps/desktop/test/package-contents.test.mjs
npm run audit:public
git diff --check
```

Expected: every command exits `0`; no skipped test is introduced by this work.

- [ ] **Step 2: Run a clean Windows acceptance flow**

Use a disposable Windows user or VM with no existing Rempeyek state:

1. install the NSIS artifact;
2. launch and confirm one existing-design window;
3. confirm state is created under that user's Local AppData;
4. register one link-only agent and one test fixture adapter without installing
   a real paid/proprietary agent;
5. create and remove/restore one profile;
6. create one subagent and verify its lane;
7. relaunch and verify state persists;
8. launch a second instance and verify focus returns to the first;
9. exercise tray/exit and launch-at-login;
10. inject a signed/checksummed test update feed or mocked updater and verify
    check → download → ready → approved restart;
11. uninstall the application and verify user state remains.

Record exact installer hash, OS build, application version, state path, API
probe results, screenshots, console state, and residual processes. Evidence
stays outside tracked public assets.

- [ ] **Step 3: Run design-lock regression**

Compare web and desktop at the same viewport in Cyberpunk, Minimalist,
Brutalist, and Glassmorph:

- same navigation and page layout;
- same Agent Map and profile geometry;
- same tokens, fonts, colors, spacing, and effects;
- only requested controls/content differ;
- reduced-motion behavior and keyboard traversal match;
- no console errors.

- [ ] **Step 4: Update documentation and honest boundaries**

Document:

- Windows x64 installer and portable artifact;
- state/vault locations using `%LOCALAPPDATA%` and `%USERPROFILE%`;
- tray/startup behavior;
- stable/preview channel behavior;
- update check/download/restart semantics;
- source-checkout update difference;
- application uninstall retains user data;
- signing status and exact remaining external credential boundary.

Do not state macOS/Linux support, a published release, or signed status without
matching evidence.

- [ ] **Step 5: Update Graphify, checkpoints, and handoff**

If the graph exists:

```powershell
graphify update .
```

Append phase completion, command outputs, package hash, clean-machine result,
design regression, signing boundary, and remaining publication authority to
the public checkpoint, configured Obsidian checkpoint, Codex daily log, Codex
memory, and temporary handoff.

- [ ] **Step 6: Final implementation commit**

```powershell
git add README.md CHANGELOG.md docs/Architecture.md docs/Roadmap.md apps/desktop/README.md checkpoint.md
git commit -m "docs: close desktop release readiness"
```

Do not stage vault or temporary handoff files. Do not push, tag, publish, deploy,
or make the repository public without the user's next explicit approval.
