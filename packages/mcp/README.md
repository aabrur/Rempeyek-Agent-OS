# @rempeyek/mcp

**Extraction target — code lives in `apps/web` today.**

Connector adapters. Live today: the optional Supabase mirror (`sbMirrorAgents` in
`apps/web/server.js`, DDL in `supabase/aos_agents.sql`). Planned: GitHub sync, Figma
token import.

Canonical spec: [`docs/MCP.md`](../../docs/MCP.md).
Rule: every adapter is optional and degrades gracefully — the OS always runs offline.
