# @rempeyek/agent-runtime

**Extraction target — code lives in `apps/web` today.**

Gateway controller: `gwCtl`/`gwRun`/`gwStop`, summoned admin terminals (pid-file/
kill-file handshake), TCP probes, watchdog (3×/hour cap), uptime log, down alerts,
telemetry readers, `addAgent`/`saveConfig`.

Canonical spec: [`docs/Agent-System.md`](../../docs/Agent-System.md).
Current source: `apps/web/server.js` (gateway controller + telemetry sections).
