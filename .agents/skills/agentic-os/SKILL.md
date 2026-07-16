---
name: agentic-os
description: "Use whenever working with Agentic OS as the Windows dashboard for Hermes, OpenClaw, Codex, or other local agents. Covers dashboard lifecycle, gateway wrapper behavior on Windows, auth/localhost quirks, and frontend-to-backend control verification. Trigger on agentic-os dashboard issues, Hermes/OpenClaw/Codex gateway control from UI, Start/Stop/Restart/Status/Run buttons not working, port-in-use dashboard relaunch, 401 from localhost, gateway command parsing, or daily bridge/telemetry lane visibility."
---

# Agentic OS — Local Windows Dashboard + Gateway Control

Class-level operational skill for the `C:\Users\abrur\Rempeyek-Agent-Os` dashboard stack:
- `server.js` HTTP API + `public/` frontend
- `agents.config.json` agent registry with gateway control definitions
- Windows service control via scheduled tasks and Hermes/OpenClaw CLIs

This skill exists because this environment repeatedly hits the same failure class: **UI shows gateway actions, but clicking Start/Stop/Restart/Status/Run does not control the real service, or returns 401**, plus **profiles not showing Sesi/Aktivitas, Subagent, Telemetry, or Brains lane details**.

## Hard Rules

1. **Never trust UI-only verification for gateway control.** Always probe `/api/state`, `/api/procs`, `/api/agent/<id>/detail`, and the actual gateway command flow before declaring fixed.
2. **Do not mutate another agent’s config/runtime path.** Edits are limited to `agentic-os` and its `agents.config.json` unless explicit permission is granted.
3. **Before changing ports or killing processes, confirm ownership.** PID may be owned by the running Edge browser or another long-lived tool.
4. **Prefer config/backend fixes over frontend changes** when the root cause is Windows shell parsing or token auth.

## Failure Modes & Fixes

### Local browser gets 401 from dashboard APIs
**Cause:** `.env` has `DASH_TOKEN` set, and `server.js` token logic rejects `x-dash-token` even from `127.0.0.1` because lengths or casing differ, or because remote-address bypass is missing.  
**Fix:** Add loopback bypass first. In `server.js`:

```js
const remote = req.socket && (req.socket.remoteAddress || (req.connection && req.connection.remoteAddress) || "");
if (/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)) return true;
```

Keep timing-safe comparison for non-local callers; never remove token auth entirely.

### Quoted Windows paths in `gateway.bin`/`runCmd` fail when action is appended
**Cause:** `agents.config.json` already includes a quoted executable path with extension, and `server.js` appends ` ${action}` or uses `runCmd` directly, resulting in malformed shell commands or path quoting conflicts.  
**Fix:** For Hermes, use direct binary paths in config without extra quoting in config:
- `gateway.bin`: `C:\Users\abrur\AppData\Local\hermes\hermes-agent\venv\Scripts\hermes.exe`
- `gateway.runCmd`: same binary for foreground runs
Avoid referring to wrapper scripts from config when `cwd` is not the wrapper’s folder; if wrappers are used, keep them tiny, no subcommand parsing, and call them from `cwd` only.

### Port-in-use on dashboard restart
**Cause:** Old dashboard process still bound to the same port after a code reload or previous session.  
**Fix sequence:**
1. `netstat -ano | grep ":<port>"` to enumerate owners.
2. Only terminate the Node PID if it is the dashboard; do not kill the browser or Hermes service PID.
3. If port remains in TIME_WAIT, choose one: wait or rerun on an alternate port with `PORT=<n> node server.js`.
4. Re-run localhost `/api/state` and `/api/procs` first; only then verify through the browser UI.

### Hermes gateway wrapper .cmd parsing fails on subcommands
**Cause:** One wrapper file both handles empty/default args and appends actions, so `run` gets consumed or rebranched unexpectedly.  
**Fix:** Keep wrappers minimal:
- one wrapper for `start/stop/restart/status` 
- a separate wrapper for `run` owned foreground if needed
Never mix both paths in one dispatcher unless it’s explicitly a router built for subcommands.

## Verification Before Declaring Done

Run these in order after any `agents.config.json` or `server.js` change:
1. `curl http://127.0.0.1:<port>/api/state` → must return JSON, no 401.
2. `curl http://127.0.0.1:<port>/api/procs` → must return agent array.
3. `curl http://127.0.0.1:<port>/api/agent/<id>/detail` → must return `proc`, `activity`, `telemetry`, `laneFiles`.
4. From browser: open dashboard, open the agent detail panel, confirm Sesi/Aktivitas, Subagent, Telemetry, and Lane vault — `Brains/` sections populate without empty-state text when real data exists.
5. Click one gateway action inside agent detail; repeat `1-3` and inspect changed status or new owned log lines.

## Daily Bridge / Telemetry

`C:\Users\abrur\Rempeyek-Agent-Os\scripts\hermes-daily-bridge.cjs` is the Hermes lane sync bridge. It writes `telemetry/hermes.jsonl` and updates `Brains/Hermes/Daily/YYYY-MM-DD.md`. Dashboard reads telemetry via `readTelemetry(id)` and shapes it through `telemetryActivity(events)`. If the dashboard shows empty telemetry for Hermes while the file exists, confirm:
- the event `type` values are exactly `task_start`, `task_progress`, `task_done`, `subagent_start`, `subagent_done`
- `name`/`detail` are populated strings, not `null`
- the dashboard backend is reading from the same `telemetry/` directory as the bridge writer

## Skills to Pair

- `hypertaks` for structured execution and compliance footer
- `shared-memory` for vault logging decisions
- `openclaw-local-config` for OpenClaw-specific gateway lifecycle issues
