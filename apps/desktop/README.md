# Rempeyek Agent OS Desktop

The desktop workspace packages the existing `apps/web` renderer and
dependency-free Node control plane in Electron. It adds native process,
single-instance, tray, settings, and verified update boundaries without adding
or redesigning product UI.

## Commands

```powershell
npm run test:desktop
npm run desktop:dev
npm run desktop:pack
npm run desktop:dist
```

`desktop:pack` creates an unpacked local test application. `desktop:dist`
creates local Windows artifacts with publishing disabled. Unsigned artifacts
are test builds only and must not be described or distributed as signed stable
releases.

## Runtime boundary

- Electron main starts one owned server child on `127.0.0.1` with an
  operating-system-assigned port.
- Private registry, vault, telemetry, logs, receipts, native settings, and
  update state live under Electron `userData`.
- A random desktop-session header is injected below renderer and preload
  access.
- Renderer Node integration is disabled, context isolation and web security
  remain enabled, and navigation/window creation is allowlisted.
- Packaged files under `resources/app-root` are read-only application assets.
- Applying a verified update always requires an approved restart.

See the approved implementation plan in
[`docs/superpowers/plans/2026-07-24-electron-desktop-auto-update.md`](../../docs/superpowers/plans/2026-07-24-electron-desktop-auto-update.md).
