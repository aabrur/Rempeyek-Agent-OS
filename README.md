# AGENTIC//OS — Neural Command Deck

One dashboard for all your AI agents: what they can do, what is running right now,
and their latest results — all from a single screen. Live data is read from an
Obsidian Vault (the shared memory layer), with per-agent daily logs under
`Brains/<Lane>/`.

**Zero dependencies.** Pure Node.js (no npm packages), vanilla JS frontend, no build step.

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![Node](https://img.shields.io/badge/node-%E2%89%A518-green) ![Deps](https://img.shields.io/badge/dependencies-0-brightgreen)

## Features

- **Agent topology map** — live radial map of every agent and its gateway status
- **Gateway control** — start / stop / restart / status / run agents from the dashboard
- **Health monitoring** — TCP probes, 24h uptime history, watchdog auto-restart (opt-in), desktop alerts when an agent goes down
- **Task board** — send tasks to agents (written to the vault), mark them done
- **Telemetry** — per-agent JSONL event streams: sessions, subagents, progress
- **Neural Vault graph** — interactive force-directed graph of your vault's `[[wikilinks]]`
- **Reports** — auto-generated vault + agent activity reports, saved back to the vault
- **Scheduled-task panel** — see what Windows Task Scheduler will run and when
- **Vault health** — last git commit age + last backup age, so you never lose the brain

## Requirements

- **Windows** (gateway control uses PowerShell, `schtasks`, and Windows Terminal)
- **Node.js 18+**
- An **Obsidian Vault** (or any folder of markdown notes) as the memory layer
- Your agents' own CLIs installed (Claude Code, or whatever you run)

## Quick start

```powershell
git clone <this-repo> agentic-os
cd agentic-os

# 1. Configure environment
copy .env.example .env          # then edit: VAULT_PATH, DASH_TOKEN, ...

# 2. Configure your agents
copy agents.config.example.json agents.config.json   # then edit paths/commands

# 3. Run
npm run dev                     # http://localhost:4321
```

Port already taken? `set PORT=4322` then `npm run dev` again.

## Configuration

### `.env`

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Dashboard port | `4321` |
| `VAULT_PATH` | Absolute path to your Obsidian Vault | `<repo>\Obsidian Vault` |
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

## Neural Vault

The **Neural Vault** tab renders a live force-directed graph of the `[[wikilinks]]`
in your vault — pan, zoom, drag, search. Click a node to open it in Obsidian.

## Security notes

- Auth is **header-only** (`x-dash-token`); query-string tokens are not accepted.
- Localhost requests are always allowed; set `DASH_TOKEN` before exposing the port.
- The server never echoes internal error details to clients.

## License

Private — not yet published. (Publishing checklist: set a license, strip personal
config, done — the code itself contains no hardcoded personal paths.)
