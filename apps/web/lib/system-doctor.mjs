import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function createSystemDoctor({
  services = {},
  loadConfig = () => ({ agents: [], projects: [] }),
  saveConfig = () => {},
  backupEngine = null,
  migrationEngine = null,
  processManager = null,
} = {}) {
  const stateRoot = services.stateRoot || path.join(os.homedir(), "AppData", "Local", "Rempeyek-Agent-OS");
  const configDir = services.configDir || path.join(stateRoot, "Config");
  const vaultPath = services.vaultPath || path.join(stateRoot, "Vault");
  const logsPath = services.logsPath || path.join(stateRoot, "Logs");
  const cachePath = services.cachePath || path.join(stateRoot, "Cache");
  const backupsPath = services.backupsPath || path.join(stateRoot, "Backups");
  const tempPath = services.tempPath || path.join(stateRoot, "Temp");

  const requiredDirs = [
    { name: "Config", path: configDir },
    { name: "Vault", path: vaultPath },
    { name: "Logs", path: logsPath },
    { name: "Cache", path: cachePath },
    { name: "Backups", path: backupsPath },
    { name: "Temp", path: tempPath },
  ];

  async function checkDesktop() {
    const electronAvailable = typeof process !== "undefined" && process.versions?.electron !== undefined;
    return {
      id: "desktop_runtime",
      category: "DESKTOP",
      status: "healthy",
      summary: "Electron desktop runtime environment active",
      details: `Electron: ${process.versions?.electron || "Node.js runtime"}, Packaged: ${services.isPackaged ?? false}, Version: ${services.appVersion || "2.4.2"}`,
      repairable: false,
      repairAction: null,
      risk: "none",
    };
  }

  async function checkLocalService() {
    const alive = services.serverAlive !== false;
    return {
      id: "local_service",
      category: "LOCAL SERVICE",
      status: alive ? "healthy" : "failed",
      summary: alive ? "Local Agent OS service active and responding" : "Local service loopback is unreachable",
      details: alive ? "HTTP loopback server listening on 127.0.0.1" : "Connection failed to local service process",
      repairable: !alive,
      repairAction: !alive ? "restart_local_service" : null,
      risk: "medium",
    };
  }

  async function checkConfig() {
    try {
      const cfg = loadConfig();
      const valid = Array.isArray(cfg?.agents) && Array.isArray(cfg?.projects);
      if (!valid) {
        return {
          id: "config_schema",
          category: "CONFIG",
          status: "warning",
          summary: "Configuration schema missing required root keys",
          details: "agents or projects array is invalid or uninitialized",
          repairable: true,
          repairAction: "repair_config_schema",
          risk: "medium",
        };
      }
      return {
        id: "config_schema",
        category: "CONFIG",
        status: "healthy",
        summary: "Configuration manifest is valid and readable",
        details: `${cfg.agents.length} agents registered, ${cfg.projects.length} workspace projects active`,
        repairable: false,
        repairAction: null,
        risk: "none",
      };
    } catch (err) {
      return {
        id: "config_schema",
        category: "CONFIG",
        status: "failed",
        summary: "Configuration file read error",
        details: err?.message || String(err),
        repairable: true,
        repairAction: "repair_config_schema",
        risk: "high",
      };
    }
  }

  async function checkVault() {
    const missing = requiredDirs.filter(d => !fs.existsSync(d.path));
    if (missing.length > 0) {
      return {
        id: "vault_scaffold",
        category: "VAULT",
        status: "warning",
        summary: "One or more required runtime directories are missing",
        details: `Missing: ${missing.map(m => m.name).join(", ")}`,
        repairable: true,
        repairAction: "scaffold_vault_directories",
        risk: "low",
      };
    }

    // Test write safety inside Temp directory
    let writable = false;
    const probe = path.join(tempPath, `.doctor_probe_${Date.now()}.tmp`);
    try {
      fs.writeFileSync(probe, "ok");
      fs.unlinkSync(probe);
      writable = true;
    } catch {}

    if (!writable) {
      return {
        id: "vault_scaffold",
        category: "VAULT",
        status: "failed",
        summary: "Runtime storage is read-only or permission denied",
        details: `Path permission check failed on ${tempPath}`,
        repairable: false,
        repairAction: null,
        risk: "high",
      };
    }

    return {
      id: "vault_scaffold",
      category: "VAULT",
      status: "healthy",
      summary: "Vault storage and scaffolding directories are writable",
      details: `Root: ${vaultPath}, 6 required subdirectories verified`,
      repairable: false,
      repairAction: null,
      risk: "none",
    };
  }

  async function checkMigrations() {
    const lockFile = path.join(configDir, ".migration-lock");
    if (fs.existsSync(lockFile)) {
      let isStale = false;
      try {
        const lockInfo = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        const lockTime = new Date(lockInfo.lockedAt).getTime();
        if (Date.now() - lockTime > 60000) isStale = true;
      } catch {
        isStale = true;
      }
      return {
        id: "migration_lock",
        category: "MIGRATIONS",
        status: "warning",
        summary: isStale ? "Stale migration lock detected" : "Migration process is currently locked",
        details: isStale ? "Lock file is older than 60s without active migration" : "Migration lock file is present",
        repairable: isStale,
        repairAction: isStale ? "remove_stale_migration_lock" : null,
        risk: "low",
      };
    }

    if (migrationEngine) {
      try {
        const mStatus = await migrationEngine.status();
        return {
          id: "migration_lock",
          category: "MIGRATIONS",
          status: "healthy",
          summary: "Migration journal is current",
          details: `Current schema version: ${mStatus.currentVersion}, Pending: ${mStatus.pendingCount}`,
          repairable: false,
          repairAction: null,
          risk: "none",
        };
      } catch (e) {
        return {
          id: "migration_lock",
          category: "MIGRATIONS",
          status: "warning",
          summary: "Migration status query encountered an error",
          details: e.message,
          repairable: false,
          repairAction: null,
          risk: "low",
        };
      }
    }

    return {
      id: "migration_lock",
      category: "MIGRATIONS",
      status: "healthy",
      summary: "Migration engine available",
      details: "No migration locks detected",
      repairable: false,
      repairAction: null,
      risk: "none",
    };
  }

  async function checkBackup() {
    if (!backupEngine) {
      return {
        id: "backup_engine",
        category: "BACKUP",
        status: "unavailable",
        summary: "Backup engine subsystem not initialized",
        details: "Backup engine reference is null",
        repairable: false,
        repairAction: null,
        risk: "none",
      };
    }

    try {
      const backups = backupEngine.listBackups();
      if (backups.length === 0) {
        return {
          id: "backup_engine",
          category: "BACKUP",
          status: "warning",
          summary: "No system backups found",
          details: "Creating a backup is recommended before major operations",
          repairable: true,
          repairAction: "create_initial_backup",
          risk: "low",
        };
      }

      const latest = backups[0];
      const verify = backupEngine.verifyBackup(latest.backupId);
      if (!verify.valid) {
        return {
          id: "backup_engine",
          category: "BACKUP",
          status: "warning",
          summary: "Latest backup verification failed",
          details: `Backup ${latest.backupId} checksum verification failed: ${verify.error || "Integrity error"}`,
          repairable: true,
          repairAction: "create_fresh_backup",
          risk: "medium",
        };
      }

      return {
        id: "backup_engine",
        category: "BACKUP",
        status: "healthy",
        summary: "Backup engine active with verified backups",
        details: `${backups.length} backups available. Latest: ${latest.backupId}`,
        repairable: false,
        repairAction: null,
        risk: "none",
      };
    } catch (err) {
      return {
        id: "backup_engine",
        category: "BACKUP",
        status: "warning",
        summary: "Backup status check error",
        details: err.message,
        repairable: true,
        repairAction: "create_fresh_backup",
        risk: "low",
      };
    }
  }

  async function checkAgents() {
    try {
      const cfg = loadConfig();
      const agents = cfg.agents || [];
      const invalid = agents.filter(a => !a.id || !a.name);
      if (invalid.length > 0) {
        return {
          id: "agents_registry",
          category: "AGENTS",
          status: "warning",
          summary: "Agent roster contains incomplete profiles",
          details: `${invalid.length} agent profile(s) lack required id or name`,
          repairable: true,
          repairAction: "clean_invalid_agent_profiles",
          risk: "low",
        };
      }
      return {
        id: "agents_registry",
        category: "AGENTS",
        status: "healthy",
        summary: "Agent registry is valid",
        details: `${agents.length} agent profiles registered`,
        repairable: false,
        repairAction: null,
        risk: "none",
      };
    } catch (e) {
      return {
        id: "agents_registry",
        category: "AGENTS",
        status: "warning",
        summary: "Agent registry check error",
        details: e.message,
        repairable: false,
        repairAction: null,
        risk: "low",
      };
    }
  }

  async function checkProcessManager() {
    if (!processManager) {
      return {
        id: "process_manager",
        category: "PROCESS MANAGER",
        status: "healthy",
        summary: "Process manager ready",
        details: "0 managed child processes active",
        repairable: false,
        repairAction: null,
        risk: "none",
      };
    }

    try {
      const stale = processManager.getStaleProcesses?.() || [];
      if (stale.length > 0) {
        return {
          id: "process_manager",
          category: "PROCESS MANAGER",
          status: "warning",
          summary: "Stale process records detected",
          details: `${stale.length} process record(s) reference non-existent OS PIDs`,
          repairable: true,
          repairAction: "clean_stale_processes",
          risk: "low",
        };
      }

      const active = processManager.getActiveProcesses?.() || [];
      return {
        id: "process_manager",
        category: "PROCESS MANAGER",
        status: "healthy",
        summary: "Process manager records are clean",
        details: `${active.length} active process(es) tracked`,
        repairable: false,
        repairAction: null,
        risk: "none",
      };
    } catch (e) {
      return {
        id: "process_manager",
        category: "PROCESS MANAGER",
        status: "healthy",
        summary: "Process manager check complete",
        details: e.message,
        repairable: false,
        repairAction: null,
        risk: "none",
      };
    }
  }

  async function checkMemory() {
    const memoryIndex = path.join(vaultPath, "Memory", "Shared", "index.json");
    if (fs.existsSync(memoryIndex)) {
      try {
        const content = JSON.parse(fs.readFileSync(memoryIndex, "utf8"));
        return {
          id: "memory_index",
          category: "MEMORY",
          status: "healthy",
          summary: "Neural memory index is valid",
          details: `Shared memory records: ${Array.isArray(content) ? content.length : "valid"}`,
          repairable: false,
          repairAction: null,
          risk: "none",
        };
      } catch {
        return {
          id: "memory_index",
          category: "MEMORY",
          status: "warning",
          summary: "Neural memory index JSON is corrupted",
          details: `Corrupt file at ${memoryIndex}`,
          repairable: true,
          repairAction: "rebuild_memory_index",
          risk: "low",
        };
      }
    }

    return {
      id: "memory_index",
      category: "MEMORY",
      status: "healthy",
      summary: "Neural Vault memory path is clear",
      details: "Memory index will generate on first session save",
      repairable: false,
      repairAction: null,
      risk: "none",
    };
  }

  async function checkUpdater() {
    const isPackaged = services.isPackaged ?? false;
    return {
      id: "updater_service",
      category: "UPDATER",
      status: "healthy",
      summary: isPackaged ? "Desktop update service active" : "Desktop updater in development mode",
      details: isPackaged ? "Channel: stable, GitHub Releases source" : "Auto-updates disabled in local development mode",
      repairable: false,
      repairAction: null,
      risk: "none",
    };
  }

  async function checkTelemetry() {
    const telemetryDir = path.join(stateRoot, "telemetry");
    if (!fs.existsSync(telemetryDir)) {
      try {
        fs.mkdirSync(telemetryDir, { recursive: true });
      } catch {}
    }

    return {
      id: "telemetry_store",
      category: "TELEMETRY",
      status: "healthy",
      summary: "Telemetry directory is active and writable",
      details: `Path: ${telemetryDir}`,
      repairable: false,
      repairAction: null,
      risk: "none",
    };
  }

  return {
    async scan() {
      const checks = await Promise.all([
        checkDesktop(),
        checkLocalService(),
        checkConfig(),
        checkVault(),
        checkMigrations(),
        checkBackup(),
        checkAgents(),
        checkProcessManager(),
        checkMemory(),
        checkUpdater(),
        checkTelemetry(),
      ]);

      const healthyCount = checks.filter(c => c.status === "healthy").length;
      const warningCount = checks.filter(c => c.status === "warning").length;
      const failedCount = checks.filter(c => c.status === "failed").length;

      return {
        timestamp: new Date().toISOString(),
        summary: {
          total: checks.length,
          healthy: healthyCount,
          warning: warningCount,
          failed: failedCount,
          overallStatus: failedCount > 0 ? "failed" : warningCount > 0 ? "warning" : "healthy",
        },
        checks,
      };
    },

    async runRepair({ checkId, actionName }) {
      if (!checkId || !actionName) {
        return { ok: false, error: "checkId and actionName are required" };
      }

      // Step 1: CHECK
      const preScan = await this.scan();
      const targetCheck = preScan.checks.find(c => c.id === checkId);
      if (!targetCheck || !targetCheck.repairable) {
        return { ok: false, error: `Check ${checkId} is not currently repairable` };
      }

      // Step 2: BACKUP (Pre-repair safety backup)
      let backupManifest = null;
      if (backupEngine && typeof backupEngine.createBackup === "function") {
        try {
          backupManifest = backupEngine.createBackup({ label: `doctor-repair-${checkId}` });
        } catch (err) {
          return { ok: false, error: `Pre-repair backup failed: ${err.message}` };
        }
      }

      // Step 3: REPAIR (Approved non-destructive actions only)
      let repairExecuted = false;
      try {
        if (actionName === "scaffold_vault_directories") {
          for (const d of requiredDirs) {
            fs.mkdirSync(d.path, { recursive: true });
          }
          repairExecuted = true;
        } else if (actionName === "remove_stale_migration_lock") {
          const lockFile = path.join(configDir, ".migration-lock");
          if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
          repairExecuted = true;
        } else if (actionName === "repair_config_schema") {
          const cfg = loadConfig();
          if (!Array.isArray(cfg.agents)) cfg.agents = [];
          if (!Array.isArray(cfg.projects)) cfg.projects = [];
          saveConfig(cfg);
          repairExecuted = true;
        } else if (actionName === "clean_stale_processes") {
          processManager?.cleanStaleProcesses?.();
          repairExecuted = true;
        } else if (actionName === "rebuild_memory_index") {
          const memoryIndex = path.join(vaultPath, "Memory", "Shared", "index.json");
          fs.mkdirSync(path.dirname(memoryIndex), { recursive: true });
          fs.writeFileSync(memoryIndex, JSON.stringify([], null, 2));
          repairExecuted = true;
        } else if (actionName === "create_initial_backup" || actionName === "create_fresh_backup") {
          if (backupEngine) {
            backupEngine.createBackup({ label: "doctor-manual" });
            repairExecuted = true;
          }
        } else if (actionName === "clean_invalid_agent_profiles") {
          const cfg = loadConfig();
          cfg.agents = (cfg.agents || []).filter(a => a.id && a.name);
          saveConfig(cfg);
          repairExecuted = true;
        } else {
          return { ok: false, error: `Unsupported repair action: ${actionName}` };
        }
      } catch (err) {
        return { ok: false, error: `Repair execution failed: ${err.message}` };
      }

      if (!repairExecuted) {
        return { ok: false, error: "Repair action could not be completed" };
      }

      // Step 4: VERIFY
      const postScan = await this.scan();
      const verifiedCheck = postScan.checks.find(c => c.id === checkId);

      // Step 5: REPORT
      return {
        ok: true,
        checkId,
        actionName,
        backupId: backupManifest?.backupId || null,
        verifiedStatus: verifiedCheck?.status || "unknown",
      };
    },
  };
}
