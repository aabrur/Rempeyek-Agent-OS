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
- `apps/web/src/hooks/useTheme.js`
- `apps/web/test/neural-theme.test.mjs`
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

## Review fixes

Follow-up review identified cascade and renderer synchronization ambiguity. The corrective patch makes the following contracts authoritative:

- Responsive rules now cascade in explicit order: `1280px` → `1000px` → `768px` → `390px`. At every collapsed width (`<=1000px`), the sidebar is explicitly `width: 100%` and topology is explicitly one column, so the broader 1280px rule cannot restore a narrow sidebar or three-column topology.
- `activateTheme()` applies the canonical `data-theme` value before reading the computed accent. The theme-selection callback calls it synchronously before React publishes the new theme state, guaranteeing that Canvas `reheat()` observes the new CSS variables rather than the previous theme.
- `resolveGraphPalette()` is a pure contract that resolves node colors and separate `link`, `ghost`, `tag`, and `folder` edge colors. The Canvas applies all four values on initial data and every theme reheat.
- SVG glow is class/token controlled. Only flowing edges and active rings receive the semantic `top-glow` class. Minimalist and Brutalist resolve the filter to `none`, suppress hover drop-shadows, and remove the outer node halo. Glassmorph and Cyberpunk retain active-state glow.
- Duplicate early theme blocks were removed. `themes.css` now has one token block per canonical theme and one shared accessibility/focus owner; the duplicate ThemePicker focus rule was removed from the base design stylesheet.
- Minimalist preview metadata now matches the implemented warm-paper theme (`#805B3E` on `#F4EFE6`).

### Review-fix tests

- TDD red state: focused tests failed because `activateTheme` and `resolveGraphPalette` did not yet exist.
- Focused green state: 9/9 passed.
- Final `npm test`: 35/35 passed, 0 failures.
- Final `npm run build`: passed; Vite transformed 54 modules.
- Final `git diff --check`: passed.
- Static CSS contract: 93 balanced blocks, authoritative responsive order, and four distinct edge-token roles.

## Final Canvas theme review

The final reviewer pass found remaining dark-Cosmos constants inside the Canvas draw path. The renderer contract was extended without changing graph data or physics:

- `resolveGraphPalette()` now resolves semantic label, folder-label, hover-label, metadata, node-core, particle, particle-glow, edge-highlight, and wave colors.
- The same resolver returns explicit `glow`, `halo`, and `shadow` effect flags.
- Minimalist and Brutalist set all three flags to false. Their draw path skips radial hub gradients and neural waves, never applies a positive `shadowBlur`, and uses readable light-surface foreground tokens.
- Glassmorph and Cyberpunk opt into restrained semantic effects while retaining the existing `effectTier` performance guard.
- Hard-coded Cosmos label, highlight, particle, core, and metadata colors were removed from `draw()`.
- A pure light-theme test proves dark foreground resolution and false effect flags; default effect behavior remains covered as enabled.

### Final Canvas verification

- TDD red state: light-theme foreground/effect assertions failed because the resolver did not expose those contracts.
- Focused green state: 2/2 Canvas theme tests passed.
- Final `npm test`: 36/36 passed, 0 failures.
- Final `npm run build`: passed; Vite transformed 54 modules.
- Final `git diff --check`: passed.
- Renderer static contract: semantic foreground tokens are present, legacy draw-path color literals are absent, the halo loop is flag-guarded, and two structural modes explicitly disable glow.
