# Roadmap

## Now (Neural Cosmos Edition — shipped)

- [x] Four structural themes: Minimalist, Brutalist, Glassmorph, and Cyberpunk
- [x] ＋ ADD AGENT (dashboard → config write with backup)
- [x] Config-driven per-agent accents
- [x] Brand sting at `/promo.html`
- [x] Monorepo restructure (`apps/` · `packages/` · `docs/` · `prompts/`)
- [x] **React migration** — the single-page vanilla frontend split into components
      (Vite + npm workspaces); `ui`, `design-system`, `theme-engine`, and
      `neural-engine` are now real packages
- [x] Supabase mirror removed — nothing read from it; the filesystem is the only store
- [x] **Workspace front door** — `Projects/<slug>/` workspaces (project.md · decisions.md
      · next.md), Continue hero, decision log, resume-brief dispatch, and telemetry
      `task_done` → decisions.md memory capture (watermarked)
- [x] **Typed public Marketplace** — dated 20-agent curation plus separate
      Agents, Plugins, and Skills filters; featured managed Hypertaks and
      official-link Crimson Odyssey
- [x] **Complete profile lifecycle** — edit, enable/disable, active switch,
      non-destructive Remove/Restore, retained children, and separate
      double-approved reviewed uninstall
- [x] **Primary-profile subagents** — existing-style `+` form, safe defaults,
      non-clobbering vault scaffold, and provenance-backed Agent Map edge
- [x] **Recovery and privacy controls** — atomic registry backup restore, exact
      owned-log deletion, local retention/telemetry settings, and redacted
      diagnostics

## Next

- [ ] **Workspace upgrade path** — convert existing flat `Projects/<name>.md` notes and
      legacy folders (spaces/uppercase names) into workspaces from the dashboard

- [ ] **Theme-aware background layer** — procedural SVG fibers/nebula bound to `--acc`
      per theme, PNGs demoted to optional texture
- [ ] **Brand mark** — real REMPEYEK logo (Figma/Illustrator → SVG, accent-bound fills)
- [ ] **Workflow cards from config** — derive Primary Workflows from agent entries
      instead of the hardcoded `WORKFLOWS` array in `lib/agents.js`
- [ ] **Route the views** — the app switches views in state; move to real URLs so
      `/agents/hermes` is linkable and the browser Back button works

## Package extraction (remaining)

Frontend packages are done. What's left is the **server**, which is still one
~1300-line file. Extract only when a second consumer appears — no speculative splits:

1. `packages/shared` — env loader, `tailRead`, jsonl utils (`scripts/` duplicates these today)
2. `packages/neural-vault` — walk/resolve/buildGraph (a CLI + the server both want it)
3. `packages/agent-runtime` — gateway controller + summon + watchdog
4. `packages/workflow-engine` · `packages/mcp`

Constraint: **the server must stay dependency-free** — it has to run with
`node apps/web/server.js` and no `node_modules`. Build tooling is frontend-only.

## Later

- [ ] `apps/desktop` — Electron shell around the existing web app with isolated
      renderer/preload boundaries, supervised local runtime, signed stable
      updates, tray support, and Windows packaging
- [ ] HyperFrames promo render (needs macOS/Linux box) — MP4 of the `/promo.html` sting
- [ ] Vault graph: theme-reactive palette + community coloring from graphify
- [ ] Multi-machine mesh: read-only remote dashboards over `DASH_TOKEN`
