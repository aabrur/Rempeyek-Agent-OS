# Agent Map Neural Constellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a data-honest, avatar-led neural constellation Agent Map that matches the approved reference while preserving all existing themes and provenance rules.

**Architecture:** Extend the existing `buildAgentMap()` projection with deterministic real-agent anchoring and capsule layout metadata, then keep rendering inside `TopologyMap.jsx`. Framer Motion handles bounded presentational transitions; CSS and theme tokens own appearance across all four theme profiles.

**Tech Stack:** React 18, Framer Motion 12.42.2, SVG, CSS custom properties, Node test runner, Vite.

## Global Constraints

- Do not redesign dashboard navigation, cards outside Agent Map, server topology collection, or the theme system.
- Never synthesize an agent, edge, relationship type, metric, capability, or provenance record.
- Only queued/running task-assignment and communication edges may animate.
- Preserve keyboard navigation, reduced motion, flat-theme effect gates, and the accessible evidence table.
- Use the existing avatars served by `/avatars/<agent-id>.<ext>`; fall back to a text glyph without emoji-dependent structure.
- Keep the generated reference at `docs/design-refs/agent-map-neural-constellation.png` as design evidence, not a runtime asset.

---

### Task 1: Declare motion dependency and lock the graph projection contract

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/test/agent-map.test.mjs`

**Interfaces:**
- Consumes: existing `buildAgentMap(topology, options)`.
- Produces: assertions for `node.isAnchor`, `node.width`, `node.height`, deterministic center placement, and zero-edge no-anchor behavior.

- [ ] **Step 1: Add failing model assertions**

Add a connected graph where one real agent has the highest degree. Assert that it alone has `isAnchor === true`, is closest to the canvas center, every node has positive capsule dimensions, all node centers are unique, and no `synthetic` node exists. Add a tied-degree graph that selects the lexicographically first ID. Extend the zero-edge test with `map.nodes.every(node => !node.isAnchor)`.

- [ ] **Step 2: Run the focused test**

Run: `node --test apps/web/test/agent-map.test.mjs`

Expected: FAIL because the current projection does not expose capsule or anchor metadata.

- [ ] **Step 3: Declare Framer Motion reproducibly**

Run: `npm.cmd install framer-motion@12.42.2 --workspace @rempeyek/web`

Expected: `apps/web/package.json` and `package-lock.json` contain the exact dependency and `npm.cmd ls framer-motion --depth=0` no longer reports it as extraneous.

### Task 2: Implement deterministic evidence-driven constellation layout

**Files:**
- Modify: `apps/web/lib/agent-map.mjs`
- Test: `apps/web/test/agent-map.test.mjs`

**Interfaces:**
- Produces: each projected node has `{ isAnchor, width, height, degree, componentId, isolated }` plus existing fields.
- Preserves: `rows`, `legend`, metadata, provenance filtering, status semantics, and edge animation semantics.

- [ ] **Step 1: Add deterministic anchor selection**

For each connected component, compute degree from already-validated edges and select the highest-degree member, breaking ties with `String(id).localeCompare()`.

- [ ] **Step 2: Project constellation positions**

Place the primary component around the canvas center with its real anchor in the middle and sorted remaining members on bounded elliptical rings. Place secondary connected components in reserved bands and isolated agents in the existing peripheral grid. Assign `width: 150, height: 64` to anchors and `width: 126, height: 54` to orbit nodes; clamp centers so capsules and labels remain within the view box.

- [ ] **Step 3: Route curves around capsule centers**

Keep deterministic quadratic paths, reduce bend on short edges, and preserve directional marker and live-flow decisions.

- [ ] **Step 4: Run the focused test**

Run: `node --test apps/web/test/agent-map.test.mjs`

Expected: all Agent Map tests pass.

### Task 3: Rebuild the map renderer as an interactive neural constellation

**Files:**
- Modify: `apps/web/src/components/TopologyMap.jsx`
- Modify: `packages/design-system/src/index.css`
- Modify: `packages/theme-engine/src/themes.css`

**Interfaces:**
- Consumes: projected capsule geometry and existing `agentAccent()`.
- Produces: `ConstellationNode`, `ConstellationEdge`, zoom controls, and an evidence-rich inspector while keeping the component's public props unchanged.

- [ ] **Step 1: Add Framer Motion primitives**

Import `AnimatePresence`, `motion`, and `useReducedMotion`. Replace the local reduced-motion hook with Framer Motion's hook and retain the theme-effect gate.

- [ ] **Step 2: Render capsule nodes with real avatars**

Render each node as a memoized `motion.g`: orbital selection ring, double-bezel capsule, circular avatar clip, status mark, name, status/mode, and verified-link count. Use `<image href={node.avatar}>` when present and a deterministic one- or two-character text glyph otherwise. Keep the group itself keyboard focusable with the existing complete `aria-label`.

- [ ] **Step 3: Render evidence paths and focused state**

Render validated paths beneath nodes. Framer Motion reveals path length on load and emphasizes only the selected relationship or an edge incident to the selected agent. Keep `animateMotion` only for already-approved live-flow particles and omit it when reduced motion is active.

- [ ] **Step 4: Add bounded zoom controls**

Use native buttons for zoom out, reset/fit, and zoom in. Clamp zoom to `0.85..1.25` and derive the SVG view box around its center so zoom never changes the data model.

- [ ] **Step 5: Upgrade the inspector without fake data**

For an agent, show avatar, status, mode, ID, degree, component state, and incident verified relationship rows with type, peer, and provenance. For an edge, retain route, status, provenance source, and provenance ID. Crossfade content with `AnimatePresence`.

- [ ] **Step 6: Apply theme-native styling**

Add orbital guides, capsule bezels, avatar wells, control styling, selected-edge dimming, and responsive rails using existing semantic tokens. Override only effect intensity/geometry needed for minimalist, brutalist, glassmorph, and cyberpunk; never hardcode readable foregrounds inside the component.

### Task 4: Verify behavior, themes, performance, and graph state

**Files:**
- Modify if needed: `apps/web/test/agent-map.test.mjs`
- Generated update: `graphify-out/graph.json` and related graph outputs

**Interfaces:**
- Consumes: completed implementation.
- Produces: green test/build output and a current repository graph.

- [ ] **Step 1: Run focused and full tests**

Run: `node --test apps/web/test/agent-map.test.mjs`

Run: `npm.cmd test`

Expected: 0 failures.

- [ ] **Step 2: Build production assets**

Run: `npm.cmd run build`

Expected: Vite exits 0 without unresolved imports or bundle errors.

- [ ] **Step 3: Check source hygiene**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Validate the live page**

Run the local server, inspect Agent Map in cyberpunk, minimalist, brutalist, and glassmorph, then inspect 375 px and reduced-motion modes. Confirm avatars load, status text is readable, no capsule overlaps, all controls receive visible focus, and the browser console has no errors.

- [ ] **Step 5: Refresh Graphify**

Run: `graphify update .`

Expected: the graph update succeeds without shrinking or integrity errors.

### Task 5: Commit, push, and synchronize the shared operating record

**Files:**
- Create: OS-temp handoff Markdown document
- Create/update: `Obsidian Vault/Daily/Agents/2026-07-16-Codex.md`
- Modify: `Obsidian Vault/Brains/Codex/Memory.md`
- Create/update: relevant `Obsidian Vault/Projects/` note if one already owns REMPEYEK Agent OS state

**Interfaces:**
- Produces: reproducible Git history, pushed `main`, compact handoff, and vault SSOT record.

- [ ] **Step 1: Review final diff and current branch**

Run: `git status --short --branch` and `git diff --stat`.

Expected: only scoped Agent Map, dependency, test, graph, design evidence, and vault record changes are present; branch is `main`.

- [ ] **Step 2: Commit implementation**

Stage only scoped files and commit with `feat(agent-map): build neural constellation experience`.

- [ ] **Step 3: Push normally**

Run: `git push origin main`

Expected: non-force push succeeds and `origin/main` equals `HEAD`.

- [ ] **Step 4: Write handoff and vault records**

Save a redacted handoff to the Windows temp directory. Append the verified outcome, test/build evidence, commit, and design decisions to the Codex daily log and durable memory. Update an existing project note only if it is already the canonical Agent OS state note.

