# @rempeyek/mcp

**Extraction target — code lives in `apps/web` today.**

Connector adapters. None live today (a Supabase mirror was prototyped and removed —
nothing read back from it). Planned: GitHub sync, Figma token import.

Canonical spec: [`docs/MCP.md`](../../docs/MCP.md).
Rule: every adapter is optional and degrades gracefully — the OS always runs offline.
