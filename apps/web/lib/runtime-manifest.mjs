import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createRuntimeManifest(configDir) {
  const manifestPath = path.join(configDir, 'runtime-manifest.json');
  const tmpManifestPath = path.join(configDir, 'runtime-manifest.json.tmp');

  function exists() {
    return fs.existsSync(manifestPath);
  }

  function read() {
    if (!exists()) return null;
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      return null;
    }
  }

  function atomicWrite(data) {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(tmpManifestPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpManifestPath, manifestPath);
  }

  function create(opts = {}) {
    const now = new Date().toISOString();
    const manifest = {
      product: "Rempeyek Agent OS",
      installationId: opts.installationId || crypto.randomUUID(),
      runtimeSchemaVersion: 1,
      vaultSchemaVersion: 1,
      graphSchemaVersion: 1,
      memorySchemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      mode: opts.mode || 'installed',
      platform: opts.platform || process.platform,
      architecture: opts.architecture || process.arch,
      applicationVersion: opts.applicationVersion || '0.0.0',
      vaultPath: opts.vaultPath || '',
      bootstrapCompleted: false,
      lastStartupAt: null,
      lastShutdownAt: null,
      migrationVersion: 0
    };
    atomicWrite(manifest);
    return manifest;
  }

  function update(fields) {
    const current = read();
    if (!current) throw new Error('Cannot update non-existent or corrupted manifest');
    const updated = {
      ...current,
      ...fields,
      updatedAt: new Date().toISOString()
    };
    atomicWrite(updated);
    return updated;
  }

  function validate() {
    const current = read();
    if (!current) {
      return { valid: false, errors: ['Manifest missing or unreadable'], warnings: [] };
    }
    const errors = [];
    const warnings = [];

    if (current.runtimeSchemaVersion !== 1 && current.runtimeSchemaVersion !== 2) {
      errors.push(`Unsupported runtimeSchemaVersion: ${current.runtimeSchemaVersion}`);
    }

    if (!current.installationId) errors.push('Missing installationId');
    if (!current.mode) errors.push('Missing mode');
    if (!current.platform) errors.push('Missing platform');
    if (!current.architecture) errors.push('Missing architecture');
    if (!current.applicationVersion) errors.push('Missing applicationVersion');
    if (!current.vaultPath) errors.push('Missing vaultPath');

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  function detectInstallationState() {
    if (!exists()) {
      if (!fs.existsSync(configDir)) {
        return 'fresh';
      } else {
        const files = fs.readdirSync(configDir);
        if (files.length === 0) return 'fresh';

        // Basic heuristic for legacy
        if (files.includes('config.json') || files.includes('settings.json')) {
          return 'legacy';
        }
        return 'partial';
      }
    }

    const current = read();
    if (!current) {
      return 'corrupted';
    }

    if (current.mode === 'portable') return 'portable';
    if (current.mode === 'development') return 'development';

    const validation = validate();
    if (validation.valid) {
      return 'existing';
    }

    return 'corrupted';
  }

  return {
    exists,
    read,
    create,
    update,
    validate,
    detectInstallationState
  };
}
