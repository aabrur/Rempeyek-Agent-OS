# Rempeyek Agent OS Desktop

The desktop workspace packages the existing `apps/web` renderer and
dependency-free Node control plane in Electron. It adds native process,
single-instance, tray, settings, and verified-update boundaries without
redesigning the product UI.

## Commands

```powershell
npm run test:desktop
npm run desktop:dev
npm run desktop:pack
npm run desktop:dist
npm run desktop:test-package
```

- `desktop:pack` creates `dist\win-unpacked\` for local runtime testing.
- `desktop:dist` creates unsigned Windows x64 NSIS and portable artifacts with
  publishing disabled.
- `desktop:test-package` checks the packaged runtime boundary and, when
  `latest.yml` exists, verifies that its installer filename exists and its
  recorded SHA-512 matches the file bytes.

Generated output is ignored by Git. Unsigned artifacts are local test builds
only and must not be described or distributed as signed stable releases.

## Runtime and security boundary

- Electron main starts one owned Node server child on `127.0.0.1` with an
  operating-system-assigned port and waits for an IPC readiness message.
- The child drops inherited source-path and remote-dashboard overrides before
  main applies its fixed Local AppData, loopback, random-port, and private
  session values.
- A random desktop-session header is passed only through the owned child's
  environment and injected for the exact owned origin below renderer/preload
  access.
- Renderer Node integration is disabled. Context isolation, sandboxing, and web
  security remain enabled; navigation and child-window creation are guarded.
- The CommonJS preload exposes only fixed runtime, settings, path-opening, and
  update methods. It does not expose the desktop token, Node, a generic IPC
  primitive, an arbitrary path, or an arbitrary executable.
- The application is single-instance. A second launch focuses/restores the
  existing window.
- Closing the window follows the selected Exit or Minimize-to-tray preference.
  The tray menu can show the window or fully quit the owned runtime.
- Launch-at-login is opt-in and uses only the fixed `--hidden` argument.

## State and retention

Desktop state resolves to:

```text
%LOCALAPPDATA%\Rempeyek-Agent-OS
```

The registry, vault, telemetry, logs, avatars, Marketplace receipts,
desktop-native settings, and update state stay under that per-user root.
Packaged application assets under `resources\app-root` are read-only. User
profiles may still point at reviewed homes or skills under `%USERPROFILE%`.

The NSIS target sets `deleteAppDataOnUninstall: false`. Uninstalling the
application therefore retains the Local AppData root, including vault and agent
state. Profile Remove/Restore semantics remain independent from installed
software and preserve retained data.

## Update behavior

- **Stable** ignores prereleases; **Preview** allows prerelease versions.
- Update-available and update-ready native notifications honor the desktop
  preference and deduplicate repeated milestones.
- Automatic checks are optional. Check and download do not install anything.
- A downloaded update enters `ready`; applying it requires a separate approved
  restart.
- Restart is blocked if the owned lifecycle endpoint reports an active mutation
  or cannot be verified safely.
- Development Electron never contacts a release feed.
- A source checkout uses a different updater: fixed sequential
  `git status --porcelain`, `git pull --ff-only`, `npm ci`, and build processes.
  A dirty tree stops before pull, and no shell chain is executed.

## Packaging and publication

The package targets are:

```text
Rempeyek-Agent-OS-Setup-<version>.exe
Rempeyek-Agent-OS-Portable-<version>.exe
```

CI tests source behavior and the unpacked Windows package but cannot publish.
The manual package workflow uploads only a short-retention
`unsigned-desktop-test` artifact. A public stable update requires a pushed
version tag plus externally provisioned signing credentials, matching publisher
identity, valid Authenticode on both executables, exact tag/workspace version
parity, and non-empty matching SHA-512 metadata. Release actions are pinned to
full commit SHAs, signing secrets are step-scoped, prerelease tags cannot become
stable latest, and the reviewed development audit graph is protected by an
expiring exact advisory fingerprint.

## Current acceptance boundary

The 2.2.0 local candidate was exercised on Windows 11 Home Single Language x64,
build 26200, using an isolated Local AppData root:

- packaged renderer loaded the existing command deck with all four themes;
- bridge/runtime/settings IPC, persistence across relaunch, one owned server,
  one renderer, single-instance rejection, and graceful shutdown passed;
- Node and `require` were absent from renderer JavaScript;
- Settings rendered without horizontal overflow and the console had no errors;
- NSIS and portable files were generated, package contents passed, and
  `latest.yml` SHA-512 matched the installer;
- both executables reported `NotSigned`.

Windows Sandbox was unavailable on the acceptance host. The NSIS
install/uninstall flow, real tray/login integration under a disposable user,
and a signed end-to-end updater feed were therefore not clean-machine
certified. The updater transition and mutation-blocking behavior are covered by
injected tests, but this local candidate is not a signed or published release.

See the approved implementation plan in
[`docs/superpowers/plans/2026-07-24-electron-desktop-auto-update.md`](../../docs/superpowers/plans/2026-07-24-electron-desktop-auto-update.md).
