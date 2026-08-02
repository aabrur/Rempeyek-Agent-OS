# Architecture

REMPEYEK AGENT OS is an agentic operating system: a **zero-dependency Node.js server**
+ a **React (Vite) frontend**, organized as an npm-workspaces monorepo. The Obsidian
Vault is the shared memory layer; agent CLIs are the compute layer; the dashboard is
the command deck over both.

## Repository layout (monorepo)

```
Rempeyek-Agent-OS
├── apps/
│   ├── web/            # server.js (API, zero-dep) + src/ (React) + dist/ (built)
│   └── desktop/        # Electron main/preload + Windows package configuration
├── packages/
│   ├── ui/             # ✅ React primitives (Btn, Pill, Panel, Chip, Overlay, Avatar…)
│   ├── design-system/  # ✅ the global stylesheet: tokens + component classes
│   ├── theme-engine/   # ✅ THEMES registry + the 13 [data-theme] token blocks
│   ├── neural-engine/  # ✅ NeuralGraph force-directed canvas renderer (ESM)
│   ├── neural-vault/   # ⏳ vault scan, wikilink resolver, graph builder
│   ├── agent-runtime/  # ⏳ gateway controller, summon, watchdog, telemetry
│   ├── workflow-engine/# ⏳ task routing, schedules, daily bridges
│   ├── mcp/            # ⏳ connector integrations
│   └── shared/         # ⏳ cross-cutting utils (env, paths, jsonl, tailRead)
├── docs/  prompts/  scripts/  telemetry/  Obsidian Vault/
```

✅ = a real package the app imports · ⏳ = still inside `server.js`, see [Roadmap](Roadmap.md)

Source-checkout runtime data can stay at the repo root (`telemetry/`,
`agents.config.json`, `.env`, `Obsidian Vault/`) for backward compatibility.
Fresh browser and desktop installations default private state to
`%LOCALAPPDATA%\Rempeyek-Agent-OS`; `AGENT_STATE_DIR`, `AGENTS_CONFIG`, and
`VAULT_PATH` can override the browser/server paths.

## Running it

| Command | What it does |
|---|---|
| `npm install` | installs React/Vite, links the workspace packages |
| `npm run dev` | builds the frontend, then starts the server on :4321 |
| `npm run ui` | Vite dev server on :5173 (HMR), proxying `/api` → :4321 - run `npm run server` alongside |
| `npm run build` | emits `apps/web/dist/` |
| `npm run desktop:dev` | starts the Electron shell against an owned local server |
| `npm run desktop:pack` | creates an unpacked Windows test application |
| `npm run desktop:dist` | creates unsigned Windows x64 NSIS and portable test artifacts |

The **server itself stays dependency-free** - React/Vite are frontend-only. `server.js`
serves `dist/`, falling back to `public/`; `/avatars/*` always comes from `public/`, so
runtime uploads survive a rebuild.

## apps/desktop - native boundary

Electron main owns the desktop lifecycle. It starts exactly one Node child from
the packaged `apps/web` control plane on an operating-system-assigned loopback
port, waits for an IPC readiness message, and shuts down only that owned child.
The existing Vite renderer is reused without a desktop redesign.

The renderer runs with Node integration disabled, context isolation enabled,
sandboxing enabled, and web security enabled. A narrow CommonJS preload exposes
only fixed runtime, settings, path-opening, and update methods. A random
desktop-session token is passed to the owned server through its environment and
injected by Electron's session layer only for the exact owned origin; it is not
exposed to renderer JavaScript or preload.

Desktop-native settings, private registry, vault, telemetry, logs, receipts, and
update state live under `%LOCALAPPDATA%\Rempeyek-Agent-OS`. Packaged application
assets under `resources\app-root` are read-only inputs. The NSIS configuration
sets `deleteAppDataOnUninstall: false`, so removing the application does not
delete the user's retained state.

The server child does not inherit source-checkout path overrides or remote
dashboard mode. Main removes `AGENTS_CONFIG`, `VAULT_PATH`, `DASH_REMOTE`,
`DASH_TOKEN`, `DASH_ALLOWED_ORIGINS`, and conflicting host/port/session values
before applying its fixed desktop environment.

The packaged updater uses `electron-updater` as an injected state machine.
Stable excludes prereleases; Preview permits them. A check may discover and
download an update, but installation requires a separate approved restart and
is blocked while a lifecycle mutation is active. Source checkouts instead run
fixed sequential `git status --porcelain`, `git pull --ff-only`, `npm ci`, and
build steps; a dirty checkout fails closed before pull.

CI verifies source behavior and the unpacked Windows package but never
publishes. Manual package workflow output is explicitly unsigned and
short-retention. Only the tagged release workflow can publish after external
signing credentials, version parity, Authenticode publisher checks, and
SHA-512 update metadata all pass. Release actions are full-SHA pinned, signing
secrets are step-scoped, prerelease tags cannot become stable latest, and an
expiring exact advisory fingerprint rejects dependency-audit drift.

## apps/web - the backend

One HTTP server (`server.js`, ~1300 lines, Node core modules only):

- **Static serving** of `dist/` → `public/`, with a traversal guard and SPA fallback.
- **`/api/state`** - the main poll: vault stats, agents (+ proc/term/uptime/avatar), review items, projects.
- **Gateway control** - `/api/proc/:id/(start|stop|restart|status|run|terminal|stop-term)` runs each
  agent's real gateway CLI; summoned terminals use a pid-file/kill-file handshake (see
  [Agent-System](Agent-System.md)).
- **`/api/graph`** - Neural Vault graph built from the vault markdown (see [Neural-Vault](Neural-Vault.md)).
- **`/api/agents/add`** - registers a new agent into `agents.config.json` (backup + cache invalidation).
- **Reports, tasks, schedule, vault-health** - see the endpoint dispatch block in `server.js`.
- **Auth** - header-only `x-dash-token`, constant-time compare, localhost bypass.

## apps/web - the frontend (React)

```
src/
├── main.jsx                 # entry: imports design-system + theme-engine CSS
├── App.jsx                  # view routing, agent selection, token gate
├── api.js                   # fetch client (never throws; 401 → token overlay)
├── lib/agents.js            # accents, gwState, nodeStatus, WORKFLOWS
├── lib/obsidian.js          # path-based obsidian:// URIs
├── hooks/
│   ├── useDashboard.js      # /api/state poll (6s) + ops poll + clock
│   ├── useTheme.js          # theme state + live --acc for SVG/canvas
│   └── useGateway.js        # start/stop/restart/status/run/summon + confirms
├── components/              # Sidebar, ThemePicker, TopologyMap, AgentCard,
│                            # AgentDetail, AddAgentModal, ReviewPanel, Panels,
│                            # NeuralGraphCanvas, Reports, TokenLogin
└── views/                   # CommandCenter, AgentsView, SimpleViews
```

The canvas graph engine stays **imperative** - `NeuralGraphCanvas` wraps
`@rempeyek/neural-engine`, which owns the canvas and its own RAF loop; React only
feeds it data, layer toggles, and the query. That's deliberate: a 60fps physics
simulation has no business re-rendering through React.

## Data flow

```
Agent CLIs ──(write)──> Obsidian Vault  ──(walkVault)──> /api/state · /api/graph
Agent CLIs ──(append)─> telemetry/*.jsonl ──(tailRead)──> detail panels, uptime
Dashboard  ──(spawn)──> gateway CLIs (start/stop/status) / summoned admin terminals
Dashboard  ──(write)──> Vault Tasks/, Reports/, Inbox/ (alerts), agents.config.json
```

## Design constraints

1. **The server stays dependency-free** - `node apps/web/server.js` must run with no
   `node_modules`. Build tooling is frontend-only.
2. **The filesystem is the source of truth** - no database, no cloud store. (A Supabase
   mirror was prototyped and removed; see [MCP](MCP.md).)
3. **The vault is sacred** - the dashboard only appends/edits inside `Tasks/`, `Reports/`,
   `Inbox/`, and `Brains/<lane>/`; it never restructures the vault.
4. **Styling flows from tokens** - components render design-system class names; no
   per-component CSS, no inline colors outside `--ac`/`--tile-c` locals.
