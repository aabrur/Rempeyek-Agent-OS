# Telemetry Agentic OS — protokol lapor progres

Setiap agent bisa melaporkan progres kerjanya ke dashboard dengan **append** satu baris JSON
ke file `agentic-os\telemetry\<agent-id>.jsonl` (id: `claude-code`, `hermes`, `openclaw`, `zcode`, `copilot`).

Format per baris:

```json
{"ts":"2026-07-05T22:10:00+07:00","type":"task_start","name":"Analisis market BTC","detail":"scan 4 exchange","progress":0}
{"ts":"2026-07-05T22:14:00+07:00","type":"task_progress","name":"Analisis market BTC","detail":"2/4 exchange selesai","progress":50}
{"ts":"2026-07-05T22:20:00+07:00","type":"task_done","name":"Analisis market BTC","detail":"laporan di vault","progress":100}
{"ts":"...","type":"subagent_start","name":"researcher-1","detail":"riset kompetitor"}
{"ts":"...","type":"subagent_done","name":"researcher-1","detail":"selesai"}
```

- `type`: `task_start` | `task_progress` | `task_done` | `subagent_start` | `subagent_done` | `info`
- `progress`: opsional, 0–100.
- Dashboard membaca 30 event terakhir per agent (tab detail agent → TELEMETRY).
- Khusus **Claude Code**, dashboard juga membaca langsung transcript sesi di
  `.claude\projects\` (sesi aktif, tool terakhir, spawn subagent) tanpa perlu file ini.

Contoh append dari PowerShell:

```powershell
'{"ts":"' + (Get-Date -Format o) + '","type":"task_start","name":"Deploy X"}' |
  Add-Content "C:\Users\abrur\AI-Agent\agentic-os\telemetry\hermes.jsonl"
```
