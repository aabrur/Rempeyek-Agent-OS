# @rempeyek/neural-vault

**Extraction target — code lives in `apps/web` today.**

Vault domain logic: `walk`/`walkVault` scanner, Obsidian-order link resolver
(`resolveLink`), 4-layer graph builder (`buildGraph`), open-tasks scanner, vault
health (git/backup age).

Canonical spec: [`docs/Neural-Vault.md`](../../docs/Neural-Vault.md).
Current source: `apps/web/server.js` (vault scan + graph sections).
