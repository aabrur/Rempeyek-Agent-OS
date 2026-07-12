# Stage D Report — Neural Vault Cosmos v2

## Outcome

Stage D replaces the unstable/decorative graph behavior with a deterministic,
Obsidian-backed Canvas 2D experience. Cosmos, Parity, neighborhood focus, visible
counts, and the accessible table are all projections of the same API dataset.

## Implemented

- Added a pure graph-view model with stable seeded identity, folder clusters,
  adjacency springs, degree-derived mass, layer projection, neighborhood focus,
  breadcrumbs, keyboard ordering, and snapshot-change detection.
- Replaced `Math.random()` layout and field generation with dataset/node seeded
  generation. Existing positions are retained while switching mode, layers, or
  neighborhood within one source snapshot.
- Removed directional wikilink particles and automatic random firing. Wikilinks
  remain truthful undirected relationships.
- Added semantic graph effects:
  - node radius, mass, and halo derive from `degree`;
  - recency bloom derives from note `mtime` relative to `metadata.generatedAt`;
  - unresolved ghost nodes/edges are faded and dashed;
  - shockwaves occur only after explicit selection;
  - dashed change rings derive from comparison with the preceding API snapshot.
- Added explicit `OBSIDIAN PARITY` defaults (notes + resolved/ghost links) and
  optional tag/folder overlays. Cosmos enables all four layers.
- Added search, pointer selection, double-click open, keyboard selection/open,
  neighborhood focus/clear, breadcrumbs, inspector metadata/actions, semantic
  legend, visible counts, motion pause/resume, and same-projection table fallback.
- Added responsive layout, visible Canvas focus, touch-sized controls, explicit
  loading failure feedback, and reduced-motion/static rendering behavior.
- Updated package documentation to describe the data provenance of effects.
- Updated and queried Graphify after implementation; the Neural Vault files and
  tests form a dedicated graph community.

## Verification

- `npm test`: **54 passed, 0 failed**.
- `npm run build`: production Vite build succeeded.
- `git diff --check`: passed.
- `rg "Math\\.random" packages/neural-engine`: no matches.
- Fixture benchmark (1,000 notes, 1,978 edges, the real `reduced` profile with
  28 deterministic iterations and capped halo/label/shadow workload):
  **121.83 ms layout + 11.42 ms projection = 133.25 ms total** in the recorded
  full-suite reduced-profile run. The assertion budget is
  1,500 ms to remain stable on slower developer machines.
- Read-only validation against the current real Vault snapshot: **266 notes, 356
  nodes, 557 edges, `effectTier: reduced`**, with layout + projection measured at
  **36.62 ms**. No Vault file or `.obsidian/` content was modified.

## Architecture Decision

Canvas 2D and the existing imperative `NeuralGraph(canvas)` boundary remain. A
worker, parser cache, WebGL, and new dependencies are deferred: the measured real
Vault update and the 1,000-node fixture do not demonstrate that parsing/layout is
the bottleneck. Adding that complexity now would not be evidence-based.

## Review Follow-up

- React now subscribes to live `prefers-reduced-motion` changes. When the operating
  system blocks motion, both UI and renderer stop, selection waves are cleared, and
  the disabled control reads `SYSTEM MOTION OFF`. When the preference clears, motion
  remains paused until the user explicitly chooses `RESUME`.
- `metadata.effectTier` now selects a pure, tested render profile. `reduced` and
  `aggregate-ready` progressively lower layout iterations, halo limits, star-field
  density, shadow work, node-core work, and automatic label density without removing
  nodes or edges.
- The graph toolbar now preserves isolated layer/mode groups and wraps at 860 px,
  collapses to one column at 768 px, and uses two-column control groups at 390 px.
- The neighborhood banner resolves its label from `focusId`; changing the inspector
  selection can no longer rename an active neighborhood.

## Honest Constraints / Follow-up

- The automated benchmark measures deterministic layout/projection update time in
  Node. It cannot measure Canvas draw calls, RAF cadence, GPU/compositor time, or
  input latency. The repository contains no Playwright/Chromium performance harness,
  and adding/downloading a browser dependency would violate this stage's no-new-
  dependency constraint. Interactive frame profiling therefore remains a named
  evidence gap and should be captured manually on target hardware if the graph
  approaches 1,000+ visible nodes.
- Obsidian Parity means the same note/wikilink/ghost truth and explicit overlays;
  it does not claim pixel-identical reproduction of Obsidian's proprietary force
  layout.
- The Cosmos ambient field is deterministic visual atmosphere and is not presented
  as telemetry or knowledge flow.
- At much larger Vault sizes, the table may need pagination/virtualization and the
  renderer may need level-of-detail aggregation. Those changes are intentionally
  deferred until measured thresholds justify them.
