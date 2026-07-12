# Stage E — Agent Map v2 Report

Date: 2026-07-13
Base commit: `ee50b66`
Scope: truthful Agent Map, provenance inspection, deterministic layout, accessible fallback

## Outcome

Stage E replaces the decorative radial topology and implied central hub with a provenance-first Agent Map. The current runtime truth remains eight agents and zero verified relationships. That state now renders as eight unrelated nodes in a calm deterministic grid, with no lines, core, orbit, or implied routing. A prominent explanation states exactly which evidence can create a relationship.

No dependency, framework, runtime configuration, Vault file, telemetry record, gateway, summon path, or protected user data was changed.

## Source and contract audit

`/api/agent-topology` still calls `buildAgentTopology({ agents: state.agents })`. No additional live source was connected.

- Configured `agent.dependencies` already satisfies the dependency contract because both endpoints are known agent IDs and the builder creates stable configuration provenance.
- Claude transcript activity exposes spawn descriptions, session fragments, timestamps, types, and status, but not a known child agent ID paired with a parent agent ID. It cannot create `spawned_subagent` edges.
- Cross-agent telemetry exposes event type, name/detail, status, and timestamp, but not the full `sourceAgentId`/`agentId` or `fromAgentId`/`toAgentId` pair with a stable provenance ID. It cannot create task-assignment or communication edges.
- Approval, incident, heartbeat, Vault-write, system-log, and uptime records remain context/status only. They never create edges.

The server builder now carries the verified source record status into every accepted edge. Dependency status is `configured`; task, subagent, and communication status comes from the source record or falls back to `recorded`. `flowing` remains true only for queued/running task or communication records.

The view seam independently enforces the fixed ontology mapping: `dependency → configuration`, `task_assignment → task`, `spawned_subagent → subagent`, and `communication → communication`. A known type with the wrong or unknown provenance source is rejected and counted rather than rendered.

## Deterministic relation-aware layout

`buildAgentMap()` is the deep pure module used by the UI and tests. Its interface accepts one topology DTO plus viewport/motion preferences and returns positioned nodes, routed edges, components, semantic legend data, inspectable rows, metadata, and the honest empty state.

- Input order does not affect output.
- Connected components are discovered from verified edges and ordered deterministically.
- Directed roots and evidence direction determine horizontal ranks inside connected components.
- Cyclic components use a deterministic fallback root and terminate safely.
- Unrelated agents are placed in a separate grid, never around a synthetic hub.
- Edge curves connect only their actual endpoints and use no shared center.

## Zero-edge behavior

When `hasRelationships` is false:

- zero SVG edge paths and zero particles are rendered;
- all agents remain visible and inspectable;
- the map explains that configuration, task, subagent, or communication records need known endpoints and provenance;
- `droppedRelations` is disclosed when incomplete records were rejected;
- the footer explicitly states that there is no hub and no implied connection.

The map shows a neutral loading message while `/api/agent-topology` is being checked. If refresh fails, it fails closed to current agent records with zero edges rather than retaining or inventing stale relationships.

The topology revision key sorts both agents and each agent's dependency IDs. Adding or removing a configured dependency therefore triggers a refetch even when process status and presentation fields are unchanged. Beginning any refetch immediately replaces the prior topology with the current nodes and zero edges; previous relationship evidence stays hidden until the new response is accepted.

## Provenance and interaction

The relationship vocabulary is fixed to:

- Dependency
- Task assignment
- Spawned subagent
- Communication

Every selectable relationship exposes source agent, target agent, type, source-record status, provenance source, and provenance ID in the context inspector and accessible table. Every selectable agent exposes semantic status, reported process mode, and agent ID. Agent detail remains available through an explicit inspector action.

## Status and motion semantics

Node states are derived only from existing runtime fields:

- `disabled` from `enabled:false`
- `running` from a running process record
- `error` from error/exited process state
- `observe` when no gateway actions are available
- `idle` otherwise

Process mode is shown only when the runtime reports one of `owned`, `terminal`, `service`, or `cli`.

Color is supported by visible status words and distinct marks: running fill, error diamond/X, observe dashed ring, disabled slash, and idle outline. Running heartbeat animation is status-only. Edge particles render only for `task_assignment` or `communication` edges when status is `queued`/`running`, `edge.flowing === true`, and reduced motion is not requested. Direction arrows remain static and informative under reduced motion.

## Accessibility

- Agents and relationships are keyboard-focusable and selectable.
- Arrow keys traverse every projected agent and relationship; Home/End jump; Enter/Space inspect; Escape clears.
- Focus and selection update the same context inspector.
- SVG labels announce name/route, status, mode, and provenance.
- A semantic HTML table exposes exactly the same agents and relationships, including provenance.
- Status never depends on color or motion alone.
- Narrow layouts keep the full map horizontally reachable and keep the table scrollable.

## Four structural themes

The map consumes Stage B semantic typography, radius, surface, focus, and effect tokens. Each theme defines its own readable relationship palette.

- Minimalist uses paper surfaces, editorial rules, no glow, and restrained earth-tone edges.
- Brutalist uses square geometry, thick black structure, hard shadows, and high-contrast edge colors.
- Glassmorph uses translucent layered surfaces with the existing reduced-transparency fallback.
- Cyberpunk uses restrained dark surfaces and reserves glow for selected/live evidence.

Relationship types also use different dash patterns, so they remain distinguishable beyond color.

## TDD evidence

Vertical red/green slices covered:

1. Missing Agent Map module → deterministic non-radial layout.
2. Disconnected component classification → isolated-node projection.
3. Missing zero-edge metadata → explicit empty-state guidance.
4. Missing legend/rows → complete vocabulary and provenance table projection.
5. Missing semantic state/motion flags → status, process mode, direction, and reduced-motion behavior.
6. Cyclic relation layout timed out → visited-once traversal that terminates deterministically.
7. Missing source-record status on topology edges → truthful status propagation in integration fixtures.
8. Unsupported/incomplete relationships passed the view seam → a fixed type/provenance allow-list with disclosed rejection count.
9. Dependency-only configuration changes reused the old revision key → sorted dependency IDs are now part of the pure topology revision contract.
10. Known edge types with mismatched provenance and non-semantic `flowing` flags animated → exact ontology mapping and type/status/motion gates now reject or render them statically.
11. Refresh retained old edges behind the loading state → the tested refresh transition now clears all previous edges before requesting new evidence.

## Files changed

- `apps/web/lib/agent-map.mjs`
- `apps/web/lib/agent-topology.mjs`
- `apps/web/src/components/TopologyMap.jsx`
- `apps/web/src/components/AddAgentModal.jsx`
- `apps/web/src/views/CommandCenter.jsx`
- `apps/web/test/agent-map.test.mjs`
- `apps/web/test/agent-topology.test.mjs`
- `packages/design-system/src/index.css`
- `packages/theme-engine/src/themes.css`
- `.superpowers/sdd/stage-e-report.md`

## Verification

- Focused Agent Map/topology tests: 13/13 passed.
- Full `npm test`: 64/64 passed, 0 failures.
- `npm run build`: passed; Vite transformed 60 modules.
- `git diff --check`: passed.
- Graphify code-only incremental update: review changes re-extracted; query resolves `agentTopologyRevision()`, `beginTopologyRefresh()`, `buildAgentMap()`, and `TopologyMap()` in the Agent Map community.

## Self-review and known concerns

- The current production response correctly remains eight nodes and zero edges; relationship fixtures exist only in pure/integration tests.
- No existing telemetry or transcript shape satisfies the full endpoint/provenance contract, so wiring it would fabricate identity and was deliberately rejected.
- The map is SVG and DOM based. It is appropriate for the current eight-agent fleet; a much larger fleet would need a separate render-budget review.
- Browser screenshot automation was not run because starting the production server activates runtime polling and bridges that may write operational data. Interactive verification remains a release-gate task in a safe mocked browser harness.
- The table fallback is always present behind a native disclosure, so all data remains accessible even when SVG interaction support varies.
