# Agent Map Neural Constellation Design

## Goal

Turn the existing evidence-first Agent Map into a premium neural constellation without redesigning the surrounding REMPEYEK Agent OS dashboard or inventing runtime data.

The approved visual reference is [agent-map-neural-constellation.png](../../design-refs/agent-map-neural-constellation.png). It translates the user's supplied composition into the repository's existing Neural Cosmos design system.

## Visual direction

- Keep the current theme tokens, Orbitron/Bahnschrift/Cascadia hierarchy, semantic status colors, and the four existing theme profiles.
- Use one real, highest-degree agent as the visual anchor when verified relationships exist. Never create a synthetic core or relationship.
- Render agents as readable capsule-orbit nodes with real avatars, names, status, mode, and verified-link count.
- Use curved evidence paths, restrained orbital guides, and a selected-node focus ring. The map should feel like a premium instrument rather than a game HUD.
- Preserve flat-theme behavior: minimalist and brutalist receive structure and hierarchy without glow, blur, or decorative motion.
- Avoid nested card stacks, fake metrics, fake capabilities, fake relationship strength, or decorative provenance.

## Information architecture

The component remains a three-part instrument at wide widths:

1. Runtime rail: real status totals, network load, access mode, and mean uptime.
2. Constellation canvas: the verified graph, honest empty/loading/error state, zoom controls, and keyboard help.
3. Evidence inspector: selected agent or relationship, incident verified links, runtime metadata, and the existing deep-link to agent detail.

Below 1200 px, the inspector moves beneath the map. Below 900 px, both side rails become responsive grids. Below 560 px, the fixed SVG stage scrolls horizontally so labels and hit targets do not collapse.

## Data and layout logic

- `buildAgentMap()` remains the only projection seam between topology evidence and UI.
- Unsupported, endpoint-incomplete, self-referential, or provenance-incomplete edges continue to be dropped.
- Each connected component selects an anchor deterministically by highest degree, breaking ties by agent ID.
- The primary component receives the visual center. Neighbors occupy deterministic elliptical rings; disconnected agents remain visibly isolated in a peripheral band.
- Layout output includes node role, capsule size, degree, and incident relationship IDs so rendering does not recompute graph semantics.
- Zero-edge topology uses the existing grid and explicitly has no anchor.

## Motion and performance

- Add the already-present `framer-motion@12.42.2` package as an explicit web workspace dependency.
- Use Framer Motion only for SVG node entrance/selection, inspector crossfades, and zoom/view-box transitions.
- Keep live-flow semantics unchanged: only queued/running task-assignment or communication evidence can animate.
- Animate only transform, opacity, path length, and view-box values. Do not animate layout properties.
- Respect `prefers-reduced-motion`; flat themes also disable luminous effects through existing semantic tokens.
- Memoize pure node/edge renderers and precompute incident relationship data in the view model.
- Preserve VortexBackdrop's DPR cap and hidden-tab pause behavior.

## Accessibility

- Keep agents and relationships keyboard reachable with arrow/Home/End navigation, Enter/Space inspection, and Escape clearing.
- Use real avatar images with non-text SVG decoration hidden from assistive technology; the interactive group retains the complete accessible label.
- Zoom and reset controls are native buttons with explicit labels and at least 44 px hit targets on touch widths.
- Visible focus uses existing theme tokens; status is always expressed in text as well as color.
- The accessible evidence table remains a complete alternative representation.

## Verification

- Model tests prove deterministic anchor selection, no synthetic hub, honest zero-edge behavior, provenance filtering, live-flow gating, and non-overlapping positions.
- Existing theme, server, and neural graph tests remain green.
- `npm test` and `npm run build` pass.
- Visual verification covers cyberpunk, minimalist, brutalist, and glassmorph at desktop plus a 375 px viewport and reduced motion.
- `graphify update .` succeeds after source changes.

