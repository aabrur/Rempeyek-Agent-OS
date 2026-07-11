# @rempeyek/design-system

**Live package.** The global stylesheet — one import, no per-component CSS.

`index.css` carries:

- **Tokens** (`:root`) — the master accent `--acc`, the five-step surface stack
  (`--bg → --panel → --card → --card-hi → --line`), the semantic palette, and the type
  stack (`--hero` Orbitron · `--disp` Bahnschrift · `--mono` Cascadia Mono). The base
  `:root` *is* the Neural Cosmos theme; the other 12 live in
  [`@rempeyek/theme-engine`](../theme-engine).
- **Component classes** — `.panel` `.tile` `.agent-card` `.pill` `.chip` `.btn*`
  `.topology-*` `.graph-*` `.detail-*` `.token-ov` `.theme-sw` …, consumed by
  [`@rempeyek/ui`](../ui) and the app's components.
- **Ambient layers** — cosmos backdrop, nebula drift, star twinkle, skeleton shimmer.
  All motion is gated behind `prefers-reduced-motion`.

```js
import "@rempeyek/design-system/index.css";
```

Every color derives from `--acc` via `color-mix()`, so a theme swap restyles the whole
deck without touching markup. Component-scoped locals: `--ac` (per-agent accent) and
`--tile-c` (per-tile color).

Canonical spec: [`docs/Design-Bible.md`](../../docs/Design-Bible.md).
