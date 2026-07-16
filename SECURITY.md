# Security and Privacy

REMPEYEK Agent OS is local-first. A clean installation starts with no registered
agents and no copied vault. Register agents through **Agents → + Add Agent** and
set `VAULT_PATH` only to a vault owned by the current user.

## Data that must remain local

- `.env` and provider API keys
- `agents.config.json` and its backups
- Obsidian vault content
- telemetry, logs, terminal handshakes, and uploaded avatars
- generated screenshots that display a real roster or vault metadata

New installations store runtime state under `%LOCALAPPDATA%\Rempeyek-Agent-OS`
on Windows. `AGENT_STATE_DIR`, `AGENTS_CONFIG`, and `VAULT_PATH` can override the
locations. These paths must point to user-owned local storage and must never be
committed.

Gateway subprocesses receive operating-system essentials and only the provider
variables allowed for that agent. `DASH_TOKEN`, registry paths, and vault paths
are always blocked from gateway inheritance.

## Remote access

The dashboard binds to loopback by default. Remote mode requires `DASH_REMOTE=1`,
a long `DASH_TOKEN`, and exact `DASH_ALLOWED_ORIGINS`. Do not expose the dashboard
through a public tunnel without TLS and an additional access-control layer.

## Before publishing

Run:

```powershell
npm test
npm run audit:public
npm pack --dry-run
```

These checks cover the current tree and package contents. They do not erase a
secret from existing Git history. If a secret was ever committed, rotate it first,
then perform an explicitly approved history rewrite and coordinate fresh clones.

Report security issues privately to the repository owner. Do not open a public
issue containing tokens, vault content, personal paths, or exploit details.
