# Plan B Specification: WorkUnit / Verification Persistence to Vault

## Goal

Persist WorkUnit and Verification records to `Vault/Work/` so they survive agent restarts. Use atomic writes (fsync + backup `.bak`) to recover from corruption/ interruption.

**Scope:** Slice B only — `WorkUnit` + `Verification` persistence. No other state objects.

## Architecture

```
apps/web/lib/work-lifecycle.mjs
├── createWorkLifecycleStore(vaultRoot)
│   ├── workDir = path.join(vaultRoot, 'Work')
│   ├── mkdirSync: Missions, Contracts, Runs, Evidence, Verifications, Handoffs
│   └── return { saveWorkUnit, getWorkUnit, saveVerification, getVerification, ... }
```

- **`saveWorkUnit(unit)`** — write `Vault/Work/Missions/<missionId>/WorkUnits/<workUnitId>.json` atomically.
- **`saveVerification(v)`** — write `Vault/Work/Missions/<missionId>/WorkUnits/<workUnitId>/Verifications/<verificationId>.json` atomically.
- **`getWorkUnit(id)`** / **`getVerification(id)`** — read from disk, fallback to memory cache.
- **Atomicity:** use existing `writeJsonAtomic()` from `apps/web/lib/work-lifecycle.mjs` or equivalent utility.
- **Backup:** prior write backed up to `.bak` before new write replaces it.
- **Recovery:** `loadDurableJson()` already exists for general use — reuse.

## Files to modify

| File | Change |
|------|--------|
| `apps/web/lib/work-lifecycle.mjs` | Implement persistent `saveWorkUnit` + `saveVerification` |
| `apps/web/test/work-lifecycle.test.mjs` | Add persistence TDD tests |
| `apps/web/test/release-copy.test.mjs` | (No change — already covers version drift) |

## TDD Contract

1. Write failing tests first:
   - `WorkUnit persists across store recreation`
   - `Verification persists across store recreation`
   - `Corrupt WorkUnit JSON recovers from .bak`
2. Run → expect RED
3. Implement `saveWorkUnit` / `saveVerification` with disk persistence
4. Run → expect GREEN (all tests pass)

## Verification Commands

- Repo root: `node --test apps/web/test/work-lifecycle.test.mjs`
- Repo root: `npm test` (regression — all suites must pass)

## Constraints

- No commit/staging unless explicitly approved by Boss.
- Do not touch system-doctor, server.js, README, docs.
- Preserve explicit `2.4.2` echo fixtures.
- `APP_VERSION` remains `2.4.3`.
