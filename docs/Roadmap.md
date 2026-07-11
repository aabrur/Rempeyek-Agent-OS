# Roadmap

## Now (Neural Cosmos Edition — shipped)

- [x] 13-theme engine + swatch switcher
- [x] ＋ ADD AGENT (dashboard → config write with backup)
- [x] Config-driven per-agent accents
- [x] Optional Supabase mirror (`aos_agents`)
- [x] Brand sting at `/promo.html`
- [x] Monorepo restructure (`apps/` · `packages/` · `docs/` · `prompts/`)

## Next

- [ ] **Supabase table live** — run `supabase/aos_agents.sql` in the project SQL editor,
      rotate the service key (it appeared in chat once)
- [ ] **Theme-aware background layer** — procedural SVG fibers/nebula bound to `--acc`
      per theme, PNGs demoted to optional texture
- [ ] **Brand mark** — real REMPEYEK logo (Figma/Illustrator → SVG, accent-bound fills)
- [ ] **Agent edit/disable from dashboard** — extend `/api/agents/add` into full CRUD
      (`update`, `enable/disable`; delete stays manual by design)
- [ ] **Workflow cards from config** — derive Primary Workflows from agent entries
      instead of the hardcoded `WORKFLOWS` array

## Package extraction (order of attack)

Extract from `apps/web` only when a second consumer exists — no speculative splits:

1. `packages/shared` — env loader, `tailRead`, jsonl utils (bridge scripts reuse these today)
2. `packages/neural-vault` — walk/resolve/buildGraph (CLI + server both want it)
3. `packages/theme-engine` — THEMES registry + generated `[data-theme]` CSS
4. `packages/neural-engine` — NeuralGraph as a standalone ES module
5. `packages/agent-runtime` — gateway controller + summon + watchdog
6. `packages/workflow-engine` · `packages/mcp` · `packages/ui` · `packages/design-system`

Constraint: the web app must keep running with zero dependencies and no build step.

## Later

- [ ] `apps/desktop` — Tauri shell around `apps/web` (tray icon, native toasts,
      auto-start, no browser chrome)
- [ ] HyperFrames promo render (needs macOS/Linux box) — MP4 of `/promo.html` sting
- [ ] Vault graph: theme-reactive palette + community coloring from graphify
- [ ] Multi-machine mesh: read-only remote dashboards over `DASH_TOKEN`
