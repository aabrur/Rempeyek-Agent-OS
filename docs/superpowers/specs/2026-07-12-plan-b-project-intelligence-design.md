# Plan B Project Intelligence Workspace Design

**Status:** Proposed for founder review

## Outcome

Rempeyek opens on **Today** and lets the user reconstruct project context,
choose a next action, review approvals, dispatch a bounded resume brief, and
capture the result as project memory. The Vault remains the source of truth.

## Scope

Included:

- fail-closed local/remote security policy;
- deep Project Workspace module;
- Today/Continue flow;
- canonical next action and meaningful-activity selection;
- focused project detail;
- bounded dispatch preview and task acknowledgement;
- append-only approval records;
- project memory ingestion with explicit project/event identity;
- Copilot CLI to Codex CLI migration;
- Quiet Project Ledger visual system and accessibility floor;
- Advanced Operations for gateway, topology, schedule, and logs.

Excluded:

- new database, framework migration, WebGL, desktop shell, marketplace;
- AI prioritization, semantic search, autonomous execution, model routing;
- multi-user RBAC, TLS termination, cloud sync;
- destructive Vault restructuring.

## Architecture

### Selected seam

Create one deep **ProjectWorkspace** module. HTTP, telemetry, task inbox, and
filesystem persistence are adapters. The module hides Markdown codecs, the
three-file representation, slug/path rules, cache invalidation, idempotency,
brief generation, and event provenance.

### Interface designs considered

#### A. Command/query interface — recommended

```js
projects.query({ id })
projects.execute({ type, ...payload })
projects.ingest(projectEvent)
```

This has the highest depth and gives HTTP, tests, CLI, and future MCP callers
one stable interface. Tagged commands receive exhaustive validation. Internal
events are not exposed as the public interface.

#### B. Event-first interface

```js
projects.publish(event)
projects.subscribe(filter, handler)
projects.snapshot(projectId)
```

This improves replay flexibility but exposes sequencing/versioning complexity
and invites misuse. Rejected for the MVP.

#### C. Common-case interface

```js
projects.continue(projectId, agentId)
projects.recordDecision(projectId, text, actor)
projects.list()
```

This is easiest to use now but will grow method-by-method. Its useful
`continue` behavior becomes an `execute` command under Design A.

### Modules and adapters

- **ProjectWorkspace:** policy, selection, brief, commands, approvals, ingestion.
- **VaultProjectStore adapter:** contained paths, atomic replace, append, snapshots.
- **Telemetry adapter:** JSONL to typed ProjectEvent; legacy fuzzy matching is isolated.
- **TaskInbox adapter:** canonical dispatch to current Markdown checkbox storage.
- **Project HTTP adapter:** validates requests and maps results to safe DTOs.
- **Today frontend adapter:** owns loading, stale, offline, mutation, and refresh state.

No speculative generic repository/interface is added before a second adapter exists.

## Security Gate

Before feature work:

1. Default `DASH_HOST=127.0.0.1`.
2. Non-loopback binding requires `DASH_REMOTE=1`, a non-empty
   `DASH_TOKEN`, and exact `DASH_ALLOWED_ORIGINS`.
3. Remote mode requires token for every API request; no localhost bypass.
4. Validate Host on every request and Origin on mutations before reading bodies.
5. Missing-Origin mutation is allowed only with a valid configured token.
6. Do not add CORS.
7. `/api/agents/add` creates observe-only agents; executable trigger/home fields
   are rejected over HTTP.
8. Existing config commands remain trusted administrator code. Structured argv
   migration and OS sandboxing are deferred.

The remote token is documented as machine-administrator-equivalent.

## Today Experience

Hierarchy:

1. Page date, freshness, Refresh.
2. Continue yesterday's work.
3. Needs approval.
4. Today's next actions, maximum five.
5. Other active projects.
6. Quiet New project action.

Continue selection:

1. most recent active project with meaningful activity on the previous local day;
2. otherwise most recent meaningful activity within seven days;
3. otherwise newest active project with an explicit next action;
4. otherwise show no Continue hero.

Tie-break: human activity, then agent activity, then slug ascending. The UI
always displays the selection rationale.

Project detail replaces the Today content and restores Today scroll position on
return. It contains Overview, Next action, Approvals, Decisions, Evidence,
Files, and Dispatch.

## States

Task:

`ready → in_progress | blocked | awaiting_approval | cancelled`

`in_progress → ready | blocked | awaiting_approval | done | cancelled`

Approval:

`pending → approved | changes_requested | rejected | withdrawn`

`changes_requested → pending(new revision) | withdrawn`

Every transition has a stable ID, actor, timestamp, revision, provenance, and
append-only audit entry. Approval never auto-executes an action.

## Error and Offline Behavior

- Initial load uses region-shaped skeletons and `aria-busy`.
- Refresh retains content and shows Updating.
- Cached offline state is labelled with its timestamp and all writes are disabled.
- Detail errors stop the skeleton and provide Retry and Open in Obsidian.
- Mutations preserve input and show inline errors; no new `alert()` flows.
- Malformed project data fails per item, not for the entire page.

## Visual System and Theme Modes

The structural direction remains **Quiet Project Ledger**: asymmetric
master/detail composition, one dominant decision per screen, readable local
fonts, stable semantic states, and primitive → semantic → component tokens.

Users can switch between four maintained visual modes without changing the
information architecture or feature behavior:

1. **Minimalist** — quiet neutral surfaces, generous whitespace, almost no
   glow, flat ledger rows, strong typography, and a thin Project Thread.
2. **Brutalist** — hard contrast, squared geometry, visible grid, heavy labels,
   minimal radius, and immediate state changes without ornamental motion.
3. **Glassmorph** — translucent layered surfaces and restrained depth. Blur is
   limited to fixed navigation, overlays, and small stationary hero shells;
   scrolling lists and large canvas regions never use backdrop blur.
4. **Cyberpunk** — luxury soft-cyberpunk with controlled violet/cyan energy,
   neural fibers, luminous active states, and the richest effects. It must not
   become a gamer HUD, hacker terminal, neon overload, or fake dashboard.

All modes share component structure, spacing, status meanings, focus treatment,
44px primary targets, and WCAG 2.2 AA. Selection persists per browser and is
applied before first paint. The current 13 themes remain compatibility aliases
mapped into these four modes rather than 13 equally maintained products.

Fake metrics, world maps, literal brain artwork, Copilot imagery, decorative
throughput, and crypto-dashboard charts remain excluded.

## Neural Vault Cosmos

The Neural Vault remains a first-class specialist view. Its installation
default is:

`C:\Users\abrur\Rempeyek-Agent-Os\Obsidian Vault`

`VAULT_PATH` may still override this for portability. The resolved path is
visible in Settings and validated before scanning. The application never
restructures or bulk-modifies the Vault.

The **Cosmos Neural** visualization is built only from real Vault data:

- note nodes from Markdown files;
- neural fibers from real wikilinks;
- ghost nodes from unresolved wikilinks;
- tag constellations from real tags;
- folder regions from actual hierarchy;
- halo/intensity from degree and recent meaningful activity;
- signal particles only along existing links;
- search, filter, pan, zoom, drag, focus, and Open in Obsidian;
- an equivalent accessible list/table view.

Minimalist uses clean lines, Brutalist uses stark nodes and rigid edges,
Glassmorph uses stationary layered depth, and Cyberpunk uses the richest neural
fibers, selection shockwaves, controlled volumetric glow, and subtle parallax.
Theme changes affect material and atmosphere, never graph truth.

Effect quality scales automatically: full effects for small graphs, fewer
particles/halos for medium graphs, and folder/community aggregation for large
graphs. Hidden views pause RAF. Reduced motion removes traveling particles,
shockwaves, drift, parallax, and animated reheating while preserving content.

## Agent Map

Advanced Operations retains a visually impressive real-time Agent Map, but it
must never fabricate a central hub or relationship.

- nodes represent configured agents;
- rings represent verified process, gateway, probe, terminal, or telemetry state;
- edges represent real task assignment, spawned-subagent relation, declared
  dependency, or observed communication event;
- flowing particles represent a real queued/running task or message;
- pulse represents a recent verified heartbeat;
- blocked, approval-waiting, failed, idle, and offline use text/shape plus color;
- selecting a node opens current work, activity, health, logs, and controls;
- with no relationship data, render an honest unconnected fleet layout;
- table/list fallback is always available and becomes default on narrow or
  reduced-GPU devices.

Cyberpunk mode may use curved energy fibers, shockwaves, depth, and subtle
parallax. The other modes render the identical data using their own material
language.

## Motion

- view settle: 160–180ms opacity + 4px transform;
- detail transition: 220ms opacity + 12px transform;
- confirmed Project Thread/progress update: 320ms once;
- status marker: restrained opacity breath only while truly running;
- Neural Vault particles travel only on real edges;
- Agent Map flow appears only for real task/message movement;
- low-cost Cosmos ambience pauses whenever its view is hidden.

Reduced motion removes transforms, pulses, smooth scrolling, animated progress,
traveling particles, shockwaves, parallax, Cosmos drift, SVG animateMotion, and
view-triggered canvas reheating.

## Accessibility

- WCAG 2.2 AA;
- genuine buttons/links instead of clickable divs;
- semantic dialog with focus trap/restore and Escape behavior;
- status uses text/icon/shape, not color alone;
- minimum 44px primary mobile targets;
- live regions for mutation results without polling spam;
- progress has numeric semantics; missing milestones is not 0%;
- no horizontal page scroll at 320 CSS px or 200% zoom;
- Canvas/graph has a list/table alternative.

## Copilot to Codex Migration

The migration is explicit and reversible:

- replace presentation registry/workflow identity with `codex` / `Codex CLI`;
- update example config, telemetry documentation, and report helper validation;
- add Codex install/trigger guidance without inventing a gateway protocol;
- do not delete historical Vault lane or telemetry automatically;
- mark old Copilot artifacts as legacy and provide a manual archive decision;
- remove Copilot avatar/screenshot references from active product UI.

## Testing

Use Node's built-in `node:test`; add no test dependency.

Test seams:

- access policy and server lifecycle;
- Host/Origin/auth rejection with mutation-spy proof;
- ProjectWorkspace query/execute/ingest using a temporary Vault adapter;
- selection determinism and meaningful activity;
- task and approval transition validation;
- path containment and atomic/append behavior;
- default/configured Vault resolution and read-only graph scanning;
- graph edge provenance and performance-tier selection;
- Agent Map relationship provenance and honest no-edge state;
- four-mode token parity and persisted pre-paint selection;
- React build plus source-level accessibility checks where browser automation is unavailable.

Every behavior change follows red-green-refactor. Tests never start gateways,
touch the real Vault, or write personal config.

## Delivery Slices

1. Security policy + dependency-free test harness.
2. ProjectWorkspace seam + Vault adapter.
3. Today selection, next-action recovery, and state handling.
4. Focused detail + safe dispatch.
5. Approval records and review flow.
6. Typed project memory ingestion.
7. Codex migration.
8. Four-mode design-system migration and Today visual implementation.
9. Cosmos Neural Vault with effect tiers and accessibility fallback.
10. Data-grounded Agent Map and Advanced Operations.

Each slice is independently testable and reversible. Command Center remains
available until Today and Advanced Operations pass acceptance checks.

## Acceptance Criteria

- default server cannot accept non-loopback connections;
- remote mode fails closed without token/origin configuration;
- hostile Origin cannot invoke any mutation;
- Today identifies a project using documented deterministic rules;
- median intended resume path requires one primary action;
- missing next action has a clear recovery;
- approval and execution are visibly distinct;
- offline mode cannot mutate;
- no active UI reference to Copilot CLI remains;
- all four modes preserve content, focus, status semantics, and contrast;
- Neural Vault resolves the configured/default Obsidian Vault and every rendered
  relationship has file/link/tag/folder provenance;
- Agent Map never fabricates a relationship and exposes an equivalent table;
- hidden views pause animation and reduced motion removes nonessential effects;
- build and full test suite pass;
- no production action touches the real Vault during verification.
