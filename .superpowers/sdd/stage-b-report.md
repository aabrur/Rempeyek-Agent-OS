# Stage B — Structural Theme Architecture Report

Date: 2026-07-13
Branch: `codex/roadmap-continuation`

## Outcome

Stage B converts the four canonical theme IDs from palette-heavy variants into structural modes while preserving the React/Vite application shell, API/data contracts, actions, and existing theme persistence.

## Implementation

### Theme token layers

`packages/theme-engine/src/themes.css` now has an explicit Stage B layer:

1. Primitive font families.
2. Semantic roles for headings, UI, data text, surfaces, focus, and graph colors.
3. Structural tokens for sidebar width, page padding, card gaps, density, geometry, and responsive behavior.
4. Component application for navigation, cards, panels, project hero, topology, graph canvas, controls, and focus states.

Legacy aliases such as `--bg`, `--panel`, `--card`, `--line`, and `--acc` remain intact so existing components and internal packages do not need a breaking migration.

### Four structural modes

- `minimalist`: warm paper palette, editorial serif headings, wide whitespace, rule-based cards, flat navigation, no grid/glow, and a quiet light graph surface.
- `brutalist`: narrow dense layout, heavy grotesk type, square controls, thick rules, hard offset shadows, black active navigation, and no transparency/glow.
- `glassmorph`: larger spatial rhythm, rounded translucent planes, restrained blur, layered background depth, pill navigation, and a solid `prefers-reduced-transparency` fallback.
- `cyberpunk`: restrained dark Neural Cosmos, compact geometry, solid quiet surfaces, and glow limited to selected/focused states.

Each mode changes typography, density, sidebar geometry, navigation treatment, surface model, controls, and graph palette; identity therefore does not depend only on hue.

### ThemePicker accessibility

- Added a pure `themeSelectionFromKey()` contract to the theme engine.
- Added Left, Right, Up, Down, Home, and End navigation with wrap-around.
- Added roving `tabIndex`, programmatic focus movement, an explicit radiogroup name, and a stronger visible focus ring.
- Non-navigation keys remain available to normal radio-button behavior.

The keyboard contract was implemented TDD-first. The new test was observed failing because the helper did not exist, then passing after implementation.

### Graph theming

- Neural Canvas now reads inherited semantic graph tokens on initial data load and theme reheat.
- Theme changes refresh note/folder/tag/ghost/link/star palettes without replacing graph data.
- SVG topology node surfaces, labels, and empty-relationship text now consume theme tokens rather than fixed Cosmos colors.
- Existing Canvas 2D and SVG renderers remain dependency-free.

### Responsive structure

- `1280px`: tighter page rhythm, narrower sidebar, and a constrained three-column topology.
- `768px`: sticky compact application header, horizontally scrollable navigation, compact four-theme selector, and narrower graph controls.
- `390px`: two-row shell, compact navigation/theme targets, stacked action groups, and mobile-safe detail actions.
- Reduced motion removes theme transition behavior; reduced transparency produces solid Glassmorph planes.

## Files changed

- `apps/web/src/components/ThemePicker.jsx`
- `apps/web/src/components/TopologyMap.jsx`
- `apps/web/test/theme-engine.test.mjs`
- `packages/design-system/src/index.css`
- `packages/neural-engine/src/NeuralGraph.js`
- `packages/theme-engine/src/themes.css`
- `packages/theme-engine/src/themes.js`

No package manifest or dependency lockfile changed.

## Testing

Focused red/green test:

- `node --test apps/web/test/theme-engine.test.mjs`
- Before implementation: failed at module import because `themeSelectionFromKey` was absent.
- After implementation: 7/7 passed.

Full verification before report/commit:

- `npm test`: 33/33 passed, 0 failures.
- `npm run build`: passed; Vite transformed 54 modules and emitted the production bundle.
- `git diff --check`: passed with no whitespace errors.
- Static CSS contract check: 101 balanced blocks, four canonical modes, and responsive gates at 1280/768/390.
- `graphify update .`: completed; 567 nodes, 961 edges, 46 communities. Graphify warned that two source files produced zero nodes; neither is part of the Stage B UI change.

## Self-review

- No API, Vault, gateway, telemetry, or user-data path was changed.
- The canonical registry remains exactly `minimalist`, `brutalist`, `glassmorph`, `cyberpunk`.
- No runtime dependency was added.
- Keyboard behavior is testable without introducing a DOM test dependency.
- Canvas theme refresh reuses the same nodes and edges and rebuilds only visual palette/star state.
- Motion additions were avoided; Stage B CSS only disables transitions under reduced motion.

## Remaining browser verification

The Node harness verifies theme registry, persistence, normalization, and keyboard selection logic. It does not render CSS or React focus movement. Browser screenshot review is still required at 1440×900, 1280×800, 768×1024, and 390×844, including grayscale comparison and `prefers-reduced-transparency`. This is a release-verification concern, not evidence to claim pixel-perfect Stage A reference fidelity.
