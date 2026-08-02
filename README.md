# REMPEYEK AGENT OS — Agentic Operating System

One dashboard for all your AI agents: what they can do, what is running right now,
and their latest results — all from a single screen. Live data is read from an
Obsidian Vault (the shared memory layer), with per-agent daily logs under
`Brains/<Lane>/`.

**Zero-dependency server.** The API is pure Node.js (no npm packages). The frontend is
React + Vite, split into components across an npm-workspaces monorepo.

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![Node](https://img.shields.io/badge/node-%E2%89%A518-green) ![Server deps](https://img.shields.io/badge/server%20deps-0-brightgreen) ![UI](https://img.shields.io/badge/ui-React%20%2B%20Vite-61DAFB)

## Download for Windows

[![View releases](https://img.shields.io/badge/Download-view_releases-ff8a00?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/aabrur/Rempeyek-Agent-OS/releases)

**The installer and direct download are free.** Most users only need to click
the button above. No GitHub account, Git, Node.js, npm, or repository clone is
required.

- **Windows x64** desktop installer
- **Private local state** — settings, agents, telemetry, avatars, and the starter
  vault stay under `%LOCALAPPDATA%\Rempeyek-Agent-OS`
- **User data survives uninstall** — removing the application does not delete
  the user's agent or vault data

### Install

1. Open a release explicitly marked **verified/stable** in the releases list above.
2. Download the NSIS installer and the published `SHA256SUMS.txt` from that same release.
3. Verify the downloaded installer against `SHA256SUMS.txt` in PowerShell:

   ```powershell
   Get-FileHash "$HOME\Downloads\Rempeyek-Agent-OS-Setup-<version>.exe" -Algorithm SHA256
   ```

4. Open the installer only when the hash and release publisher match.
5. Launch **Rempeyek Agent OS** from the Start menu or desktop shortcut.

### Windows download warning

Official releases include published `SHA256SUMS.txt` checksum files for release verification. Unsigned public releases are supported with explicit checksum verification against `SHA256SUMS.txt`. If a release is missing `latest.yml` or `SHA256SUMS.txt`, do not install it as a stable update.

### Updates

The desktop updater supports automated background checks, release manifest verification via `latest.yml`, and clean click-to-update installation. Unsigned GitHub release builds are permitted when code-signing certificates are not configured. User settings, installed-agent records, telemetry, avatars, and Vault data remain in place across application upgrades.

## Features

- **Agent Map (the front door)** — a living neural cosmos: every agent orbits the
  Neural Vault core with glowing, provenance-verified relationship lines, travelling
  particles, live status, and a right-hand inspector (connections, measured signals,
  metadata). Fully keyboard-navigable, honest by design — no synthetic edges
- **8-destination command deck** — Agent Map · Agents · Projects (project workspaces) ·
  Memory (vault graph) · Switchboard (approvals, workflows, schedule) · Marketplace
  (vetted agent catalog) · Observatory (telemetry + reports) · Settings
- **Project memory capture** — agents' `task_done` telemetry is auto-captured into the
  matching project's `decisions.md` (⚡auto entries, watermarked — never duplicated), and
  a **resume brief** can be dispatched to any agent via the task board
- **4 structural themes** — Minimalist · Brutalist · Glassmorph · Cyberpunk (the neon
  cosmos default), switched from Settings and persisted per browser; the flat themes
  turn off glow and particles entirely, and the system reduce-motion preference is
  always respected
- **Public Marketplace** — browse separate **Agents**, **Plugins**, and
  **Skills** filters. The current launch curation contains 21 agent
  projects for portable discovery; it is maintained product curation, not a
  ranking or performance claim
- **Safe install boundary** — reviewed adapters execute fixed programs and
  argument arrays without a shell. Hypertaks is the featured plugin and its
  managed bundle targets `%USERPROFILE%\.agents`; Crimson Odyssey remains
  discoverable through its official project link but has no guessed one-click
  installer
- **Agent lifecycle** — installed software and registered profiles are shown
  separately. Enable/disable, active-agent switching, editable profile fields,
  non-destructive Remove, and Restore are available in Settings. Advanced
  software uninstall is separate and requires two scoped approvals
- **Primary-profile subagents** — open a primary agent and use `+` to create a
  purpose-specific child with explicit scope, permissions, memory, and
  activation. Registry topology and the missing vault scaffold are persisted
  without fabricating activity telemetry
- **Windows desktop shell** — the existing command deck runs unchanged inside
  a hardened Electron window with a supervised loopback server, single-instance
  behavior, tray controls, launch-at-login, and approval-gated verified updates
- **Summon with install-gate** — one click opens an admin terminal at the
  profile's trusted home folder and runs its persisted CLI trigger; a missing
  CLI is reported honestly and routes back to the reviewed Marketplace or
  official project page
- **Gateway control** — start / stop / restart / status / run agents from the dashboard
- **Health monitoring** — TCP probes, 24h uptime history, watchdog auto-restart (opt-in), desktop alerts when an agent goes down
- **Task board** — send tasks to agents (written to the vault), mark them done
- **Telemetry** — per-agent JSONL event streams: sessions, subagents, progress
- **Neural Vault graph** — interactive force-directed graph of your vault's `[[wikilinks]]`
- **Reports** — auto-generated vault + agent activity reports, saved back to the vault
- **Scheduled-task panel** — see what Windows Task Scheduler will run and when
- **Vault health** — last git commit age + last backup age, so you never lose the brain

## Requirements

### Desktop users

- **Windows x64**
- Internet access for Marketplace links and automatic update checks
- Agent CLIs are optional and only required for the external agents you choose
  to run
- An existing Obsidian Vault is optional; a private starter vault is created
  automatically

### Source contributors

- **Windows** (gateway control uses PowerShell, `schtasks`, and Windows Terminal)
- **Node.js 18+**
- Git and npm

## Run from source

This section is for contributors. Desktop users should use the
[installer](#download-for-windows) instead.

```powershell
git clone <this-repo> rempeyek-agent-os
cd rempeyek-agent-os

# 1. Optional: point the dashboard at your own Obsidian vault
copy .env.example .env          # then edit VAULT_PATH; keep secrets local

# 2. Install + run. The first launch creates an empty private registry.
npm install                     # React/Vite + workspace links
npm run dev                     # builds the UI, then serves http://localhost:4321
```

After `npm install`, double-click **`start.cmd`** (or run
`node bin/rempeyek-agent-os.mjs`) — it builds the UI if needed, starts the server,
and opens your browser.

### Build the Windows desktop package

The desktop workspace can produce unsigned Windows x64 NSIS and portable test
artifacts:

```powershell
npm run desktop:dist
```

Outputs are written to `apps\desktop\dist\`. They are local release-candidate
artifacts, not a signed or published stable release. See
[`apps/desktop/README.md`](apps/desktop/README.md) for runtime, update, state,
signing, and acceptance boundaries.

Open **Marketplace → Install** (or **Agents → ＋ Add Agent**) to register only the
agents you want. A clean installation never copies the maintainer's roster, vault,
telemetry, or avatars.

Registration is not installation: a profile may exist without its external CLI,
and installed software may remain after a profile is removed. Removing a profile
retains vault notes, telemetry, activity, workflows, logs, credentials, installed
software, and user files. Restore re-registers the retained profile. Removing a
primary profile never cascades into child data; Settings requires an explicit
detach choice when children exist.

Port already taken? `set PORT=4322` then `npm run dev` again.

### Working on the UI

```powershell
npm run server   # API on :4321
npm run ui       # Vite dev server on :5173 with hot reload (proxies /api → :4321)
```

`npm run build` emits `apps/web/dist/`, which the server serves in production.

## Repository structure

```
apps/web/        server.js (zero-dep API) + src/ (React app) + dist/ (built UI)
apps/desktop/    Electron shell + Windows x64 NSIS/portable packaging
packages/        ui · design-system · theme-engine · neural-engine (live)
                 neural-vault · agent-runtime · workflow-engine · mcp · shared (planned)
docs/            GETTING-STARTED · INSTALLATION · FIRST-RUN · PRIVACY · BACKUP-RESTORE
                 MIGRATIONS · UNINSTALL · TROUBLESHOOTING · DEVELOPMENT · Design-Bible
                 Architecture · Neural-Vault · Agent-System · MCP · Theme-System · Roadmap
prompts/         system + role prompts for the agent fleet
scripts/         bridges (telemetry ↔ vault)
telemetry/       per-agent JSONL event streams (runtime data)
```

New installations keep configuration, telemetry, avatars, and the optional starter
vault under `%LOCALAPPDATA%\Rempeyek-Agent-OS`. Desktop-native settings and update
state live there too. Existing ignored repository-local configurations remain
compatible. Uninstalling the application does not delete this user-owned state.
See [SECURITY.md](SECURITY.md).

## Configuration

### `.env`

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Dashboard port | `4321` |
| `AGENT_STATE_DIR` | Private config/telemetry/avatar state root | `%LOCALAPPDATA%\Rempeyek-Agent-OS` |
| `AGENTS_CONFIG` | Optional custom agent registry path | `<state>\agents.config.json` |
| `VAULT_PATH` | Absolute path to your own Obsidian Vault | `<state>\Vault` |
| `DASH_TOKEN` | Auth token for remote access (localhost is always allowed) | none |
| `CLAUDE_PROJECTS` | Claude Code transcripts folder | `%USERPROFILE%\.claude\projects` |
| `BACKUP_PATH` | Vault backup location (enables the backup-age row in Vault Health) | none |

### `agents.config.json`

Configured per agent (`agency`, `workdir`, then an `agents` array). Each agent
has a `gateway` block:

| Field | Purpose |
|-------|---------|
| `bin` | gateway command (headless start/stop/restart/status) |
| `cwd` | working directory for the gateway command |
| `home` | default folder for **Open terminal · summon agent** |
| `trigger` | command auto-run in the terminal when summoning the agent |
| `runCmd` | override command for `run` (foreground / terminal) |
| `schtask` | Windows Scheduled Task name (enables the Schedule panel + service control) |
| `probe` | `{host, port}` TCP health probe (real liveness, not text matching) |
| `watchdog` | `true` = auto-restart on down (max 3×/hour), default `false` |
| `actions` | subset of `start,stop,restart,status,run` (empty = observability-only) |
| `envAllow` | provider environment variables this gateway may receive |

Agents without a gateway CLI (`actions: []`) still appear on the dashboard —
status comes from telemetry and their vault lane instead.

### The Start button (split dropdown)

- **▶ Start** (main click) → starts the gateway (background service)
- **▾ → Open terminal · summon agent** → admin Windows Terminal at `home`, auto-runs `trigger`
- **▾ → Gateway run · terminal** → admin terminal at `cwd`, runs `runCmd` (foreground)

Terminals you open are **not** owned by the dashboard, so **Stop / Stop All**
stops headless/owned gateways but never closes your own CLI/TUI windows.

## Agent detail

Click any agent card: **Sessions/Activity**, **Subagents/Tasks**, **Telemetry**,
and **Vault lane — Brains/**. Claude Code activity is parsed from its transcripts;
other agents report via `telemetry\<id>.jsonl` (one-liner helper: `report.cmd "task name" 50`
— see `telemetry\README.md`).

For a primary profile, the `+` control opens the subagent form. Required fields are
name, field/domain, concrete outcome, and workspace scope. Configured children are
listed separately from observed telemetry, and only primary profiles can create
children.

## Memory — the Neural Vault graph

The **Memory** tab renders a live force-directed graph of the `[[wikilinks]]`
in your vault — pan, zoom, drag, search. Click a node to open it in Obsidian.

## Security notes

- Auth is **header-only** (`x-dash-token`); query-string tokens are not accepted.
- Localhost requests are always allowed; set `DASH_TOKEN` before exposing the port.
- The server never echoes internal error details to clients.
- Gateway processes receive an allowlisted environment, never the dashboard's complete `.env`.
- Public-release boundaries and reporting instructions are documented in [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE). Personal config (`agents.config.json`, `.env`) stays
local and git-ignored; start from the `.example` files.
