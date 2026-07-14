# Rempeyek Agent OS — Neural Cosmos Continuation · Checkpoint Log

Branch work tracking for the 5-stage build. One entry per completed stage.
Plan: `Neural Cosmos: Connect, Complete, Captivate`.

---

## Stage 1 — Telemetry vocabulary + real map edges ✅  (2026-07-15)

**The spine.** Gave telemetry a real event vocabulary and fed the Agent Map its first honest edges.

### Shipped
- **Extracted `apps/web/lib/agent-detail.mjs`** (pure, unit-testable): `parseTelemetry`, `isHeartbeat`,
  `selectTelemetryWindow`, `telemetryActivity`, `coAssignments`. server.js was previously untestable
  at this layer — nothing bound under `node --test`.
- **`selectTelemetryWindow`** reserves the 30-event window for real signal, backfilling with recent
  heartbeats. Fixes Hermes' `telemetry-writer` subagent being evicted by 100+ bridge heartbeats.
- **`report.cjs` `--type` flag** → `subagent_start|subagent_done|comm|info` now emittable; progress
  inference kept for backward compat.
- **`hermes-daily-bridge.cjs`** heartbeat re-typed `heartbeat` so it never masquerades as work.
- **Co-assignment edges** (`co_assignment`): two agents on one vault project = one symmetric,
  provenance-backed edge (provenance = the task line). The one honest agent↔agent signal available
  today. New `readTaskFiles()` + `buildLiveAgentTopology()` feed it.
- **`agent-topology.mjs`** accepts `coAssignments`; **`agent-map.mjs`** registers the type, marks it
  symmetric (no arrowhead), and adds per-node `degree` (for Stage 3 glow).
- **CSS/theme**: `--topo-edge-co_assignment` token in all 4 themes + `:root`; `.rel-co_assignment`
  edge/legend styling; `TopologyMap.jsx` label + arrowhead suppression for symmetric edges.

### Tests — 81 pass (was ~67)
- `apps/web/test/agent-detail.test.mjs` (11) — window/heartbeat/activity/co-assignment logic.
- `apps/web/test/telemetry-events.test.mjs` (4) — `report.cjs` type emission (child-process).
- `apps/web/test/agent-topology.test.mjs` +1 — co-assignment symmetric canonicalisation.
- `apps/web/test/agent-map.test.mjs` — updated relation list expectation.

### Verified end-to-end (live server, real vault)
- `/api/agent-topology` → **8 nodes, 21 edges, hasRelationships:true** (Skill Hypertaks 7-agent clique).
- `/api/agent/hermes/detail` → `telemetry-writer` subagent surfaced; 3 real sessions, no "Heartbea" row.
- `/api/agent/openclaw/detail` → `info` event now renders as an idle session (was empty).
- Browser DOM: 21 `.rel-co_assignment` edges, 0 arrowheads on them, footer = "ARROWS SHOW VERIFIED
  DIRECTION". (Full-viewport screenshots time out on the gradient panel — a browser-pane raster quirk,
  not a page perf issue; page JS/DOM fully responsive. Visual capture deferred to Stage 3.)

### Files touched
`apps/web/lib/agent-detail.mjs` (new), `apps/web/lib/agent-topology.mjs`, `apps/web/lib/agent-map.mjs`,
`apps/web/server.js`, `scripts/report.cjs`, `scripts/hermes-daily-bridge.cjs`,
`apps/web/src/components/TopologyMap.jsx`, `packages/design-system/src/index.css`,
`packages/theme-engine/src/themes.css`, +3 test files.

### Next → Stage 2
Done — see below.

---

## Stage 2 — Six agent-detail panels working for all 8 agents ✅  (2026-07-15)

Made every panel honest for every agent. Failures were data-supply, not missing UI.

### Shipped
- **Installed-state probe**: `probeInstalled` (`where <trigger>` / existsSync), cached in
  `installedCache`, refreshed by `pollInstalled` on a 120s interval + at startup. Surfaced as
  `installed` (+ `hasInstaller`) on `/api/state` agents and `/api/agent/:id/detail`. The dashboard
  finally knows what's actually on the machine — drives the card, the gateway panel, and Stage 4's
  catalog.
- **Honest gateway control**: observe-only agents (`actions:[]`) no longer show the dead-end
  "Click Status" hint with no Status button. New three-way empty state: not-installed → install
  guidance; has status → the Status hint; else → "Observe-only — no service gateway to poll."
- **Live run log**: wired the previously-uncalled `GET /api/proc/:id/log?since=N`. `AgentDetail`
  tails it every 2s (`live.lines`, cursor-tracked), streaming an owned `run` in real time and
  uncapping the old 40-line snapshot; falls back to the disk seed when idle.
- **Vault-lane scaffold**: `scaffoldVaultLane` + pure `laneScaffold` templates create
  `Brains/<Lane>/{Identity,Memory,Rules}.md` + `Knowledge/` + `Notes/` on register — writing only
  missing files, never clobbering a real brain.
- **Installed pill** in the detail header; Sessions/Telemetry honest empty states (Stage 1 already
  fixed the `info`/heartbeat handling).

### Tests — 83 pass (was 81)
- `agent-detail.test.mjs` +2: `triggerExe` (trigger→bin fallback→empty), `laneScaffold` canonical shape.

### Verified end-to-end (live server)
- `/api/state`: all 8 agents `installed:true` on this machine (Boss has the CLIs — honest);
  false-path logic unit-tested.
- Codex detail (observe-only): all six panels render — gateway shows the honest observe-only note,
  Sessions/Subagents/Telemetry honest empties, Brains lane lists Memory/Identity/Rules, run log shows
  disk-persisted summon lines. Header shows "installed".
- claude-code detail: 8 real transcript sessions, full gateway actions.
- `/api/proc/:id/log?since=0` returns `{lines,next,status}` — the live-tail contract.
- (Browser-pane screenshots time out environment-wide — a tooling quirk; verification via
  DOM/text/API, which is authoritative for content.)

### Files touched
`apps/web/server.js`, `apps/web/lib/agent-detail.mjs`, `apps/web/src/components/AgentDetail.jsx`,
`apps/web/test/agent-detail.test.mjs`.

### Next → Stage 3
Map neural glow + shockwave, ported from the proven Canvas engine, gated on the existing effect
tokens + reduced-motion — now that the map has 21 real edges to make expressive.
