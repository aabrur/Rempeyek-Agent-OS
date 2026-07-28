# Backup and Restore Guide

This guide explains how backup and restoration operations work in **Rempeyek Agent OS**, detailing the structure of system backups, verification routines, API interfaces, and manual backup instructions.

---

## Overview & Architecture

Rempeyek Agent OS features an automated backup system powered by `backup-engine.mjs`. System backups are designed to capture essential system state, configuration metadata, access control policies, and knowledge graph indexes while avoiding bloated source archives.

### What is Included in a Backup
The backup engine selectively archives critical state and index files:

* **Configuration Manifests (`config`)**:
  * `runtime-manifest.json` — Core runtime identity and version settings.
  * `family-registry.json` — AI agent family definitions and catalog metadata.
  * `project-registry.json` — Workspace registry and project topology configurations.
  * `skills-registry.json` — Registered agent skills and capabilities.
  * `migration-journal.json` — Historical database migration execution journal.
  * `access-policy.json` — Role-based permissions and access policies.
* **Vault Indexes (`vault`)**:
  * `Memory/Shared/index.json` — Shared memory index records.
  * `Graph/Indexes/graph-index.json` — Vault knowledge graph linkage index.

> [!IMPORTANT]
> System backups do **NOT** archive application source code, node_modules, or raw workspace project files. These remain managed via standard version control (Git) or local project paths to keep backup archives fast, minimal, and deterministic.

---

## Backup Storage & Directory Structure

Backups are stored under the system runtime root directory:

```text
<runtimeRoot>/Backups/<timestamp>-<label>/
```

On a standard Windows installation, this resolves to:
`%LOCALAPPDATA%\Rempeyek-Agent-OS\Backups\` (or relative to your custom runtime root).

### Directory Contents
Each backup folder contains a sub-directory structure separating `config` and `vault` files, along with a master `backup-manifest.json`:

```text
<runtimeRoot>/Backups/2026-07-28T12-00-00-000Z-backup/
├── backup-manifest.json
├── config/
│   ├── runtime-manifest.json
│   ├── family-registry.json
│   ├── project-registry.json
│   ├── skills-registry.json
│   ├── migration-journal.json
│   └── access-policy.json
└── vault/
    └── Memory/Shared/index.json
```

---

## Manifest Format (`backup-manifest.json`)

Every backup directory contains a JSON manifest detailing the backup metadata and SHA-256 checksums for every archived file:

```json
{
  "backupId": "2026-07-28T12-00-00-000Z-manual-backup",
  "createdAt": "2026-07-28T12:00:00.000Z",
  "label": "manual-backup",
  "applicationVersion": "2.3.2",
  "files": [
    {
      "type": "config",
      "originalPath": "%LOCALAPPDATA%\\Rempeyek-Agent-OS\\Config\\runtime-manifest.json",
      "relativePath": "config\\runtime-manifest.json",
      "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "size": 512
    },
    {
      "type": "vault",
      "originalPath": "%LOCALAPPDATA%\\Rempeyek-Agent-OS\\Vault\\Memory\\Shared\\index.json",
      "relativePath": "vault\\Memory\\Shared\\index.json",
      "checksum": "a7d9f3...b412",
      "size": 2048
    }
  ]
}
```

---

## Operating Backups via API & Engine

### 1. Creating a Backup
Backups can be triggered via the REST API or programmatically:

* **API Endpoint**: `POST /api/settings/restore-backup` (resets or restores configuration from active backup files).
* **Engine Method**:
  ```js
  import { createBackupEngine } from './lib/backup-engine.mjs';

  const backupEngine = createBackupEngine({
    configDir: 'path/to/Config',
    vaultPath: 'path/to/Vault',
    backupsDir: 'path/to/Backups'
  });

  const manifest = backupEngine.createBackup({ label: 'pre-upgrade' });
  console.log(`Created backup: ${manifest.backupId}`);
  ```

### 2. Listing Backups
Retrieve all valid backups ordered by creation timestamp (newest first):

```js
const backups = backupEngine.listBackups();
// Returns array of backup-manifest objects
```

### 3. Verifying Integrity
Validates that all files listed in the manifest exist in the backup archive and match their SHA-256 checksums:

```js
const verification = backupEngine.verifyBackup('2026-07-28T12-00-00-000Z-pre-upgrade');
if (!verification.valid) {
  console.error(`Backup corrupt: ${verification.error}`);
}
```

### 4. Restore Preview
Before applying a restore, inspect what actions (`create`, `skip`, or `overwrite`) will occur for each file:

```js
const preview = backupEngine.restorePreview('2026-07-28T12-00-00-000Z-pre-upgrade');
console.log(preview);
/*
[
  {
    target: '.../Config/runtime-manifest.json',
    action: 'overwrite',
    backupChecksum: 'e3b0...',
    currentChecksum: 'f1a2...'
  }
]
*/
```

### 5. Executing Restoration
Restores files atomically using temporary swap buffers to ensure target files are not left partially written in the event of an interruption:

```js
const result = backupEngine.restore('2026-07-28T12-00-00-000Z-pre-upgrade');
console.log(`Successfully restored ${result.restoredFiles} files.`);
```

---

## Manual Backup & Recovery Instructions

If the runtime server or UI is inaccessible, you can perform manual backups using standard OS commands.

### Creating a Manual Backup
1. Stop the Rempeyek Agent OS process.
2. Create a timestamped folder inside your runtime backups directory:
   ```cmd
   mkdir "%LOCALAPPDATA%\Rempeyek-Agent-OS\Backups\manual-backup-20260728"
   ```
3. Copy the `Config` directory and Vault index files:
   ```cmd
   xcopy "%LOCALAPPDATA%\Rempeyek-Agent-OS\Config" "%LOCALAPPDATA%\Rempeyek-Agent-OS\Backups\manual-backup-20260728\config" /E /I /Y
   ```

### Manual Restoration
To manually roll back to a backup:
1. Stop the Rempeyek process.
2. Copy files from your backup `config` directory back into `%LOCALAPPDATA%\Rempeyek-Agent-OS\Config\`.
3. Restart the system server: `npm run start`.
