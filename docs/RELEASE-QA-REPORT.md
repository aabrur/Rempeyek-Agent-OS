# Rempeyek Agent OS 2.4.6 Release QA Report

## Executive Summary
- **Release Version:** `2.4.6`
- **Classification:** maintenance refresh of the existing `v2.4.6` GitHub Release (no `v2.4.7`)
- **Target OS:** Windows x64 desktop + local Node server
- **Signing:** unsigned public Windows executables; verify with published `SHA256SUMS.txt`

## Source
- **Pre-maintenance `origin/main`:** `9c5ef67424eee26472a30483236cf8242ca72278`
- **Previous annotated tag `v2.4.6`:** `dadc5c9fbda3fe43338c3d48a530fba3c1e78f4e` (peeled `87cdf385b5e1916d465b91cc7dbb101b05716248`)
- **Product version files:** `package.json`, `apps/web/package.json`, `apps/desktop/package.json`, `apps/web/lib/version.mjs` = `2.4.6`
- Independently versioned packages remain `2.1.0` (`packages/ui`, `theme-engine`, `neural-engine`, `design-system`)

## Fresh verification (this maintenance)

| Gate | Result | Evidence |
|---|---|---|
| `npm test` | PASSED | **436/436** tests, 0 failed (10.84s) |
| `npm run test:desktop` | PASSED | **42/42** tests, 0 failed |
| `npm run build` | PASSED | Vite 6.4.3, **2103** modules |
| `npm run audit:public` | PASSED | 425 tracked paths at audit time; 0 personal paths / secrets |
| `npm run audit:release` | PASSED | lockfile workspaces `2.4.6`; production audit 0; reviewed high 0; expires 2026-08-31 |
| `npm run test:e2e` | PASSED | Playwright Chromium **3/3** (shell/nav/API/themes + 1440x900 + 390x844) |
| `npm run desktop:pack` | PASSED | electron-builder 26.15.3 dir pack via `scripts/desktop-pack.mjs` |
| `npm run desktop:test-package` | PASSED | **4/4** package-content tests |
| Startup readiness stress | PASSED | **20/20** clean forks; work/social never returned `* loading` after `rempeyek:ready` |

## What this maintenance changed
- HTTP listen/`rempeyek:ready` now waits for Work Lifecycle, Publishing, Switchboard, and process-manager modules (`apps/web/lib/http-readiness.cjs`)
- Failed required modules report `unavailable`, not perpetual `loading`
- Real Playwright E2E is a CI gate; missing browser fails
- `package-lock.json` workspace metadata synchronized to `2.4.6`
- Export/root installer copy is fail-closed and hash-checked; release workflow regenerates SHA256SUMS and deletes same-named assets before republish
- Windows npm script runner no longer depends on shadowed `cmd` / scoped `@workspace` tokens

## Security
Existing suite still covers loopback vs remote token, desktop session header, child-env allowlist, path denylist, approval consume-once / fail-closed, durable-config recovery, and public-release hygiene. Approval queue remains in-memory.

## Signing
No Authenticode certificate is configured in this environment. Public installers stay unsigned. Users must verify `SHA256SUMS.txt`.
