# Agent System

Every agent is a row in `agents.config.json` (repo root, gitignored — start from
`agents.config.example.json`). The dashboard renders them everywhere (topology,
cards, sidebar, reports) and controls the ones that expose a gateway CLI.

## Agent schema

```jsonc
{
  "id": "nova",               // unique slug — telemetry filename, routes, accent key
  "name": "Nova",
  "icon": "🤖",               // emoji in nodes/cards
  "role": "Research agent",
  "node": "Node-17",          // topology label (auto-numbered on dashboard add)
  "lane": "Nova",             // vault Brains/<lane>/ folder → vault status detection
  "enabled": true,
  "accent": "#55FFB8",        // optional — colors this agent across the whole UI
  "owner": "native-service",  // optional — destructive actions require a confirm
  "note": "shown in detail + disabled tooltip",
  "gateway": {
    "bin": "nova-gateway",    // headless start/stop/restart/status command
    "cwd": "…", "home": "…",  // home + trigger enable the Summon button
    "trigger": "nova",        // CLI auto-run in the summoned admin terminal
    "runCmd": "…",            // foreground owned run (live log)
    "schtask": "Nova Gateway",// Windows Scheduled Task → Schedule panel
    "probe": { "host": "127.0.0.1", "port": 1234 },  // TCP liveness (wins over text)
    "watchdog": false,        // auto-restart on down, max 3×/hour
    "install": { "cmd": "npm i -g nova", "url": "https://…" },  // summon install-gate
    "actions": ["start","stop","restart","status","run"]        // [] = observe-only
  }
}
```

## Ways to add an agent

1. **Dashboard** — Agents view → **＋ ADD AGENT**. Validates the slug, auto-numbers the
   node, writes the config with a `.bak` backup (`POST /api/agents/add`). Optional
   trigger + home makes it summonable immediately.
2. **By hand** — edit `agents.config.json`; the server hot-reloads by mtime and shows a
   banner (not a crash) if the JSON is broken mid-edit.

## Lifecycle & status

- **Status resolution order:** dashboard-owned run process → live summoned terminal →
  gateway status/probe cache → recent telemetry (15 min) → `off`.
- **Summon** opens an admin Windows Terminal at `home` running `trigger`; an install-gate
  (`where.exe`) offers `install.cmd`/`install.url` when the CLI is missing. Stop uses a
  pid-file/kill-file handshake so no second UAC prompt is needed.
- **Down detection** — running→down transitions write an alert note to the vault `Inbox/`
  (appears in Needs Review) + a Windows toast; optional watchdog restarts (max 3×/hour).
- **Uptime** — every status poll appends to `telemetry/uptime.jsonl` → 24h uptime chips.

## Telemetry contract

Agents report via `telemetry/<id>.jsonl`, one JSON object per line:

```json
{"ts":"2026-07-11T12:00:00Z","type":"task_start|task_progress|task_done","name":"…","detail":"…","progress":50}
{"ts":"…","type":"subagent_start|subagent_done","name":"…","detail":"…"}
```

Claude Code is special-cased: sessions/subagents are parsed from its transcript JSONL
(`CLAUDE_PROJECTS`) instead.

## Cloud mirror (optional)

With `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in `.env`, the registry is upserted to the
`aos_agents` table on startup and after every add (gateway block stripped — local paths
never leave the machine). See [MCP.md](MCP.md).
