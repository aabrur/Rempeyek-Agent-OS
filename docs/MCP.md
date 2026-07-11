# MCP & Connectors

How REMPEYEK AGENT OS integrates with the Model Context Protocol and external
connectors — both as a *consumer* (the OS's own cloud hooks) and as a *host context*
(the agent fleet's tooling).

## OS-level integrations (live)

| Integration | Where | Notes |
|---|---|---|
| **Obsidian** | vault URIs | Path-based `obsidian://open?path=…` links from every note reference. |
| **Windows** | schtasks / toasts / Windows Terminal | Schedule panel, down alerts, summoned admin terminals. |

> **No cloud store.** A Supabase mirror was prototyped and removed: nothing read back
> from it, so it was one-way write traffic and an extra secret to guard for zero gain.
> The filesystem is the source of truth. Revisit only with a concrete need (remote
> read-only dashboard, multi-machine sync) — see [Roadmap](Roadmap.md).

## Fleet-level MCP policy

Agents in the mesh (Claude Code, OpenClaw, Hermes, …) carry their own MCP servers and
skills. House rules:

1. **Prefer a connector over scraping** when one exists (GitHub, Filesystem, Obsidian,
   Figma, Supabase, Adobe).
2. **Secrets stay in `.env` / agent keychains** — never in the vault, never in
   `agents.config.json`, never client-side (anything under `apps/web/src/` ships to
   the browser).
3. **Vault writes follow the vault contract** (see [Neural-Vault.md](Neural-Vault.md)) —
   MCP-driven automation writes to `Inbox/`, `Tasks/`, or its own `Brains/<lane>/`.
4. **Telemetry is the universal bridge** — any agent, MCP-capable or not, reports via
   `telemetry/<id>.jsonl` (see [Agent-System.md](Agent-System.md)).

## packages/mcp (extraction target)

Future home for connector adapters (GitHub sync, Figma token import) so
`apps/web/server.js` shrinks to routing + serving. Adapters must stay optional and
degrade gracefully when unconfigured — the OS must always run offline.
