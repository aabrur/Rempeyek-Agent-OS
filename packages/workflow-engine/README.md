# @rempeyek/workflow-engine

**Extraction target — code lives in `apps/web` + `scripts/` today.**

Task routing (dashboard → vault `Tasks/`), mark-done write-back, schtasks schedule
panel, report generator, daily bridges (`scripts/hermes-daily-bridge.cjs`).

Current source: `apps/web/server.js` (`createTask`, `markTaskDone`, `buildSchedule`,
`buildReport`, `runDailyBridge`) + `scripts/`.
