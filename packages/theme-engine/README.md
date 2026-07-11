# @rempeyek/theme-engine

**Extraction target — code lives in `apps/web` today.**

The 13-theme system: `THEMES` registry, `[data-theme]` token blocks, swatch-grid
switcher, localStorage persistence, live re-render hooks.

Canonical spec: [`docs/Theme-System.md`](../../docs/Theme-System.md).
Current source: `apps/web/public/style.css` (theme blocks) +
`apps/web/public/app.js` (`THEMES`, `renderThemePick`, `markTheme`).

Extraction shape: a `themes.json` single source of truth that generates both the CSS
blocks and the JS registry.
