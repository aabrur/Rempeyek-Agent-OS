# Detailed Installation & Deployment Guide

This guide covers system requirements, installation options, environment variables, directory structures across platforms, and upgrade paths for **Rempeyek Agent OS**.

---

## System Requirements

| Requirement | Minimum | Recommended |
| :--- | :--- | :--- |
| **Node.js** | 18.0.0+ | 20.x LTS |
| **Disk Space** | 500 MB | 2 GB+ (for vault storage & model caches) |
| **Memory (RAM)** | 2 GB | 4 GB+ |
| **OS Support** | Windows 10/11, macOS 12+, Linux (glibc 2.31+) | Windows 11, macOS 14+, Ubuntu 22.04 LTS |

---

## Installation Methods

### Method 1: Source Repository (Recommended for Developers)

1. Clone the repository:
   ```bash
   git clone https://github.com/aabrur/Rempeyek-Agent-OS.git
   cd Rempeyek-Agent-OS
   ```
2. Install production dependencies:
   ```bash
   npm install --production
   ```
3. Start the application:
   ```bash
   node bin/rempeyek-agent-os.mjs
   ```

### Method 2: Windows Installer (.exe / Desktop Pack)

1. Download the latest `Rempeyek-Agent-OS-Setup.exe` release package from GitHub Releases.
2. Execute the setup wizard to install desktop components and system service background launchers.
3. Launch via the Desktop shortcut or Start Menu entry.

### Method 3: Portable Mode

Portable mode runs entirely within a dedicated directory without writing system-wide configurations:

1. Extract the release ZIP package into a isolated folder (e.g., `D:\RempeyekPortable\`).
2. Set the `REMPEYEK_MODE=portable` environment variable.
3. Launch using `node bin/rempeyek-agent-os.mjs`. All runtime states will remain relative to the execution root.

---

## Environment Variables

Rempeyek Agent OS allows configuration via environment variables:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `REMPEYEK_RUNTIME_ROOT` | Platform AppData (see table below) | Root directory for application state, logs, config, and runtime caches. |
| `REMPEYEK_VAULT_PATH` | `<REMPEYEK_RUNTIME_ROOT>/Vault` | Storage location for Neural Vault memory, markdown notes, and Graphify indexes. |
| `REMPEYEK_SKILLS_PATH` | `~/.skills` | Central skill warehouse directory synchronized across AI agents. |
| `PORT` | `4321` | HTTP port for the web dashboard server. |
| `REMPEYEK_MODE` | `installed` | Set to `installed`, `development`, or `portable`. |
| `DASH_TOKEN` | *(Empty / Disabled)* | Secret token required for dashboard access (enables authentication via `x-dash-token` header). |

---

## Platform File Locations

When running in standard `installed` mode, files are organized as follows:

| Operating System | Runtime Root (`REMPEYEK_RUNTIME_ROOT`) | Config Directory | Vault Directory | Logs Directory |
| :--- | :--- | :--- | :--- | :--- |
| **Windows** | `%LOCALAPPDATA%\Rempeyek-Agent-OS\` | `%LOCALAPPDATA%\Rempeyek-Agent-OS\Config\` | `%LOCALAPPDATA%\Rempeyek-Agent-OS\Vault\` | `%LOCALAPPDATA%\Rempeyek-Agent-OS\Logs\` |
| **macOS** | `~/Library/Application Support/Rempeyek-Agent-OS/` | `~/Library/Application Support/Rempeyek-Agent-OS/Config/` | `~/Library/Application Support/Rempeyek-Agent-OS/Vault/` | `~/Library/Application Support/Rempeyek-Agent-OS/Logs/` |
| **Linux** | `~/.local/share/Rempeyek-Agent-OS/` | `~/.local/share/Rempeyek-Agent-OS/Config/` | `~/.local/share/Rempeyek-Agent-OS/Vault/` | `~/.local/share/Rempeyek-Agent-OS/Logs/` |

---

## Verifying Installation

Verify the health, configuration, and bootstrap status of your installation using the status check:

```bash
node bin/rempeyek-agent-os.mjs status
```

Alternatively, query the runtime API endpoint:

```bash
curl http://localhost:4321/api/bootstrap/status
```

Expected JSON output structure:
```json
{
  "bootstrapped": true,
  "state": "healthy",
  "version": "2.3.1",
  "mode": "installed",
  "vaultPath": ".../Vault"
}
```

---

## Upgrading from a Previous Version

1. **Pull the latest code changes:**
   ```bash
   git pull origin main
   ```
2. **Update dependencies:**
   ```bash
   npm install
   ```
3. **Re-build the Dashboard UI:**
   ```bash
   npm run build
   ```
4. **Run internal migrations (if upgrading across major versions):**
   ```bash
   node bin/rempeyek-agent-os.mjs
   ```
   *The system automatically detects schema updates and executes backward-compatible migrations during the bootstrap phase.*
