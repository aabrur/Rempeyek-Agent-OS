# Architecture

REMPEYEK AGENT OS is a **zero-dependency** agentic operating system: a pure Node.js
server + vanilla JS frontend, no build step, no npm packages. The Obsidian Vault is
the shared memory layer; agent CLIs are the compute layer; the dashboard is the
command deck over both.

## Repository layout (monorepo)

```
Rempeyek-Agent-OS
├── apps/
│   ├── web/            # the dashboard: server.js + public/ (runs today)
│   └── desktop/        # future native shell (Tauri/Electron) around apps/web
├── packages/           # extraction targets — manifests now, code as apps/web is split
│   ├── ui/             # reusable UI components (cards, pills, modals, panels)
│   ├── design-system/  # tokens, typography, spacing, motion rules
│   ├── theme-engine/   # THEMES registry + [data-theme] token blocks
│   ├── neural-engine/  # NeuralGraph force-directed canvas renderer
│   ├── neural-vault/   # vault scan, wikilink resolver, graph builder
│   ├── agent-runtime/  # gateway controller, summon, watchdog, telemetry
│   ├── workflow-engine/ # task routing, schedules, daily bridges
│   ├── mcp/            # MCP/connector integrations (Supabase mirror, …)
│   └── shared/         # cross-cutting utils (env, paths, jsonl, tailRead)
├── docs/               # this documentation set
├── prompts/            # system + role prompts for the agent fleet
├── scripts/            # bridges (hermes-daily-bridge.cjs)
├── supabase/           # cloud mirror DDL (aos_agents.sql)
├── telemetry/          # per-agent JSONL event streams (runtime data)
└── Obsidian Vault/     # the memory layer (gitignored, personal)
```

**Runtime data stays at the repo root** (`telemetry/`, `agents.config.json`, `.env`,
`Obsidian Vault/`) — agent CLIs and bridges write there regardless of how the app
code is organized. `apps/web/server.js` resolves them via `ROOT = __dirname/../..`.

## apps/web — the dashboard

One HTTP server (`server.js`, ~1300 lines, Node core modules only):

- **Static serving** of `apps/web/public/` with traversal guard.
- **`/api/state`** — the main poll: vault stats, agents (+ proc/term/uptime/avatar), review items, projects.
- **Gateway control** — `/api/proc/:id/(start|stop|restart|status|run|terminal|stop-term)` runs each
  agent's real gateway CLI; summoned terminals use a pid-file/kill-file handshake (see
  [Agent-System](Agent-System.md)).
- **`/api/graph`** — Neural Vault graph built from the vault markdown (see [Neural-Vault](Neural-Vault.md)).
- **`/api/agents/add`** — registers a new agent into `agents.config.json` (backup + cache invalidation).
- **Reports, tasks, schedule, vault-health** — see the endpoint dispatch block in `server.js`.
- **Auth** — header-only `x-dash-token`, constant-time compare, localhost bypass.

Frontend: `public/app.js` (render loop, topology SVG, theme switcher, add-agent modal),
`public/graph.js` (NeuralGraph engine), `public/style.css` (design tokens + 13 themes),
`public/index.html` (single-page shell, 5 views), `public/promo.html` (12s brand sting).

## Data flow

```
Agent CLIs ──(write)──> Obsidian Vault  ──(walkVault)──> /api/state · /api/graph
Agent CLIs ──(append)─> telemetry/*.jsonl ──(tailRead)──> detail panels, uptime
Dashboard  ──(spawn)──> gateway CLIs (start/stop/status) / summoned admin terminals
Dashboard  ──(write)──> Vault Tasks/, Reports/, Inbox/ (alerts)
Server     ──(upsert)─> Supabase aos_agents (optional mirror, service key in .env)
```

## Design constraints

1. **Zero dependencies** — the whole OS must run with `node apps/web/server.js`. Any
   package extraction must not introduce a build step for the web app.
2. **Filesystem is the source of truth** — Supabase or any cloud layer is a mirror,
   never the primary store.
3. **The vault is sacred** — the dashboard only appends/edits inside `Tasks/`, `Reports/`,
   `Inbox/`, and `Brains/<lane>/`; it never restructures the vault.
