# Clean Uninstall Guide

This guide provides step-by-step instructions for performing a clean uninstall of **Rempeyek Agent OS**, including data exports, removing application shortcuts, clearing runtime caches, and cleaning up registry entries or scheduled tasks.

---

## Pre-Uninstallation Data Export

Before uninstalling, you may want to back up your system configurations, custom agent profiles, or local Neural Vault notes.

### Exporting System Data & Vault
1. **System Configurations**: Copy `%LOCALAPPDATA%\Rempeyek-Agent-OS\Config` to a safe location (e.g., Desktop or external backup drive).
2. **Backups Directory**: Preserve `%LOCALAPPDATA%\Rempeyek-Agent-OS\Backups\` if you wish to retain system snapshots.
3. **Neural Vault Data**: If your Obsidian Vault is configured inside `%LOCALAPPDATA%\Rempeyek-Agent-OS\Vault`, copy the entire `Vault` directory. If you used a custom external Vault path, your notes will not be modified or deleted during uninstall unless explicitly removed manually.

---

## Uninstalling Portable Mode

If you run Rempeyek Agent OS in **Portable Mode** (cloned GitHub repository or extracted zip archive):

1. Stop any running instance of the application or background processes:
   ```cmd
   taskkill /f /im node.exe
   ```
2. Delete the application repository folder completely:
   ```cmd
   rmdir /s /q "C:\path\to\Rempeyek-Agent-OS"
   ```
3. Remove the local runtime directory:
   ```cmd
   rmdir /s /q "%LOCALAPPDATA%\Rempeyek-Agent-OS"
   ```

---

## Uninstalling Windows Installer Edition

If you installed Rempeyek Agent OS using the Windows Setup installer (`Rempeyek-Agent-OS-Setup-X.X.X.exe`):

### Option A: Via Windows Settings (Recommended)
1. Open **Windows Settings** (`Win + I`).
2. Go to **Apps** > **Installed apps** (or **Apps & features**).
3. Search for **Rempeyek Agent OS**.
4. Click the three dots `...` next to the app name and select **Uninstall**.
5. Follow the on-screen uninstaller wizard prompts.

### Option B: Silent Uninstaller Command
Run the built-in uninstaller executable directly:
```cmd
"%LOCALAPPDATA%\Programs\rempeyek-agent-os\Uninstall Rempeyek Agent OS.exe" /S
```

---

## Cleaning Up Residual Files & Shortcuts

To ensure complete removal of residual configuration files, registry keys, and background schedules:

### 1. Removing Runtime Directories
Delete the application runtime data directory:
```cmd
rmdir /s /q "%LOCALAPPDATA%\Rempeyek-Agent-OS"
```

### 2. Removing Desktop & Start Menu Shortcuts
If residual shortcuts remain on your desktop or Start Menu, remove them:
```cmd
del "%USERPROFILE%\Desktop\Rempeyek Agent OS.lnk"
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Rempeyek Agent OS.lnk"
```

### 3. Registry Cleanup (Windows Setup Edition)
The uninstaller automatically removes standard registry keys. If manual cleanup is required, verify that the following keys are removed:

* `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\rempeyek-agent-os`
* `HKCU\Software\rempeyek-agent-os`

> [!CAUTION]
> Editing the Windows Registry should be done with care. Always export registry keys prior to manual deletion.

---

## Clearing Scheduled Tasks (If Applicable)

If you configured automated cron jobs or background health checks via Task Scheduler:

1. Open **Task Scheduler** (`taskschd.msc`).
2. Look for any task starting with `RempeyekAgentOS` or `RempeyekCheck`.
3. Right-click the task and select **Delete**.
4. Alternatively, use the command line:
   ```cmd
   schtasks /delete /tn "RempeyekAgentOS" /f
   ```

---

## Summary Checklist for Complete Cleanup

* [ ] Saved backups from `%LOCALAPPDATA%\Rempeyek-Agent-OS\Config` or `Vault/`.
* [ ] Terminated all background `node.exe` or worker processes.
* [ ] Ran uninstaller executable or deleted portable directory.
* [ ] Removed runtime root directory (`%LOCALAPPDATA%\Rempeyek-Agent-OS`).
* [ ] Removed desktop and Start Menu shortcuts.
* [ ] Verified Task Scheduler for lingering scheduled tasks.
