# Changelog

All notable changes to Rempeyek Agent OS. The in-app update banner compares the local version
against the latest GitHub Release of this repository - tag releases as `v<version>`.

## [2.3.4] - 2026-08-02

### Added

- Public unsigned Windows update release with NSIS installer, portable package,
  `latest.yml`, blockmap, and `SHA256SUMS.txt` verification file.

### Changed

- Published the reviewed 21-agent registry, marketplace metadata, command
  adapters, and owned process lifecycle changes in the desktop update feed.

## [2.3.3] - 2026-07-29

- **Navigation Renaming**: Renamed "TEAMS" to "PROJECTS" and "PROTOCOLS" to "SWITCHBOARD" across sidebar and workspace views.
- **De-cluttered Action Controls**: Replaced verbose/overlapping agent card action buttons with a sleek `⋯` dropdown context menu.
- **Theme Contrast & Legibility Sweep**: High contrast typography, legends, indicators, and text styling across all themes (`minimalist`, `brutalist`, `glassmorph`, `cyberpunk`).
- **Settings System Hardening**: Verified and validated all settings toggles, theme selectors, update channel controls, and system options.

## [2.3.2] - 2026-07-29

- **Operational synchronization dashboard**: Agents now exposes a
  runtime-injected synchronization contract that users can copy or dispatch to
  every registered primary agent.
- **Safe family dispatch**: one shared Vault contract and one idempotent inbox
  task per primary agent are written atomically; spawned subagents remain inside
  their owner profile and receive no duplicate top-level task.
- **Agent lifecycle and neural views**: completes the permanent removal,
  installed-versus-registered Marketplace, dropdown Add Agent, owned gateway
  controls, primary-only Agent Map, and approved-repository Neural Vault work.
- **Release boundary**: desktop artifacts remain stable-feed gated by valid
  Authenticode signing and clean-machine update evidence.

## [2.3.1] - 2026-07-28

- **Marketplace lifecycle hardening**: installer completion and post-install
  registration failures are contained, replayable, and returned as safe
  operation evidence instead of escaping the server process.
- **Release lineage**: package, web, desktop, lockfile, and user-facing
  installation metadata are prepared for the next release tag.
- **Release safety**: stable updater claims remain gated by Authenticode,
  matching `latest.yml`, and clean-machine acceptance.

## [2.3.0] - 2026-07-28

### Added
- **Unified Memory Neural Fabric**: The `Sidebar > Memory` view now displays connected states for agents, projects, tasks, sessions, handoffs, decisions, shared/project memory, skills, evidence, artifacts, and whole-application source modules under `Repo/`.
- **Vault Backend & Activity System of Record**: Local Vault (`%LOCALAPPDATA%\Rempeyek-Agent-OS\Vault`) is the canonical data store. Active sessions are tracked in `Vault/Sessions/Active` and finalized upon completion.
- **Memory Graph API**: Introduced `/api/memory/graph`, `/api/memory/graph/stats`, `/api/memory/node/:id`, `/api/memory/neighborhood/:id`, `/api/memory/search`, `/api/memory/activity`, and `/api/memory/health`.
- **Migration 002**: Forward migration establishing v2.3.0 directory trees and indexes (`002-unified-memory-neural-fabric.mjs`).

### Fixed & Hardened
- **Zero Obsidian Dependency**: Obsidian is strictly an optional Markdown file format layer; removed all Obsidian app launcher requirements, prompts, and external buttons.
- **Skills Safety**: Removed unconditional `|| true` capability matching; added recursive copying for skill `references`, `assets`, `scripts`, and defaulted skills to `unreviewed` / `restricted`.
- **Graphify Access Enforcement**: Integrated `access-policy-engine.mjs` path validation across all Graphify index target files.
- **Marketplace installation lifecycle**: reviewed installers now open a visible terminal, manual-only agents open their official guide, and registration waits for a successful installer exit.
- **Add Agent responsive feedback**: fixed invalid external adapter spawning, improved error/status messages, and made the catalog usable on narrow screens.
- **Source updater verification**: the update path remains clean-check, fast-forward-only, dependency install, and production build before applying the refreshed UI.

## [2.2.3] - 2026-07-27

### Added
- Terminal-first visible Marketplace installation opening in `%LOCALAPPDATA%\Rempeyek-Agent-OS`.
- Summon terminals default to the same canonical state root.
- Safe launcher alias delegation (`kilocode` delegating to `kilo` without CMD recursion).
- Expanded Marketplace catalog (21 agent CLIs + Hypertaks plugin/skill) and typed installer adapters.
- Truthful lifecycle telemetry with honest `"Not reported by this agent"` status for unsupported task and subagent states.
- Local Vault scaffolding (`scaffoldVaultStructure`) and Graphify AST index integration.
- Desktop updater isolation guarding restarts against active lifecycle operations and redacting raw network errors.
- Comprehensive Playwright and HTTP API test suite for all UI action buttons.

### Fixed
- Enforced dynamic `%LOCALAPPDATA%\Rempeyek-Agent-OS` state root resolution with zero hardcoded owner paths.
- Redacted raw desktop updater network exceptions into user-safe error messages.

## [2.2.2] - 2026-07-27

### Fixed

- Desktop development and packaging now build the current React renderer before Electron starts or creates an installer.
- Package verification rejects an installer whose embedded UI differs from the current production build.

## [2.2.1] - 2026-07-26

### Fixed

- A missing `latest.yml` in an unsigned GitHub Release is treated as no
  published signed update instead of a fatal desktop error.
- Desktop update failures expose a short user-safe message instead of HTTP
  headers, stack traces, or local filesystem paths.

## [Unreleased]

### Added

- Windows x64 Electron desktop shell around the existing, unchanged command
  deck, with a supervised loopback runtime, single-instance behavior, tray
  controls, launch-at-login, and native runtime/settings facts.
- Windows x64 NSIS and portable package targets plus a deterministic icon
  generated from the existing Rempeyek brand asset.
- Verified packaged-update lifecycle: stable/preview selection, optional
  automatic checks, explicit download state, and installation only after a
  user-approved restart.

### Changed

- Source-checkout updates now execute fixed sequential programs and arguments,
  reject dirty worktrees, and never run a shell command chain.
- Desktop profile data, vault, telemetry, settings, logs, receipts, and update
  state resolve under `%LOCALAPPDATA%\Rempeyek-Agent-OS`; application uninstall
  retains that user-owned state.

### Security

- The Electron renderer has no Node integration, uses context isolation,
  sandboxing, web security, strict navigation/window guards, and a minimal
  CommonJS preload bridge. The private desktop session token remains below
  renderer and preload access.
- The owned desktop server drops inherited source-path and remote-dashboard
  overrides before applying fixed Local AppData, loopback, random-port, and
  private-session values.
- CI cannot publish. Manual packages are short-retention unsigned test
  artifacts. Release actions are immutable SHA pins, signing secrets are
  step-scoped, preview tags cannot become stable latest, and the known
  build-tool audit graph is exact-fingerprint/expiry gated. A tag release still
  requires external signing credentials, Authenticode verification, matching
  publisher identity, version parity, and SHA-512 update metadata.
- Update-available and update-ready native notifications honor the existing
  desktop preference and deduplicate repeated milestones.

### Release status

- Local unsigned NSIS and portable artifacts were built on Windows 11 x64 and
  validated for package contents and update-metadata hash parity. They are not
  signed, published, or clean-machine certified.

## [2.2.0] - 2026-07-17

### Added
- **Neural Cosmos Agent Map** - the new default landing view: agents orbit the Neural
  Vault core on a full-bleed space stage with glowing bezier relationship lines,
  travelling particles, deterministic starfield, spinning core rings, working zoom,
  a cyberpunk top bar (system status · network load · clock), and a right-hand detail
  panel (verified connections with provenance, measured signals, metadata). All edges
  remain provenance-verified - no synthetic connections, ever.
- **8-destination sidebar** - Agent Map · Agents · Teams · Memory · Protocols ·
  Marketplace · Observatory · Settings (pinned bottom), with the product logo and a
  live SYSTEM HEALTH footer (mean 24h uptime).
- **Settings page** - the four structural themes moved here from the sidebar, plus
  software version/update facts and read-only workspace facts.
- **Marketplace view** - the vetted agent catalog as a first-class destination
  (shared with the ＋ Add Agent modal).
- **Self-hosted display faces** - Orbitron, Rajdhani, JetBrains Mono (latin woff2,
  OFL) served from `apps/web/public/fonts/`; no Google Fonts network call.
- **Launcher** - `start.cmd` / `bin/rempeyek-agent-os.mjs`: builds the UI if missing,
  starts the server, opens the browser.

### Changed
- **Cyberpunk theme retinted to the donor cosmos palette** - cyan `#00d4ff` on deep
  navy `#030918` with Orbitron/Rajdhani/JetBrains Mono type; Minimalist, Brutalist,
  and Glassmorph keep their identities (flat themes still render the map with zero
  glow/stars/particles).
- Command Center dissolved into **Observatory** (stats, vault health, reports);
  workflows/approvals/schedule now live under **Protocols**; the old rectangular
  TopologyMap was replaced by the cosmos map.
- **Git history rewritten** before the public release (author identity normalized).
  Existing clones must be re-cloned - the in-app updater's `git pull --ff-only`
  will refuse the rewritten history by design.

## [2.1.0] - 2026-07-16

### Added
- **Real telemetry vocabulary** - `report.cjs --type subagent_start|subagent_done|comm|info`;
  heartbeats get their own type and can no longer evict real evidence from the 30-event window.
- **Agent Map with real edges** - provenance-backed `co_assignment` relationships parsed from vault
  task co-assignments (e.g. the 7-agent Skill Hypertaks cluster). No fabricated hubs, ever.
- **Neural glow + selection shockwave** on the Agent Map - ported from the Canvas cosmos engine,
  degree-scaled, gated on the theme effect tokens and `prefers-reduced-motion`; flat themes stay flat.
- **All six agent-detail panels live for all 8 agents** - installed-state probe, honest gateway
  states for observe-only agents, live incremental run-log tail, vault-lane scaffolding on register.
- **Curated install catalog** - `+ Add Agent` lists known agents; one approved click runs the
  vetted installer (command resolved server-side, never from the form) with a live log, then
  auto-registers the agent, summonable immediately.
- **Update notification + one-click update** - `GET /api/version`, GitHub release check banner,
  approval-gated `POST /api/update` running `git pull --ff-only && npm install && npm run build`
  with a live tail. `--ff-only` guarantees local work is never overwritten.

### Fixed
- `addAgent` silently dropped `trigger`/`home` - dashboard-added agents could never be summoned.
- Hermes heartbeat flood collapsing Sessions into one bogus row and hiding subagent history.
- OpenClaw `info` telemetry rendering an empty Sessions panel.

### Changed
- Copilot fully replaced by Codex across registry, avatars, workflows, and the entire vault
  (13 documentation drifts closed; `Brains/Copilot` archived).
- `agents.config.example.json` now ships the real 8-agent roster instead of fictional placeholders.
- Design-reference PNGs moved out of `apps/web/public/` into `docs/design-refs/` (6.3 MB off the
  served path); stale worktrees, scratch scripts, and runtime residue cleaned up.

## [2.0.0] - 2026-07-12

- Neural Cosmos Edition baseline: vault-driven dashboard, 4 structural themes, provenance-first
  agent map, project workspaces, approval-gated gateway control.
