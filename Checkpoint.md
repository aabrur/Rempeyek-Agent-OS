# Rempeyek Agent OS checkpoint

Updated: 2026-07-29
Status: READY - VERSION 2.3.3 RELEASE CANDIDATE

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
- Decisions applied: 1A runtime-injected SSOT, 2A OS-served enforcement, and 3C
  broad approved-context synchronization with explicit secret and PC-scan
  exclusions.
- TDD evidence: initial UI/API tests failed as expected, then focused lifecycle
  and UI verification passed 19/19.
- Release target advanced to `2.3.2`; package and security gates were evaluated
  and the stable-feed blockers are recorded below.

## Verification

- Focused synchronization/lifecycle/UI regression: 19/19 passed.
- Full web test suite: 333/333 passed.
- Desktop suite: 28/28 passed.
- Packaged desktop checks: 3/3 passed.
- Production renderer build: passed, 2,099 modules transformed.
- Desktop NSIS, portable, and unpacked package rebuild: passed.
- Public release audit: 321 tracked paths, no runtime/personal/high-confidence secret findings.
- Dependency release audit: production findings 0; 17 reviewed development findings under policy through 2026-08-31.
- Artifact evidence:
  - root installer: `Rempeyek-Agent-OS-Setup-2.3.2.exe`
  - installer SHA-256: `66561BB269DD6CC843B2471F2AB7774654A06C47B82E09F79B890ECA6BFA6E5F`
  - portable SHA-256: `608C13DDBDAF000F1897B239D7F9B1CC77B280973F0B60171C346F58D7DFE965`
  - upload ZIP: `dist-release/Rempeyek-Agent-OS-v2.3.2-Windows-Unsigned-Preview.zip`
  - ZIP SHA-256: `3A8617F1B596EB76C398D1CB7C5B0AF4BB5717642A09B12F68465C7B0F21E893`
  - ZIP has exactly five expected files and intentionally excludes `latest.yml`
- Real runtime smoke:
  - agents 8
  - unintended custom agents 0
  - top-level subagents 0
  - process projections 8
  - topology nodes 8
  - topology edges 0 because no current provenance-backed relationship records
  - Neural Vault nodes 717
  - Neural Vault edges/renderable edges 709/709
- `graphify update .`: 2,510 nodes, 3,404 edges, 237 communities.
- `git diff --check`: passed; only Windows line-ending notices.

## Documented limitations

- The live Agent Map currently has zero verified agent-agent edges. Lines appear automatically when configuration, task, or communication evidence identifies both primary agents and provenance.
- The current Codex profile has no reviewed gateway action declarations, so no live status/run mutation was executed during smoke testing. Controls remain disabled when the action is unsupported.
- Setup, portable, and unpacked executables are all `NotSigned`; GitHub has no
  visible `CSC_LINK`, `CSC_KEY_PASSWORD`, or `DESKTOP_PUBLISHER_SUBJECT`.
- Clean-machine acceptance is not proven. The Windows Sandbox feature check
  itself requires elevation on this host.
- Stable tag, GitHub Release, and updater-feed publication are blocked. Source
  commit/push and the explicitly labeled unsigned preview bundle are allowed by
  the user's current approval.

## Rollback

- Source changes are grouped as one reviewed `2.3.2` release-candidate commit.
- The exact live test-leak cleanup backup is retained at the path above.
- Removed 2.3.1 installers remain recoverable from prior Git history; ignored
  release-directory copies were intentionally replaced by 2.3.2 preview files.
- Permanent user-initiated removals intentionally have no in-product Restore path.
