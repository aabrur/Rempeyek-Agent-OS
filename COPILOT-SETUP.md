# Copilot CLI — status notes

Copilot CLI = **Node-12** (icon ⬜, home `C:\Users\abrur\.copilot`).
Per the ecosystem constitution: Copilot **has no `gateway` subcommand** (only
`login/mcp/plugin/skill/update/--acp`) — it is used **manually in its own CLI**,
not controlled by the dashboard. So on the dashboard Copilot has **no** gateway
Start/Stop/Status.

## What is in place

- **Copilot card** appears for observability + a **⧉ Summon** button → opens an
  admin Windows Terminal at `.copilot` and auto-runs `copilot`.
- **Placeholder avatar**: `public/avatars/copilot.svg` (`>_` mark). Replace it with
  a real photo via the ✎ button on the detail card (a PNG/JPG upload overrides it).
- **Honest status dot**: green only when a gateway is actually running.
  Copilot (no gateway) shows idle until telemetry arrives.

## What Copilot can fill in later

1. Report activity via telemetry → `telemetry\copilot.jsonl` (see `telemetry\README.md`,
   types `task_start/progress/done`, `subagent_start/done`) so the Sessions/Subagents/Telemetry
   panels fill up.
2. Create a `Brains/Copilot/` lane in the vault when orchestration is activated
   (currently manual CLI only).
3. Replace the placeholder avatar with a real one.

Do not add fake gateway actions (start/stop/status) — Copilot genuinely has none.
