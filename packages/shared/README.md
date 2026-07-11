# @rempeyek/shared

**Extraction target — code lives in `apps/web` today.**

Cross-cutting utilities: `.env` loader, `tailRead` (byte-capped file tails), JSONL
append/parse, `localISO`, `killTree`, `safeEq` (constant-time compare).

Current source: `apps/web/server.js` (util functions). First extraction candidate —
`scripts/hermes-daily-bridge.cjs` duplicates several of these today.
