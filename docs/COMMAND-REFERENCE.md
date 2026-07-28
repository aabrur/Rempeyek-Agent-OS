# Rempeyek Agent OS Command Reference

All slash commands operate against canonical Vault: `C:\Users\abrur\AppData\Local\Rempeyek-Agent-OS\Vault`

## 1. `/obsidian`
- **Purpose:** Opens or checks initialization status of canonical Rempeyek Vault for Obsidian.
- **Output:** Vault path, note count, writable health status.

## 2. `/obsidian-vault`
- **Operations:**
  - `/obsidian-vault status` — Check vault health.
  - `/obsidian-vault init` — Initialize vault directories.
  - `/obsidian-vault health` — Return detailed health metrics.
  - `/obsidian-vault repair` — Re-scaffold missing folders safely.
  - `/obsidian-vault register-project <path>` — Register a project for indexing.

## 3. `/shared-memory`
- **Operations:**
  - `/shared-memory status` — Show shared memory state.
  - `/shared-memory read` — Retrieve recent agent handoffs.
  - `/shared-memory promote` — Promote candidate memory into shared memory.

## 4. `/graphify`
- **Operations:**
  - `/graphify status` — Show node and edge counts.
  - `/graphify scan` — Scan registered projects into graph.
  - `/graphify project <id>` — Scan specific project.

## 5. `/skills`
- **Operations:**
  - `/skills status` — View synchronized skills.
  - `/skills discover` — Scan central warehouse `C:\Users\abrur\.skills`.
  - `/skills sync` — Synchronize skills to agent nodes.
