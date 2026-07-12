# Plan B — Project Intelligence Workspace Implementation Plan

> Approved by founder on 2026-07-12. Implement incrementally; never write to the real Obsidian Vault during tests.

## Outcome and guardrails

Build a project-first daily workspace on the existing Node + React/Vite stack. The first complete workflow is **Continue yesterday's work**. Minimalist, Brutalist, Glassmorph, and Cyberpunk share semantic tokens. Neural Vault and Agent Map render only real data. Default Vault is `C:\Users\abrur\Rempeyek-Agent-Os\Obsidian Vault`, overridable by `OBSIDIAN_VAULT_PATH`; tests use temporary fixture vaults. Remote access is fail-closed. Reduced-motion and non-canvas fallbacks are mandatory.

## 1. Test and server seams

**Files:** `package.json`, `apps/web/package.json`, `apps/web/server.js`, `apps/web/test/server-lifecycle.test.mjs`

- Write a failing `node:test` proving the server can be imported without binding.
- Extract `createServer(options)` and bind only from the executable entry path.
- Add the root test script; run tests and syntax checks.

## 2. Fail-closed access policy

**Files:** `apps/web/lib/access-policy.mjs`, `apps/web/test/access-policy.test.mjs`, `apps/web/server.js`, `.env.example`

- Test localhost defaults, remote opt-in, required token, Host validation, mutation Origin validation, and no permissive CORS.
- Default to `DASH_HOST=127.0.0.1`; remote mode requires `DASH_REMOTE=1`, token, and allowed origins.
- Gate every API route before dispatch and document variables without secrets.

## 3. ProjectWorkspace domain and Vault store

**Files:** `apps/web/lib/project-workspace.mjs`, `apps/web/lib/vault-project-store.mjs`, `apps/web/test/project-workspace.test.mjs`, `apps/web/test/fixtures/vault/**`

- Test `projects.query({ id })`, `projects.execute({ type, ...payload })`, and `projects.ingest(projectEvent)`.
- Parse project notes, tasks, decisions, recent artifacts, and wikilinks from fixture Markdown.
- Enforce path containment and typed commands; expose stable DTOs, never raw filesystem structures.

## 4. Today projection and Continue API

**Files:** `apps/web/lib/today-projection.mjs`, tests, `apps/web/server.js`, `apps/web/src/api.js`

- Test deterministic active-project selection, unfinished task ordering, unresolved decisions, recent outputs, and recommended next action.
- Add `GET /api/today`, `GET /api/projects`, and `GET /api/projects/:id` plus safe task-progress commands.
- Return explicit empty, offline, unavailable, and error states.

## 5. Project-first shell and Today UI

**Files:** `apps/web/src/App.jsx`, `components/Sidebar.jsx`, `views/TodayView.jsx`, `views/ProjectWorkspace.jsx`, `hooks/useToday.js`, design-system CSS

- Navigation: Today, Projects, Memory, Fleet, Advanced, Settings.
- Accessible Today surface: last project, next action, unfinished work, recent output, and approvals.
- Project tabs: Overview, Tasks, Memory, Files, Activity.
- Preserve runtime controls under Fleet/Advanced and add all empty/loading/error states.

## 6. Approval queue and safe dispatch

**Files:** `apps/web/lib/approval-queue.mjs`, tests, `apps/web/server.js`, `components/ApprovalQueue.jsx`

- Test pending/approved/rejected/expired transitions and audit records.
- Require approval for terminal, process, config, and Vault mutations.
- Show consequence, target, scope, and actor; keep add-agent HTTP observe-only by default.

## 7. Codex migration and truthful metrics

**Files:** config, agent normalization, UI copy, and docs found with `rg "Copilot|copilot|98\.7|TB/s|million"`

- Replace Copilot CLI identity with Codex; retain compatibility aliases only at ingestion boundaries.
- Remove decorative hard-coded metrics and render unknown/unavailable states honestly.

## 8. Four-mode semantic theme system

**Files:** theme-engine JS/CSS, `useTheme.js`, `ThemePicker.jsx`, design-system CSS

- Shared semantic tokens: surface, text, border, focus, status, depth, graph, and motion.
- Implement Minimalist, Brutalist, Glassmorph, and restrained Neural-Cosmos Cyberpunk.
- Persist preference and honor contrast/reduced-motion settings.

## 9. Obsidian-parity Neural Vault graph

**Files:** `apps/web/lib/vault-graph.mjs`, tests, server route, neural engine, graph canvas, `views/NeuralVaultView.jsx`

- Derive nodes from Markdown and edges from wikilinks, tags, folders, and attachments; preserve orphans.
- Add `GET /api/vault/graph` with counts, freshness, truncation metadata, and filters.
- Two layouts over one identical dataset: Obsidian Parity and Cosmos Neural.
- Pan/zoom/search/filter/hover/select/focus, cluster labels, legend, table fallback.
- Tier rendering for 1k/10k/100k notes, offscreen pause, capped particles, reduced motion.

## 10. Real Agent Map and purposeful motion

**Files:** `apps/web/lib/agent-topology.mjs`, tests, `AgentMapCanvas.jsx`, `FleetView.jsx`, neural engine

- Derive relationships from configured agents, probes, assignments, subagents, task routing, and observed communication only.
- Never synthesize a central core; unknown relationships remain labeled unknown.
- Pulse=heartbeat, particles=task flow, orbit=approval dependency, urgency=incident.
- Add list/table fallback and a global motion pause.

## 11. Visual references and image-to-code

- Generate standalone references for Today, Neural Vault Cosmos, Agent Map, and the four theme modes.
- Critique hierarchy, density, accessibility, and semantic purpose before coding.
- Translate references into React/CSS/Canvas; do not ship screenshot imagery as UI.
- Use CSS/WAAPI/Canvas; do not add Hyperframes/Remotion dependencies without a measured need.

## 12. Verification and documentation

**Files:** README and architecture/theme/vault docs plus tests

- Run `npm test`, build, syntax checks, accessibility smoke checks, and 1k/10k graph benchmarks.
- Verify keyboard, narrow desktop, tablet/mobile fallback, offline and unavailable states.
- Run scoped Graphify checks and update module boundaries.
- Audit the final diff for Vault writes, secrets, fake metrics, and unrelated edits.

Commit each green task separately. Do not publish, merge, or open a PR without separate founder instruction.
