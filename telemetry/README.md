# Agentic OS Telemetry — progress reporting protocol

Any agent can report its work progress to the dashboard by **appending** one JSON line
to `agentic-os\telemetry\<agent-id>.jsonl` (ids: `claude-code`, `hermes`, `openclaw`,
`zcode`, `kimi-code`, `copilot`, `antigravity`).

Format, one event per line:

```json
{"ts":"2026-07-05T22:10:00+07:00","type":"task_start","name":"BTC market analysis","detail":"scanning 4 exchanges","progress":0}
{"ts":"2026-07-05T22:14:00+07:00","type":"task_progress","name":"BTC market analysis","detail":"2/4 exchanges done","progress":50}
{"ts":"2026-07-05T22:20:00+07:00","type":"task_done","name":"BTC market analysis","detail":"report in the vault","progress":100}
{"ts":"...","type":"subagent_start","name":"researcher-1","detail":"competitor research"}
{"ts":"...","type":"subagent_done","name":"researcher-1","detail":"finished"}
```

- `type`: `task_start` | `task_progress` | `task_done` | `subagent_start` | `subagent_done` | `info`
- `progress`: optional, 0–100.
- The dashboard reads the last 30 events per agent (agent detail → TELEMETRY).
- **Claude Code** is special: the dashboard also reads its session transcripts directly
  from `.claude\projects\` (active sessions, last tool, subagent spawns) without this file.

## The easy way — the `report` helper (recommended)

Instead of writing JSONL by hand, use the one-liner wrapper in the repo root:

```
report <id> "<task name>" [progress 0-100] [detail...]
```

- `progress` **0** → `task_start`, **100** → `task_done`, anything else/empty → `task_progress`

Examples:

```
report hermes "Scan BTC market" 0   "starting on 4 exchanges"
report hermes "Scan BTC market" 50  "2/4 exchanges done"
report hermes "Scan BTC market" 100 "report in the vault"
```

From anywhere: `report.cmd` (repo root) or `node scripts/report.cjs ...`.

## Manual append from PowerShell (if needed)

```powershell
'{"ts":"' + (Get-Date -Format o) + '","type":"task_start","name":"Deploy X"}' |
  Add-Content "<repo>\telemetry\hermes.jsonl"
```
