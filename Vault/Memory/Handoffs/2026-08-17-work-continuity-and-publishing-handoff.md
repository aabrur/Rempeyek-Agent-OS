# Architectural Handoff: Rempeyek Agent OS v2.4.2

**Date:** 2026-08-17  
**Author:** Antigravity  
**Target:** All AI Agents & Subagents  
**Status:** Canonical & Verified  

---

## 1. Operating Axioms

1. **WORK SURVIVES THE AGENT**:
   - Work state does not live in ephemeral agent context.
   - The canonical lifecycle is: `Project` $\rightarrow$ `Goal` $\rightarrow$ `Mission` $\rightarrow$ `Work Contract` $\rightarrow$ `Run` $\rightarrow$ `Work Unit` $\rightarrow$ `Worker` $\rightarrow$ `Tool Action` $\rightarrow$ `Artifact` $\rightarrow$ `Evidence` $\rightarrow$ `Verification` $\rightarrow$ `Approval` $\rightarrow$ `Memory` $\rightarrow$ `Next Action` $\rightarrow$ `Continue`.
   - When an agent is interrupted, a `Handoff` record snapshot is saved to `Vault/Work/Handoffs/` and the next agent resumes seamlessly.

2. **DYNAMIC CWD INSIDE REMPEYEK AGENT OS**:
   - When an agent is summoned to a terminal or when a gateway runs, its working directory (CWD) is **always the Rempeyek Agent OS installation folder** (`%LOCALAPPDATA%\Rempeyek-Agent-OS` on Windows, `~/Library/Application Support/Rempeyek-Agent-OS` on macOS, `~/.local/share/Rempeyek-Agent-OS` on Linux, or the active workspace root).
   - This guarantees every agent operates directly on the Vault, Projects, Memory, and System tools.

3. **USER CONSENT & ZERO AUTO-REGISTRATION**:
   - The public OS ships with `agents: []` in `agents.config.json`.
   - No agent is registered or activated without explicit user initiation via `＋ ADD AGENT` or the Marketplace.

4. **MULTI-PLATFORM PUBLISHING & RETRY ISOLATION**:
   - One master campaign generates native `PlatformVariant`s for Twitter/X, LinkedIn, YouTube, TikTok, and Meta.
   - Preflight validation enforces character limits, aspect ratios, and required fields.
   - Partial success reconciliation: if platform A fails while platforms B and C succeed, retrying only republishes to platform A.

---

## 2. Directory Layout & Persistence

- `Vault/Work/Missions/`: Mission state records.
- `Vault/Work/Contracts/`: Immutable work contracts with objectives and definition of done.
- `Vault/Work/Runs/`: Run executions and worker assignments.
- `Vault/Work/Evidence/`: Evidence records with verification class.
- `Vault/Work/Handoffs/`: Inter-worker handoff snapshots.
- `Vault/Social/Campaigns/`: Publishing campaigns.
- `Vault/Social/Variants/`: Platform-adapted copy and media.
- `Vault/Social/Jobs/`: Publication execution jobs.
- `Vault/Social/Receipts/`: Verified publication receipts with external URLs.
- `Vault/Memory/`: Shared cross-agent memory, decisions, and handoffs.

---

## 3. Verification Summary

- **Web Tests:** 412/412 PASS
- **Desktop Tests:** 39/39 PASS
- **Public Release Audit:** PASS (Zero personal paths)
- **Knowledge Graph:** 3,310 nodes, 5,107 edges in `graphify-out/`
