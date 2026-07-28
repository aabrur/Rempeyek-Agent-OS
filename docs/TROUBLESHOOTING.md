# Troubleshooting Guide

This document provides resolutions for common operational issues, system errors, configuration recoveries, and runtime diagnostics in **Rempeyek Agent OS**.

---

## Quick Diagnostic Checklist

If you encounter issues during launch or operation, run through these primary checks:

1. **Verify Node.js Version**: Ensure Node.js `>= 18.0.0` (LTS recommended) is installed:
   ```bash
   node -v
   ```
2. **Check Server Logs**: Inspect server terminal logs or log files under `%LOCALAPPDATA%\Rempeyek-Agent-OS\Logs\`.
3. **Verify Dashboard Build**: Ensure static UI assets have been compiled (`npm run build`).

---

## Common Issues & Solutions

### 1. Port Already in Use (`EADDRINUSE`)
* **Symptom**: Server startup fails with `Error: listen EADDRINUSE: address already in use :::4321`.
* **Cause**: Another process (or a previous instance of Rempeyek Agent OS) is binding port `4321`.
* **Solution**:
  * **Option A**: Specify a different port using environment variables:
    ```cmd
    set PORT=4322 && npm run start
    ```
    or in PowerShell / Bash:
    ```bash
    PORT=4322 node bin/rempeyek-agent-os.mjs
    ```
  * **Option B**: Find and terminate the process occupying the port (Windows):
    ```cmd
    netstat -ano | findstr :4321
    taskkill /pid <PID> /f
    ```

---

### 2. Permission Denied on Vault Path (`EACCES` / `EPERM`)
* **Symptom**: Errors writing to `Vault/` or `Config/` paths during initialization or node updates.
* **Cause**: The current OS user lacks write permissions for the specified Vault folder, or another application (e.g., anti-virus, Obsidian lock) holds an exclusive file lock.
* **Solution**:
  * Ensure the directory path is writable by your user account.
  * If using an external drive or network share for your Neural Vault, ensure network permissions allow full read/write access.
  * Close third-party editors locking index files in `%LOCALAPPDATA%\Rempeyek-Agent-OS\Vault`.

---

### 3. Bootstrap Failed
* **Symptom**: Console outputs `Bootstrap completed with errors` or server stops during initialization.
* **Cause**: Missing directory scaffolding, permission errors, or corrupted default configuration files.
* **Solution**:
  * Inspect the generated bootstrap report located at:
    `%LOCALAPPDATA%\Rempeyek-Agent-OS\Config\bootstrap-report.json`
  * Check the `errors` array in `bootstrap-report.json` for specific failed step details.
  * To force a re-bootstrap, back up your custom agent data and delete `%LOCALAPPDATA%\Rempeyek-Agent-OS\Config\runtime-manifest.json`, then restart the server.

---

### 4. Agent Won't Start or Fails to Respond
* **Symptom**: Agents display as `OFFLINE` or fail to execute commands in the dashboard topology map.
* **Cause**: Incorrect adapter binary path, invalid trigger command configuration, missing API keys, or process exit code failures.
* **Solution**:
  * Check process adapter logs in `%LOCALAPPDATA%\Rempeyek-Agent-OS\Logs\`.
  * Validate gateway configuration and process adapter settings in `Config/family-registry.json`.
  * Verify that any required environment variables (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) are present in `.env` or system environment.

---

### 5. Node.js Version Too Old
* **Symptom**: Syntax errors such as `SyntaxError: Unexpected token '?'` or `import.meta URL unsupported`.
* **Cause**: Running Node.js version `< 18.0.0`.
* **Solution**:
  * Upgrade Node.js to version `18.x`, `20.x`, or higher from [nodejs.org](https://nodejs.org/).
  * Verify updated version in terminal:
    ```bash
    node -v
    ```

---

### 6. Config File Corrupted
* **Symptom**: Server crashes on startup with `SyntaxError: Unexpected end of JSON input` when loading configuration files.
* **Cause**: System shutdown or power loss while writing to a config file.
* **Solution**:
  * The system maintains automated backup files (`.bak`) for key registries.
  * Restore from auto-backup by replacing the corrupted `.json` file with its corresponding `.json.bak` file in `%LOCALAPPDATA%\Rempeyek-Agent-OS\Config\`.
  * Alternatively, restore from a system backup via API or follow [BACKUP-RESTORE.md](file:///docs/BACKUP-RESTORE.md).

---

### 7. Migration Lock Stuck (`Migration is locked`)
* **Symptom**: Migration execution fails with: `Error: Migration is locked. Another process may be running.`
* **Cause**: A previous migration run was interrupted or crashed before releasing `.migration-lock`.
* **Solution**:
  1. Verify no other instance of Rempeyek Agent OS is actively running migrations.
  2. Safely delete the stale lock file:
     ```cmd
     del "%LOCALAPPDATA%\Rempeyek-Agent-OS\Config\.migration-lock"
     ```
  3. Re-run migration status check or execution.

---

### 8. Dashboard Displays Blank Page
* **Symptom**: Navigating to `http://localhost:4321` shows a blank white page or 4404 missing static asset errors.
* **Cause**: Frontend static assets have not been built, or Vite build output in `apps/web/dist` is missing.
* **Solution**:
  * Rebuild the web application assets:
    ```bash
    npm run build
    ```
  * For development with hot reloading, use:
    ```bash
    npm run dev
    ```

---

### 9. Clearing Logs & Cache
* **Symptom**: High disk usage or stale temporary graph indexes.
* **Solution**:
  * It is safe to purge temporary runtime logs and caches when the application is stopped:
    ```cmd
    rmdir /s /q "%LOCALAPPDATA%\Rempeyek-Agent-OS\Logs"
    rmdir /s /q "%LOCALAPPDATA%\Rempeyek-Agent-OS\Cache"
    rmdir /s /q "%LOCALAPPDATA%\Rempeyek-Agent-OS\Temp"
    ```
  * The system will recreate these directories automatically on next launch.
