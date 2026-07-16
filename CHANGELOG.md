# Changelog

All notable changes to Rempeyek Agent OS. The in-app update banner compares the local version
against the latest GitHub Release of this repository — tag releases as `v<version>`.

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
