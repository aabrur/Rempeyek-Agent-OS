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
Six agent-detail panels for all 8 agents: installed-probe in `/api/state`, honest gateway control for
observe-only agents, telemetry empty states, vault-lane scaffold, live incremental run log
(`/api/proc/:id/log?since=N`, currently uncalled).
