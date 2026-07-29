# Rempeyek Agent OS checkpoint

Updated: 2026-07-29
Status: READY - VERSION 2.3.3 POST-RELEASE HARDENED

## Contract

- Never create a top-level agent unless the user explicitly confirms Add/Register.
- Keep spawned subagents inside the owning primary-agent profile.
- Remove/uninstall uses two explicit confirmations and creates no Restore card.
- Marketplace distinguishes installed, registered, and missing software.
- Add Agent uses one state-aware dropdown plus an explicit manual-custom option.
- Agent profiles expose Summon, Stop, Gateway run, Log, Status, Activity, Tasks, Telemetry, Vault lane, and owned live logs.
- Agent Map excludes subagents and unintended custom records.
- Neural Vault projects the approved Vault and active repository without broad PC or secret-store scanning.

## Phase 1 — root cause and containment

Status: completed

- Root cause: `POST /api/agents/add` used global runtime services even when tests created an isolated server. Repeated UI API tests wrote `Custom Agent` records into the real registry.
- The registration route now uses injected config/store/home/state/Vault services.
- Live cleanup removed only the exact test fingerprint:
  - 7 leaked active custom profiles
  - 19 leaked custom tombstones
  - 3 leaked family-registry nodes
  - generated `custom-cli.cmd`
  - exact scaffold-only `Vault/Brains/CustomAgent`
- Backup: `%LOCALAPPDATA%\Rempeyek-Agent-OS\backups\test-agent-leak-2026-07-28T17-04-09-094Z`
- Reconciled live state: 8 primary agents, 0 unintended Custom Agent records, 0 top-level subagents.

## Phase 2 — lifecycle and Marketplace

Status: completed

- Catalog registration requires a fresh installed-executable probe.
- Install registers only after verified installer success and a fresh probe.
- Uninstall removes the profile only after verified executable absence.
- Child profiles are preflighted before an irreversible uninstaller starts.
- Remove and uninstall both require two independently scoped backend approvals.
- Permanent removals write `removedAgentIds`; registry backup restore cannot revive those profiles.
- Tombstone/Restore profile behavior was removed.
- An unchanged Rempeyek-generated launcher is removed after successful uninstall; user-modified launchers are preserved.
- Marketplace shows `Register to Rempeyek Agent OS` for installed but unregistered agents.

## Phase 3 — Add Agent, profile controls, and ownership

Status: completed

- Add Agent is one dropdown of known agents plus `Custom agent…`; selection alone never mutates state.
- Marketplace `Register Custom Agent` opens the same modal in manual-custom mode.
- Marketplace loading failures are announced and retryable.
- Async installer polling is generation-bound so a closed operation cannot mutate a reopened modal.
- Required custom fields expose accessible validation.
- Agent profile controls expose Summon, Stop, Gateway run, Log, and Status without permitting duplicate gateway requests.
- Stop is enabled only for a stoppable owned process, summoned terminal, or native service.
- Top-level state, process list, lifecycle, topology, and process-control routes exclude spawned subagents.

## Phase 4 — Agent Map and Neural Vault

Status: completed

- Agent Map contains primary agents only.
- Agent-agent edges remain provenance-backed; no relationship is fabricated.
- Decorative neural fabric, core lane links, semantic state, and motion effects remain available.
- Neural Vault projects the complete approved repository source set and active Vault.
- All 704 observed semantic edges include a renderer layer.
- Dataset identity is stable when source files do not change.
- Security boundary: no whole-PC scan, credentials, browser profiles, wallets, `.env`, or secret stores.

## Phase 5 — operational synchronization prompt

Status: completed

- The Agents page exposes Full Agent Synchronization above Registered Nodes.
- The popup renders runtime, Vault, and skill-warehouse paths from injected
  backend services; no user-specific path is embedded in the prompt source.
- Users can copy the complete prompt or confirm a Send to all agents action.
- Send writes one shared `System/Operational Synchronization.md` contract and
  one inbox task per registered primary agent using operation replay, a lock,
  and atomic replace.
- Spawned subagents are excluded and no process or agent profile is created.
- Phase decisions applied: 1A runtime-injected SSOT, 2A OS-served enforcement, and 3C
  broad approved-context synchronization with explicit secret and PC-scan
  exclusions.
- Post-release hardening complete:
  - P0: Synchronized `package-lock.json` metadata to 2.3.3 across root and workspace packages.
  - P0: Created central `apps/web/lib/version.mjs` SSOT (`APP_VERSION = '2.3.3'`) replacing hardcoded runtime strings, and fixed migration rollback schema resets.
  - P0: Automated `SHA256SUMS.txt` generation in `.github/workflows/release.yml` for release tagging and artifact publishing.
  - P1: Enforced skill trust execution gate (`trust_status === 'trusted'`) in `skills-sync-engine.mjs` and added `reviewSkill` capability.
  - P1: Persisted durable `operationId` comments in `operational-sync-prompt.cjs` to eliminate duplicate task lines on replay.
  - P1: Corrected startup health check paths in `startup-lifecycle.mjs` to target actual Vault data directories (`.graphify`, `Graph`, `Memory`).
  - P1: Updated `README.md` and `Checkpoint.md` to reflect unsigned release publishing posture, checksum verification, and updated UI terminology (*Projects*, *Switchboard*).

## Verification

- Web test suite: 333/333 passed.
- Desktop test suite: 28/28 passed.
- Desktop package check: passed.
- Release workflow checksum generation step: verified in `.github/workflows/release.yml`.
- Public release audit: passed, 0 runtime/personal/high-confidence secret findings.

## Documented limitations

- The live Agent Map currently has zero verified agent-agent edges. Lines appear automatically when configuration, task, or communication evidence identifies both primary agents and provenance.
- Unsigned release publishing is enabled; executable binaries include SHA256SUMS checksum verification. Authenticode signing via `CSC_LINK` remains optional.

## Rollback

- Changes are committed cleanly on `main` following v2.3.3 release.
- Rollback migrations explicitly restore `runtimeSchemaVersion`, `memorySchemaVersion`, and `graphSchemaVersion` to 1 without mutating user notes.
