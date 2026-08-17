# Shared Memory Index

Central index of shared memories and architectural handoffs across all agents.

## Latest Handoff & Architecture Baseline

### 2026-08-17 | Antigravity | Rempeyek Agent OS v2.4.2 — Work Continuity, Multi-Platform Publishing & Dynamic CWD

- **Work Continuity Foundation**: Implemented full deterministic lifecycle (`Mission`, `WorkContract`, `Run`, `WorkUnit`, `Evidence`, `Verification`, `Handoff`) in `apps/web/lib/work-lifecycle.mjs` ensuring work survives agent crashes, replacements, and cold restarts.
- **Multi-Platform Publishing Expansion**: Implemented `Campaign`, `PlatformVariant`, `PublicationJob`, `PublicationReceipt`, `AnalyticsSnapshot`, and `ConnectorProfile` in `apps/web/lib/publishing-domain.mjs` with gateway adapters for Twitter/X, LinkedIn, YouTube, TikTok, and Meta.
- **Retry Isolation & Idempotency**: Scheduler (`publishing-scheduler.mjs`) reconciles partial successes so failed platforms are retried without ever duplicating posts on live platforms.
- **Dynamic Summon & Gateway CWD**: Updated `summon-profile.cjs` so that when any agent is summoned or when a gateway runs, the working directory (CWD) strictly opens inside the Rempeyek Agent OS installation directory on the user's PC (`stateRoot` / `%LOCALAPPDATA%\Rempeyek-Agent-OS` or active workspace root).
- **User Consent & Zero Auto-Registration**: Public `agents.config.json` starts with 0 agents (`agents: []`). All AI agents are added manually and explicitly by the user via `＋ ADD AGENT` or the Marketplace.
- **Verification & Durability**: 412/412 Web tests passed, 39/39 Desktop tests passed, public release audit passed, AST Knowledge Graph synchronized (3,310 nodes, 5,107 edges).
