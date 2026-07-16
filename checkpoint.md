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
Done — see below.

---

## Stage 3 — Map neural glow + shockwave ✅  (2026-07-15)

Ported the Canvas engine's two proven effects to the SVG Agent Map — now that the map has 21 real
edges and per-node degree to make them expressive. Zero new invention; same laws, gated the same way.

### Shipped
- **Breathing plasma halos** (`.top-node-halo`): radius `22 + degree*3.2` and intensity scale with
  real node degree — the Canvas law. Behind the edges, blurred via a shared `#topoHalo` filter,
  breathing out-of-phase (negative per-degree animation-delay). The 7-agent Skill Hypertaks clique
  (degree 6 → r41) blooms; isolated claude-code (degree 0 → r22) stays quiet. Overlapping halos read
  as neural tissue.
- **Selection shockwave** (`.top-shock`): expanding double-ring, radius `34 + degree*6`, spline-eased
  fade. Fires ONLY on explicit node selection (Canvas contract), re-fires on re-select via a nonce
  key. Node-accent outer ring + `--graph-wave` inner ring.
- **Node-ring glow**: `--topology-filter` applied to `.top-node-ring`.
- **Gating (protects the design)**: `useEffectsEnabled()` reads `--graph-effect-glow`; halos use
  `calc(var(--graph-effect-halo,1) * opacity)`; shockwave suppressed when effects off OR reduced-motion;
  breathing wrapped in `@media (prefers-reduced-motion: no-preference)`. Flat themes stay flat with no
  component branching.

### Verified
- Cyberpunk (browser, live): 8 halos, radii `[41.2 ×7, 22.0]` (degree-exact), breathing opacity
  ~0.23, accent fill; shockwave on select → 2 rings r20→70 (Antigravity degree 6), accent stroke.
- Flat themes: minimalist (themes.css:58) + brutalist (:86) set `--graph-effect-glow/-halo:0` and
  `--topology-filter:none` — the exact tokens the CSS gates on → halo opacity `calc(0*…)=0`, shockwave
  not rendered. Proven at source; positive case confirms the token wiring is live. *(Empirical
  flat-theme screenshot pending — browser JS classifier was temporarily unavailable.)*
- Perf: SVG map ≤ 20 nodes; Canvas benchmark (<1500ms @ 1k) untouched → still green. 83 tests pass.

### Files touched
`apps/web/src/components/TopologyMap.jsx`, `packages/design-system/src/index.css`.

### Next → Stage 4
Curated install catalog + version notify / one-click update.

---

## Stage 4 — Curated install catalog + version notify / one-click update ✅  (2026-07-16)

"+ Add Agent" now actually installs, and the public gets version notifications with a safe
one-click update. Every executed command is vetted server-side; nothing from a form ever runs.

### Shipped
- **`apps/web/lib/agent-catalog.mjs`** — the 8-agent curated catalog + `buildAgentRecord` (pure).
  `catalogInstallCommand(id)` is the ONLY source of install shell; every cmd must match
  `npm install -g <pkg>` exactly (test-enforced — no metacharacters, no chaining).
- **`addAgent` delegated to `buildAgentRecord`** — killed the 30-line inline duplicate; trigger/home
  persist (the original shipped bug), catalog installs auto-attach, vault lane scaffolds on register.
- **`GET /api/catalog`** — entries + truthful `registered`/`installed` flags (60s probe cache).
- **`POST /api/agents/install`** — behind `withApproval("agent.install", id)`; resolves the command
  from the catalog by id, streams into the owned-proc log (`/api/proc/<id>/log` live tail), exit 0 →
  auto-register + re-probe. Link-only entries (Antigravity/Hermes/OpenClaw) return `{error, url}`.
- **`GET /api/version`** — `{version, rev, repo, node}`; repo slug parsed from the git remote.
- **`POST /api/update`** — behind `withApproval("system.update","dashboard")`; runs
  `git pull --ff-only && npm install && npm run build` streamed to `os-update` proc log.
  `--ff-only` = a user's local changes can never be clobbered.
- **`apps/web/lib/release-check.mjs`** (pure) — repo-URL parse, strict semver compare; malformed
  tags can never claim an update; release notes bounded at 4000 chars (hostile-body guard).
- **Client**: AddAgentModal = catalog grid (Install / Install+register / Register / ✓ ready states,
  live install tail) + custom form; `UpdateBanner` (GitHub releases/latest, 12h localStorage cache,
  silent on 404/no-release/rate-limit; approval-gated update with live tail + deterministic outcome
  line); `approveAction` extracted from useGateway for reuse.
- **Meta**: version 2.1.0 lockstep (6 package.json), `CHANGELOG.md`, `.github/workflows/{ci,release}.yml`
  (tag `v*` → test → build → GitHub Release = what feeds every user's banner),
  `agents.config.example.json` replaced fictional 3-agent demo with the real 8-agent roster.

### Tests — 95 pass (was 83)
- `agent-catalog.test.mjs` (8) — catalog integrity, vetted-cmd regex, body-install rejection,
  record building (expand/observe-only/error paths).
- `release-check.test.mjs` (4) — URL forms, semver strictness, malformed-tag silence, notes bound.

### Verified end-to-end (live server + browser DOM)
- `/api/version` → `{"version":"2.1.0","rev":"c6a1e8e","repo":"aabrur/Rempeyek-Agent-OS"}`.
- `/api/catalog` → 8 truthful entries (all ready on this machine).
- Install & update **403 without approval**; approval round-trip → update spawned, streamed live,
  failed HONESTLY (`--ff-only`, dev branch has no upstream) with the deterministic outcome line —
  full pipeline proven with zero side effects. Install error paths: unknown id, link-only + url.
- Modal: 8 catalog cards render "✓ ready"; zero console errors; banner correctly SILENT (GitHub has
  no release yet — cache `{tag:null}`).
- NOT executed: a real `npm install -g` happy path (every CLI already installed on this machine —
  running one would mutate global npm for no proof the streaming pipeline didn't already give).

### Files touched
`apps/web/lib/agent-catalog.mjs` (tests only — existed), `apps/web/lib/release-check.mjs` (new),
`apps/web/server.js`, `apps/web/src/components/{AddAgentModal,UpdateBanner}.jsx`, `apps/web/src/App.jsx`,
`apps/web/src/hooks/useGateway.js`, `packages/design-system/src/index.css`, 6× `package.json`,
`CHANGELOG.md` (new), `.github/workflows/` (new), `agents.config.example.json`.

### Next → Stage 5
Full-repo Neural Vault (all file types + repo source as a `code` layer), the 13 Copilot→Codex vault
drifts, file-organizer cleanup (Audit/, memory-capture.json untrack, copilot residue, graphify-out).

---

## Stage 5 — Full-repo Neural Vault + Codex migration + cleanup ✅  (2026-07-16)

The Neural Vault now surfaces EVERYTHING, the vault finally agrees with the registry about Codex,
and the junk is gone.

### Shipped — Neural Vault full fidelity
- **Two new graph layers**: `asset` (every non-.md vault file — the `[SYSTEM OVERRIDE].txt` Boss
  decree, `Assets/` images/PDFs — visible for the first time) and `code` (repo source under the
  virtual `Repo/` folder). Embeds like `![[cosmos-brain.png]]` now resolve to real asset nodes
  instead of ghosts.
- **Live result: 599 nodes** (was ~401): 303 notes + 30 assets + 118 code files + folders/tags.
  Tier `reduced` — the exact render budget the 1k-node benchmark already proves <1.5s.
- **Security held**: walk allowlists (`apps/packages/scripts/docs/prompts/.github` + named root
  files, extension gate) mean `.env`, `dist/`, `node_modules`, telemetry data, and dot-dirs
  (`.remember`, `.claude`) can never enter the graph. Parity mode still mirrors Obsidian
  (notes+ghosts only); cosmos shows all six layers. New theme tokens `--graph-asset`/`--graph-code`
  in :root + all 4 themes.

### Shipped — Codex migration (13 vault drifts closed)
- `Agents.md` — Codex home `.copilot`→`.codex`, real status, icon ⬜, interface line.
- `Brains/Copilot/` (331 lines, deleted agent) → **archived** to `Archive/Brains-Copilot/`
  (same pattern as Brains-ZCode). `Brains/Codex/` completed with `Knowledge/` + `Notes/` indexes —
  the shape `Our Family.md` always claimed it had.
- Missing decision record written: `Brains/Shared/Decisions/2026-07-16 Roster Swap - Copilot to
  Codex.md` (the Kilo/Cline/Pi swap got one; this one never did).
- Roster/peer/lane-isolation fixes: `Warning.md`, `Data Map.md` (+ added `.codex/.kilocode/.cline/
  .pi/.gemini`, dropped retired `.zcode/.kimi-code`), `[SYSTEM OVERRIDE].txt` roll-call,
  `Brains/README.md` (+ Antigravity row), `Brains/Cline/{Memory (Node-15→12),Rules}`,
  `Brains/{KiloCode,Pi}/Rules`, `Brains/Antigravity/Identity`, ECOSYSTEM runtime list + stale
  checklist item, SOP prompt template, `Projects/Agentic OS.md` gateway table.
- `Routing-Rules.md` — Codex ⬜ + Antigravity 🟠 added to the decision tree AND the specialization
  table (they were unroutable before). `INDEX.md`/`Our Family.md` Codex icon + formatting.
- `Brains/KiloCode/graphify-out/` runtime artifact removed (constitution forbids runtime in Brains).

### Shipped — cleanup
- Empty `Audit/` removed; `telemetry/memory-capture.json` untracked + gitignored (was the only
  source of recurring commit noise); `telemetry/logs/copilot.log` + stale `dist/avatars/*.webp`
  (incl. `Copilot.webp`) removed; `graphify-out/` dated snapshots pruned.
- **Surfaced, NOT deleted (Boss decides):** 3 live git worktrees (`.worktrees/{plan-b,
  roadmap-continuation,stage-e-agent-map}` — stage-e @2b29cec is NOT an ancestor of main, may hold
  unmerged work; removal needs `git worktree remove`); root Python scratch files (gitignored,
  nothing references them); 6.3 MB tracked design PNGs in `apps/web/public/`.

### Tests — 98 pass (was 95)
- vault-graph: asset layer + embed resolution + decree visibility; code layer under Repo/.
- neural-view-model: cosmos shows asset+code, parity stays Obsidian-pure; palette maps both tokens.

### Verified
- Live `/api/graph`: 599 nodes, decree + `Repo/apps/web/server.js` present, tier `reduced`.
- Active `copilot` grep in vault → only historical/archive references remain.
