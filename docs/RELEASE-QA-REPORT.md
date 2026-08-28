# Rempeyek Agent OS 2.4.7 Release QA Report

## Executive Summary

- **Release version:** `2.4.7`
- **Date:** 2026-08-28
- **Classification:** Windows agent-launcher reliability fix
- **Target:** Windows x64 desktop with local Node server
- **Signing:** unsigned local executables; users must verify `SHA256SUMS.txt`

## Source Scope

- Base `origin/main`: `92848c077dba08253008c9f30be444b8243f537c`
- Product versions: root, web, desktop, runtime constant, and lockfile workspaces are `2.4.7`
- Independently versioned `packages/*` remain `2.1.0`
- No UI or design changes are included

## Fixes

- A pidless Windows `spawn()` followed by asynchronous `ENOENT` is contained in the affected process record instead of reaching the server-level `uncaughtException` shutdown path.
- Managed runtime and Marketplace execution use the same Windows launcher resolver.
- Bare commands resolve supported `.com`, `.exe`, `.bat`, `.cmd`, and `.ps1` files from the managed working directory and `PATH`; extensionless Unix shims are ignored.
- `.cmd` and `.bat` files use the absolute `SystemRoot\System32\cmd.exe`; `.ps1` files use the absolute Windows PowerShell host with structured arguments and `shell: false`.
- Unsafe command-script metacharacters fail closed, and late exit events cannot erase an earlier launch failure.

## Verification

| Gate | Result | Evidence |
|---|---|---|
| `npm test` after version bump and fixture repair | PASSED | 444/444 |
| `npm run test:desktop` after version bump | PASSED | 42/42 |
| Focused Windows runtime regression | PASSED | 33/33 |
| `npm run desktop:dist` | PASSED | Vite 6.4.3, 2103 modules, electron-builder 26.15.3 |
| `npm run desktop:test-package` | PASSED | 4/4 |
| `npm run test:e2e` | PASSED | Playwright Chromium 3/3, desktop 1440x900 and mobile 390x844 |
| `npm run audit:public` | PASSED | 439 tracked paths |
| `npm run audit:release` | PASSED | production 0, reviewed development high 0 |
| `npm run audit:version` | PASSED | all product workspaces `2.4.7` |
| Release artifact integrity | PASSED | Setup, Portable, blockmap, `latest.yml`, and checksums |

The first post-bump web run exposed one stale hard-coded `2.4.6` fixture in the release-integrity test. The fixture now derives its names from `APP_VERSION`; its focused and complete web reruns passed.

## Local Windows Artifacts

- Setup: `Rempeyek-Agent-OS-Setup-2.4.7.exe`
  - Size: 101416596 bytes
  - SHA-256: `0C9B2DB4BADFEAAE5146DD8A3DF055AD3FC4ED6450921361848A85975DBA82AE`
- Portable: `Rempeyek-Agent-OS-Portable-2.4.7.exe`
  - Size: 101097095 bytes
  - SHA-256: `01D3F1BA0FE74E7C85E037620D2EA535DDC5D956839796BD186EA8F3A40E33A2`
- Authenticode status: `NotSigned`
- Local archive: `dist-release/v2.4.7-artifacts`

## Publication Status

The source commit, tag, GitHub workflow, public asset hashes, and root installer synchronization are pending. This section must be replaced with observed public-release evidence after `v2.4.7` publication.
