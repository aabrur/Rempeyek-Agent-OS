# @rempeyek/theme-engine

**Live package.** The 13-theme system.

- `themes.js` — the `THEMES` registry (id, display name, swatch, backdrop) plus
  `applyTheme` / `readTheme` / `accent()` helpers.
- `themes.css` — the 12 `:root[data-theme="…"]` token blocks. (The 13th, Neural Cosmos,
  *is* the base `:root` in [`@rempeyek/design-system`](../design-system).)

**The two files must stay in sync**: every id in `THEMES` needs a matching CSS block.

```js
import { THEMES, applyTheme, accent } from "@rempeyek/theme-engine";
import "@rempeyek/theme-engine/themes.css";

applyTheme("nebula");   // sets <html data-theme> + persists to localStorage
accent();               // "#FF7EDB" — for JS-drawn SVG/canvas that can't use var(--acc)
```

Adding a theme: a CSS block overriding at least `--acc`, `--bg`, `--panel`, `--card`,
`--card-hi`, `--line`, plus one row in `THEMES`. Keep it dark — the cosmos backdrop and
the rgba overlay stack assume a dark base.

Canonical spec: [`docs/Theme-System.md`](../../docs/Theme-System.md).
