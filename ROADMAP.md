# Agentic OS — Development Roadmap

> Principle: **features must pay rent** — they must be used for decisions/operations.
> Anything that is only looked at = decoration, cut it. YAGNI: don't build for problems
> that don't exist yet.

## 🔴 Tier 1 — closing real gaps — ✅ DONE 2026-07-08

1. ✅ **Alert when an agent dies** — on `running → down` transition or non-zero `run` exit:
   one line written to the vault's `Inbox/` (shows in Needs Review) + Windows desktop notification.
2. ✅ **Uptime history + daily-bridge wiring** — every poll recorded to `telemetry/uptime.jsonl`
   → 24h uptime chip per agent. `scripts/hermes-daily-bridge.cjs` now runs hourly from the server.
3. ✅ **Frictionless telemetry** — one-liner helper (`report.cmd "task" 50`) so agents actually
   fill the Sessions/Subagents/Telemetry panels.

## 🟡 Tier 2 — solid, not urgent — ✅ DONE 2026-07-08

4. ✅ **Gateway logs persisted to disk** — `pushLog` appends JSONL to `telemetry/logs/<id>.log`
   (naive 1 MB rotation); the agent detail view falls back to disk after a restart.
5. ✅ **Send tasks to agents from the dashboard** — form in Needs Review → `POST /api/task` →
   checkbox in `Tasks/Inbox Tasks.md` → appears in Needs Review. Dashboard: passive → can direct.

## 🟢 Tier 3 — useful follow-ons — ✅ DONE 2026-07-08

6. ✅ **Watchdog auto-restart for 24/7 agents** — opt-in per agent (`gateway.watchdog: true`,
   default **false**), hard limit 3 restarts/hour, alert sent on every attempt.
7. ✅ **Real health probe** — `probePort()` TCP-connect to `gateway.probe {host,port}`
   (not text matching). Deviation from the original idea: TCP connect instead of `GET /health` —
   more robust, still proves the process is listening.
8. ✅ **Schedule panel** — `/api/schedule` reads `schtasks /query` per agent (`gateway.schtask`)
   → next run, last run, last result.
9. ✅ **Vault health panel** — last vault git commit age (red when >48h) + last backup age
   via `BACKUP_PATH` (optional).
10. ✅ **Confirmation guard for destructive actions** — one `confirm()` before stop/restart/run
    on `owner: native-service` agents.
11. ✅ **Crash-proof config** — if `agents.config.json` fails to parse, the server keeps the
    last-good config and the dashboard shows a clear error banner (auto-reload by mtime).

## ✅ Bonus (two-way, beyond the original roadmap)
- **Mark tasks done from the dashboard** — "✓ done" button in Needs Review →
  `POST /api/task/done` flips `- [ ]` to `- [x]` in the vault. Guard: only paths inside `Tasks/`.

## 🔵 Overhaul — ✅ DONE 2026-07-10 (Claude Code)
- Repo cleanup: vendored graphify repo + 21 MB generated output removed; debug harness,
  promo files, vestigial wrappers deleted; vault untracked from git.
- Security: auth debug leak removed, single constant-time compare, header-only token auth.
- Full English conversion: UI, server, docs, generated reports, vault alerts.
- Portability: all paths env-driven; `.env.example` + `agents.config.example.json` + English README.
- Neural Vault graph now renders in-page (`public/graph.js` on `/api/graph`) — no external
  Python tool, no iframe.
- **Agent topology map**: live radial SVG map of all agents on the Command Center.
- Premium visual pass: typography scale, spacing, micro-interactions, skeleton loaders,
  reduced-motion support.

## 💡 Future ideas (not built — waiting for a real need)
- **Automatic vault backup** — daily schtask `git -C vault commit` + copy to `BACKUP_PATH`.
  Panel #9 already displays the age; something just needs to write it.
- **Phone push notifications** on alerts (ntfy.sh/Telegram) if you're often away from the desk.
- **Investigate OpenClaw schtask exit 1** — schtask "last result 1" while the probe says OPEN.
- **Filter/search in Needs Review** once tasks pile up past ~20 (not needed yet — YAGNI).

## ⚫ Rejected (decoration — do not build)
- Extra themes/animations/3D graphs/avatar effects — zero operational value.
- Multi-user/cloud/complex login — single-user local tool; over-engineering.
- Charts that don't drive an action. Test: "if the number is X vs Y, do I act differently?"
  No answer → cut it.

---

*Created 2026-07-07 · Tiers 1–3 done 2026-07-08 · Overhaul done 2026-07-10. Update this file when priorities change.*
