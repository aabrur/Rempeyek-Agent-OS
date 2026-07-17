# Theme System

Rempeyek Agent OS exposes four structural appearance modes over one semantic token contract:

- `minimalist` — calm, content-first surfaces and restrained depth.
- `brutalist` — hard borders, compact geometry, high contrast, and no decorative blur.
- `glassmorph` — translucent hierarchy with controlled blur and light.
- `cyberpunk` — the Neural Cosmos identity: cyan light (`#00d4ff`) on deep-navy space
  (`#030918`) with self-hosted Orbitron / Rajdhani / JetBrains Mono display faces.

Legacy theme IDs remain migration aliases in `packages/theme-engine/src/themes.js`; they are not active product themes.

## Token model

Theme values live in `packages/theme-engine/src/themes.css`. Components consume semantic tokens from `packages/design-system/src/index.css`, including surface, foreground, border, focus, radius, shadow, blur, graph, status, and motion values. Per-agent identity uses the local `--ac` token and remains stable between modes.

The Agent Map consumes its own `--cosmos-*` namespace (canvas, panel, node fill, ink,
status colors, connection tiers strong/data/weak, nebula, star). Canon values are the
cyberpunk palette in `:root`; each other mode overrides the full set. Luminous effects
(glow filters, stars, particles, dash flow) are gated by the shared `--graph-effect-glow`
token — `0` in minimalist/brutalist — read live by `useEffectsEnabled()`, so flat modes
need no per-component branches. Display faces ship self-hosted from
`apps/web/public/fonts/` (Orbitron and JetBrains Mono as variable fonts, Rajdhani 400/600,
all latin-subset woff2 under the OFL — license texts alongside the files).

## Switching

- `apps/web/index.html` validates and migrates the stored value before first paint.
- `ThemePicker.jsx` exposes the four modes as a labeled radio group.
- `useTheme.js` persists the canonical ID and refreshes canvas/SVG accent values.
- Unknown values fall back to `cyberpunk`.

## Accessibility and motion

Every mode must retain visible focus, readable foreground contrast, and non-color status labels. `prefers-reduced-motion`, forced colors, and reduced-transparency preferences remove or reduce nonessential effects. Graph content always has a non-canvas table representation.

## Adding or changing a mode

1. Add or update its registry entry in `packages/theme-engine/src/themes.js`.
2. Define the full semantic override in `packages/theme-engine/src/themes.css`.
3. Test all four modes; do not add component-specific theme branches.
4. Verify keyboard focus, contrast, reduced motion, graph readability, and narrow layouts.
