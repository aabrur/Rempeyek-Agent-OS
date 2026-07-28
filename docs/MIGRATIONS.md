# Migration System Documentation

This document describes the schema migration and runtime state upgrade system in **Rempeyek Agent OS**, implemented in `migration-engine.mjs`.

---

## Overview

As Rempeyek Agent OS evolves, schema changes, configuration updates, and directory structure adjustments are applied using an automated migration engine. The migration system guarantees:

* **Sequential Execution**: Migrations execute in ascending numeric order based on their version number.
* **Pre-Migration Safety Backups**: Automatic state snapshotting occurs before executing any pending migration.
* **Concurrency Locking**: A lock file (`.migration-lock`) prevents simultaneous migration runs across multiple worker processes.
* **Validation & Rollback Capabilities**: Reversible migrations support explicit `down` routines and `validate` hooks.

---

## Migration File Specification

Migration modules are placed in `apps/web/lib/migrations/` and formatted as ES Modules (`.mjs`).

### Schema & Export Requirements
Each migration file must export the following named exports:

| Export | Type | Description |
| :--- | :--- | :--- |
| `version` | `Number` | Unique integer version identifier (e.g., `1`, `2`). |
| `description` | `String` | Human-readable explanation of the migration's purpose. |
| `reversible` | `Boolean` | Indicates if a `down` function is provided for rollback. |
| `up({ configDir, vaultPath })` | `Async Function` | Applies changes to configuration and vault paths. |
| `down({ configDir, vaultPath })` | `Async Function` | Reverts changes applied by `up` (Required if `reversible: true`). |
| `validate({ configDir, vaultPath })` | `Async Function` | Returns `{ valid: boolean, errors: string[] }` post-migration. |

### Example Migration Structure
```js
import fs from 'node:fs';
import path from 'node:path';

export const version = 2;
export const description = 'Add custom agents registry file';
export const reversible = true;

export async function up({ configDir, vaultPath }) {
  const filePath = path.join(configDir, 'custom-agents.json');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ agents: [] }, null, 2));
  }
  return { updated: true };
}

export async function down({ configDir, vaultPath }) {
  const filePath = path.join(configDir, 'custom-agents.json');
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return { reverted: true };
}

export async function validate({ configDir, vaultPath }) {
  const filePath = path.join(configDir, 'custom-agents.json');
  const valid = fs.existsSync(filePath);
  return { valid, errors: valid ? [] : ['custom-agents.json is missing'] };
}
```

---

## Migration Tracking & Lock System

### Migration Journal (`migration-journal.json`)
The current state of executed migrations is tracked inside `<runtimeRoot>/Config/migration-journal.json`:

```json
{
  "currentVersion": 1,
  "migrations": [
    {
      "version": 1,
      "description": "Initialize runtime directories",
      "status": "completed",
      "executedAt": "2026-07-28T10:00:00.000Z",
      "durationMs": 45,
      "error": null
    }
  ]
}
```

### Concurrency Lock File (`.migration-lock`)
During migration execution, the engine acquires a temporary lock file at `<runtimeRoot>/Config/.migration-lock`.

> [!WARNING]
> If a process crashes unexpectedly during a migration, `.migration-lock` might remain on disk, blocking subsequent executions with the error `Migration is locked`. See [TROUBLESHOOTING.md](file:///docs/TROUBLESHOOTING.md) to safely clear stale lock files.

---

## Operating Migrations Programmatically

The migration engine provides status, dry-run, execution, and rollback methods:

```js
import { createMigrationEngine } from './lib/migration-engine.mjs';

const engine = createMigrationEngine({
  configDir: 'path/to/Config',
  vaultPath: 'path/to/Vault',
  backupsDir: 'path/to/Backups'
});
```

### Checking Status
```js
const status = await engine.status();
console.log(`Current version: ${status.currentVersion}`);
console.log(`Pending migrations: ${status.pendingCount}`);
```

### Dry Run (Preview Pending Migrations)
```js
const preview = await engine.dryRun();
console.log('Would run:', preview.wouldRun);
console.log('Target version:', preview.wouldUpdateTo);
```

### Running Pending Migrations
```js
const result = await engine.run();
console.log('Migration execution result:', result);
```

### Rolling Back to a Target Version
```js
// Rolls back all executed migrations down to target version 0
const rollbackResult = await engine.rollback(0);
console.log('Rollback result:', rollbackResult);
```

---

## Active System Migrations

### `001-initialize-runtime.mjs`
* **Version**: `1`
* **Description**: `Initialize runtime directories`
* **Reversible**: `true`
* **Operation**: Ensures that all standard runtime directories exist under the configured Vault/Runtime root:
  * `Config/`
  * `Logs/`
  * `Cache/`
  * `Backups/`
  * `Quarantine/`
  * `Temp/`
  * `Runtime/`
  * `Updates/`
  * `Packages/`
