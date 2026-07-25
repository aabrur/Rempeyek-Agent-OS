# Agent System

Every registered profile is a row in the private `agents.config.json` registry
(start from `agents.config.example.json`). New installations place it below the
operating system's local application-data directory unless `AGENTS_CONFIG` is
set. The dashboard renders profiles in topology, cards, reports, and Settings;
external CLI installation is tracked independently.

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
    "marketplaceId": "nova",  // optional reviewed Marketplace identity
    "envAllow": ["NOVA_API_KEY"],
    "actions": ["start","stop","restart","status","run"]        // [] = observe-only
  }
}
```

## Ways to add an agent

1. **Dashboard** — Marketplace or Agents view → **＋ ADD AGENT**. The reviewed
   catalog can install supported software and optionally register its profile;
   custom registration validates the slug, auto-numbers the node, and writes an
   atomic registry backup. Optional trigger + home makes a trusted custom
   profile summonable immediately.
2. **By hand** — edit `agents.config.json`; the server hot-reloads by mtime and shows a
   banner (not a crash) if the JSON is broken mid-edit.

## Lifecycle & status

- **Two independent axes** — `installed` describes external software;
  `registered/enabled/active` describes the local profile. Registering does not
  claim software is installed, and removing a profile does not uninstall it.
- **Settings lifecycle** — edit name/role/note, enable or disable a profile,
  switch the single active profile, Remove, and Restore. Remove stores a
  restorable tombstone while retaining vault, telemetry, activity, workflows,
  logs, credentials, software, and user files.
- **Parent safety** — primary removal is blocked while attached children exist.
  An explicit detach operation preserves each child and records its former
  parent; removal never cascades into child data.
- **Advanced uninstall** — uninstall is distinct from profile removal, available
  only for reviewed uninstall adapters, and requires two exact scoped approvals.
- **Status resolution order:** dashboard-owned run process → live summoned terminal →
  gateway status/probe cache → recent telemetry (15 min) → `off`.
- **Summon** opens an admin Windows Terminal at `home` running the persisted
  trusted `trigger`. Marketplace installation uses server-owned reviewed
  adapters; request bodies never supply executable shell text. Stop uses a
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

## Configured subagents

A primary profile can create a child through its `+` form. Required inputs are
name, field/domain, concrete outcome, and workspace scope. Optional controls cover
permission profile, relative allowed paths, memory policy, activation, provider,
tools, skills, cadence/event trigger, checkpoint rule, and instructions.

The server persists `kind: "subagent"` plus `parentId`, assigns the next node,
and creates only missing files under
`Brains/<Parent>/Subagents/<Child>/`. Absolute or parent-escaping allowed paths
are rejected. Configured children appear separately from transcript/telemetry
activity, and Agent Map draws the parent edge only from the persisted registry
record with `subagent` provenance. A subagent cannot create another subagent.

## Public Marketplace

The launch catalog is dated 2026-07-24 and contains 20 curated agent projects.
The number is a maintained discovery set, not a ranking. Marketplace exposes
Agents, Plugins, and Skills filters while redacting executable adapter details.
Hypertaks is featured and installs from a hash-verified managed bundle into
`%USERPROFILE%\.agents`. Crimson Odyssey is listed with its official project
link and remains link-only until its canonical install boundary is documented;
the server does not guess a command.

## Storage

The private registry and its `.bak`, tombstones, receipts, telemetry, logs,
avatars, and vault remain outside tracked source for a clean installation.
`agents.config.json` is the authoritative profile store; there is no database or
cloud mirror. See [MCP.md](MCP.md) for why the Supabase experiment was removed.
