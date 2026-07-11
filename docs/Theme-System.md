# Theme System

Neural Cosmos Edition ships **13 switchable themes**. A theme is a token override —
no markup or logic changes, only CSS custom properties.

## Token model

Single-tier tokens on `:root` in `apps/web/public/style.css`:

| Token | Role |
|---|---|
| `--acc` | master accent — every glow, border, gradient, and active state derives from it via `color-mix()` |
| `--bg` `--panel` `--card` `--card-hi` `--line` | surface stack, darkest → lightest |
| `--text` `--muted` | foreground pair |
| `--cyan` `--magenta` `--lime` `--amber` `--violet` `--red` | semantic palette (status dots, chips, chart fills) |
| `--mono` `--disp` `--hero` | type stack: data / UI / display (Orbitron) |

Component-scoped locals: `--ac` (per-agent accent, set inline) and `--tile-c`
(per-tile color), both falling back to `--acc`.

## The 13 themes

Base `:root` **is** Neural Cosmos (cyan); every other theme is a
`:root[data-theme="…"]` block overriding `--acc` + the surface stack:

`rempeyek` (violet, default) · `cosmos` · `ember` · `ghost-protocol` · `quantum-glass` ·
`dark-matter` · `nebula` · `aurora` · `midnight` · `solaris` · `crimson-rift` ·
`monochrome` · `nothing-os`

All themes are **dark by design** — the cosmos backdrop and rgba overlay stack assume
a dark base, which is why Apple Minimal / Adaptive (light) from the original spec are
intentionally not included.

## Switching

- `<html data-theme="…">` is set pre-paint by the inline script in `index.html`
  (reads `localStorage["aos-theme"]`, default `rempeyek`).
- The sidebar swatch grid is rendered from the `THEMES` registry in `app.js` —
  **the registry must mirror the CSS blocks** (id, accent swatch, backdrop).
- On switch: `data-theme` + localStorage update, `markTheme()` relabels, the render
  dirty-check is reset so the SVG topology re-reads `--acc`, and the vault graph reheats.

## Adding a theme

1. Add a `:root[data-theme="my-theme"]` block in `style.css` — override at minimum
   `--acc`, `--bg`, `--panel`, `--card`, `--card-hi`, `--line`.
2. Add `{ id: "my-theme", name: "My Theme", sw: <accent>, bg: <bg> }` to `THEMES` in `app.js`.
3. Keep it dark; check contrast of `--muted` on `--card`.

## Agent accents are identity, not theme

Per-agent colors (`accent` in `agents.config.json`, fallback `ACCENT` map in `app.js`)
deliberately **do not change** with the theme — an agent keeps its color across every
theme so the topology stays readable.
