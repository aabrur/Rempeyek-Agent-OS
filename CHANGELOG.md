# Changelog

All notable changes to Rempeyek Agent OS. The in-app update banner compares the local version
against the latest GitHub Release of this repository — tag releases as `v<version>`.

## [2.2.0] — 2026-07-17

### Added
- **Neural Cosmos Agent Map** — the new default landing view: agents orbit the Neural
  Vault core on a full-bleed space stage with glowing bezier relationship lines,
  travelling particles, deterministic starfield, spinning core rings, working zoom,
  a cyberpunk top bar (system status · network load · clock), and a right-hand detail
  panel (verified connections with provenance, measured signals, metadata). All edges
  remain provenance-verified — no synthetic connections, ever.
- **8-destination sidebar** — Agent Map · Agents · Teams · Memory · Protocols ·
  Marketplace · Observatory · Settings (pinned bottom), with the product logo and a
  live SYSTEM HEALTH footer (mean 24h uptime).
- **Settings page** — the four structural themes moved here from the sidebar, plus
  software version/update facts and read-only workspace facts.
- **Marketplace view** — the vetted agent catalog as a first-class destination
  (shared with the ＋ Add Agent modal).
- **Self-hosted display faces** — Orbitron, Rajdhani, JetBrains Mono (latin woff2,
  OFL) served from `apps/web/public/fonts/`; no Google Fonts network call.
- **Launcher** — `start.cmd` / `bin/rempeyek-agent-os.mjs`: builds the UI if missing,
  starts the server, opens the browser.

### Changed
- **Cyberpunk theme retinted to the donor cosmos palette** — cyan `#00d4ff` on deep
  navy `#030918` with Orbitron/Rajdhani/JetBrains Mono type; Minimalist, Brutalist,
  and Glassmorph keep their identities (flat themes still render the map with zero
  glow/stars/particles).
- Command Center dissolved into **Observatory** (stats, vault health, reports);
  workflows/approvals/schedule now live under **Protocols**; the old rectangular
  TopologyMap was replaced by the cosmos map.
- **Git history rewritten** before the public release (author identity normalized).
  Existing clones must be re-cloned — the in-app updater's `git pull --ff-only`
  will refuse the rewritten history by design.

## [2.1.0] — 2026-07-16

### Added
- **Real telemetry vocabulary** — `report.cjs --type subagent_start|subagent_done|comm|info`;
  heartbeats get their own type and can no longer evict real evidence from the 30-event window.
- **Agent Map with real edges** — provenance-backed `co_assignment` relationships parsed from vault
  task co-assignments (e.g. the 7-agent Skill Hypertaks cluster). No fabricated hubs, ever.
- **Neural glow + selection shockwave** on the Agent Map — ported from the Canvas cosmos engine,
  degree-scaled, gated on the theme effect tokens and `prefers-reduced-motion`; flat themes stay flat.
- **All six agent-detail panels live for all 8 agents** — installed-state probe, honest gateway
  states for observe-only agents, live incremental run-log tail, vault-lane scaffolding on register.
- **Curated install catalog** — `+ Add Agent` lists known agents; one approved click runs the
  vetted installer (command resolved server-side, never from the form) with a live log, then
  auto-registers the agent, summonable immediately.
- **Update notification + one-click update** — `GET /api/version`, GitHub release check banner,
  approval-gated `POST /api/update` running `git pull --ff-only && npm install && npm run build`
  with a live tail. `--ff-only` guarantees local work is never overwritten.

### Fixed
- `addAgent` silently dropped `trigger`/`home` — dashboard-added agents could never be summoned.
- Hermes heartbeat flood collapsing Sessions into one bogus row and hiding subagent history.
- OpenClaw `info` telemetry rendering an empty Sessions panel.

### Changed
- Copilot fully replaced by Codex across registry, avatars, workflows, and the entire vault
  (13 documentation drifts closed; `Brains/Copilot` archived).
- `agents.config.example.json` now ships the real 8-agent roster instead of fictional placeholders.
- Design-reference PNGs moved out of `apps/web/public/` into `docs/design-refs/` (6.3 MB off the
  served path); stale worktrees, scratch scripts, and runtime residue cleaned up.

## [2.0.0] — 2026-07-12

- Neural Cosmos Edition baseline: vault-driven dashboard, 4 structural themes, provenance-first
  agent map, project workspaces, approval-gated gateway control.
