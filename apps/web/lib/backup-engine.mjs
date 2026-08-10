import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CONFIG_FILES = [
  'runtime-manifest.json',
  'family-registry.json',
  'project-registry.json',
  'skills-registry.json',
  'migration-journal.json',
  'access-policy.json'
];

const VAULT_FILES = [
  'Memory/Shared/index.json',
  'Graph/Indexes/graph-index.json'
];

function computeChecksum(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function copyFileSafe(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

export function createBackupEngine(opts = {}) {
  const stateRoot = opts.services?.stateRoot || opts.stateRoot || process.cwd();
  const configDir = opts.configDir || opts.services?.configDir || path.dirname(opts.services?.configPath || path.join(stateRoot, "agents.config.json"));
  const vaultPath = opts.vaultPath || opts.services?.vaultPath || path.join(stateRoot, "Vault");
  const backupsDir = opts.backupsDir || opts.services?.backupsDir || path.join(stateRoot, "Backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const getBackupPath = (backupId) => path.join(backupsDir, backupId);
  const getManifestPath = (backupId) => path.join(getBackupPath(backupId), 'backup-manifest.json');

  return {
    createBackup({ label = 'backup' } = {}) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = `${timestamp}-${label}`;
      const backupDir = getBackupPath(backupId);

      fs.mkdirSync(backupDir, { recursive: true });

      const files = [];

      const backupFile = (baseDir, relativePath, type) => {
        if (!baseDir) return;
        const src = path.join(baseDir, relativePath);
        if (fs.existsSync(src)) {
          const checksum = computeChecksum(src);
          // Store relative to backupDir as type/relativePath to avoid collisions
          const destRelPath = path.join(type, relativePath);
          const dest = path.join(backupDir, destRelPath);
          copyFileSafe(src, dest);
          files.push({
            type,
            originalPath: src,
            relativePath: destRelPath,
            checksum,
            size: fs.statSync(src).size
          });
        }
      };

      for (const file of CONFIG_FILES) {
        backupFile(configDir, file, 'config');
      }
      for (const file of VAULT_FILES) {
        backupFile(vaultPath, file, 'vault');
      }

      const manifest = {
        metadataVersion: 1,
        backupId,
        createdAt: new Date().toISOString(),
        label,
        applicationVersion: process.env.APP_VERSION || '1.0.0',
        files
      };

      const manifestPath = getManifestPath(backupId);
      const tmpPath = manifestPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), 'utf-8');
      fs.renameSync(tmpPath, manifestPath);

      return manifest;
    },

    listBackups() {
      if (!fs.existsSync(backupsDir)) return [];
      const entries = fs.readdirSync(backupsDir, { withFileTypes: true });
      const backups = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(backupsDir, entry.name, 'backup-manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
              backups.push(manifest);
            } catch (err) {
              // Ignore corrupted manifests
            }
          }
        }
      }

      return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    verifyBackup(backupId) {
      const manifestPath = getManifestPath(backupId);
      if (!fs.existsSync(manifestPath)) {
        return { valid: false, error: 'Manifest not found' };
      }

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.files)) {
          return { valid: false, error: 'Invalid manifest structure' };
        }

        const backupDir = getBackupPath(backupId);

        for (const file of manifest.files) {
          if (!file.checksum) {
            return { valid: false, error: `Missing checksum for file: ${file.relativePath}` };
          }
          const backupFilePath = path.join(backupDir, file.relativePath);
          if (!fs.existsSync(backupFilePath)) {
            return { valid: false, error: `Missing file: ${file.relativePath}` };
          }
          const actualChecksum = computeChecksum(backupFilePath);
          if (actualChecksum !== file.checksum) {
            return { valid: false, error: `Checksum mismatch for: ${file.relativePath}` };
          }
        }

        return { valid: true };
      } catch (err) {
        return { valid: false, error: `Failed to parse manifest: ${err.message}` };
      }
    },

    restorePreview(backupId) {
      const verifyResult = this.verifyBackup(backupId);
      if (!verifyResult.valid) {
        throw new Error(`Cannot preview invalid backup: ${verifyResult.error}`);
      }

      const manifest = JSON.parse(fs.readFileSync(getManifestPath(backupId), 'utf-8'));
      const preview = [];

      for (const file of manifest.files) {
        let currentChecksum = null;
        if (fs.existsSync(file.originalPath)) {
          currentChecksum = computeChecksum(file.originalPath);
        }

        let action = 'create';
        if (currentChecksum) {
          action = currentChecksum === file.checksum ? 'skip' : 'overwrite';
        }

        preview.push({
          target: file.originalPath,
          action,
          backupChecksum: file.checksum,
          currentChecksum
        });
      }

      return preview;
    },

    restore(backupId) {
      const verifyResult = this.verifyBackup(backupId);
      if (!verifyResult.valid) {
        throw new Error(`Cannot restore invalid backup: ${verifyResult.error}`);
      }

      const manifest = JSON.parse(fs.readFileSync(getManifestPath(backupId), 'utf-8'));
      const backupDir = getBackupPath(backupId);

      const stagedFiles = [];
      try {
        // Stage 1: Copy to temporary restoration targets and verify checksums
        for (const file of manifest.files) {
          const backupFilePath = path.join(backupDir, file.relativePath);
          const tmpTarget = file.originalPath + '.restore.tmp';
          copyFileSafe(backupFilePath, tmpTarget);

          const stagedChecksum = computeChecksum(tmpTarget);
          if (stagedChecksum !== file.checksum) {
            throw new Error(`Checksum verification failed during staging for ${file.relativePath}`);
          }
          stagedFiles.push({ tmpTarget, originalPath: file.originalPath });
        }

        // Stage 2: Commit staged files atomically
        for (const item of stagedFiles) {
          fs.mkdirSync(path.dirname(item.originalPath), { recursive: true });
          fs.renameSync(item.tmpTarget, item.originalPath);
        }

        return { success: true, restoredFiles: manifest.files.length };
      } catch (err) {
        // Rollback staged temp files on error
        for (const item of stagedFiles) {
          if (fs.existsSync(item.tmpTarget)) {
            try { fs.unlinkSync(item.tmpTarget); } catch {}
          }
        }
        throw new Error(`Atomic restore failed: ${err.message}`);
      }
    },

    getBackupSize(backupId) {
      const manifestPath = getManifestPath(backupId);
      if (!fs.existsSync(manifestPath)) return 0;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        let totalSize = fs.statSync(manifestPath).size;
        for (const file of manifest.files) {
          totalSize += file.size;
        }
        return totalSize;
      } catch (err) {
        return 0;
      }
    }
  };
}
