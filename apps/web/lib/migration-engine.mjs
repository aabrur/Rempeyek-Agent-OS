import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createMigrationEngine({ configDir, vaultPath, backupsDir }) {
  const journalPath = path.join(configDir, 'migration-journal.json');
  const lockPath = path.join(configDir, '.migration-lock');
  const defaultMigrationsDir = path.join(__dirname, 'migrations');

  function getMigrationJournal() {
    if (fs.existsSync(journalPath)) {
      try {
        return JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      } catch (e) {
        return { currentVersion: 0, migrations: [] };
      }
    }
    return { currentVersion: 0, migrations: [] };
  }

  function saveJournal(journal) {
    const tmpPath = journalPath + '.tmp';
    fs.mkdirSync(path.dirname(journalPath), { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(journal, null, 2), 'utf8');
    fs.renameSync(tmpPath, journalPath);
  }

  async function getAvailableMigrations(customMigrationsDir = defaultMigrationsDir) {
    if (!fs.existsSync(customMigrationsDir)) return [];

    const files = fs.readdirSync(customMigrationsDir).filter(f => f.endsWith('.mjs'));
    files.sort();

    const migrations = [];
    for (const file of files) {
      const filePath = path.join(customMigrationsDir, file);
      const fileUrl = pathToFileURL(filePath).href;
      const mod = await import(fileUrl);
      if (mod.version !== undefined) {
        migrations.push({
          file,
          path: filePath,
          version: mod.version,
          description: mod.description || '',
          reversible: !!mod.reversible,
          up: mod.up,
          down: mod.down,
          validate: mod.validate,
        });
      }
    }

    return migrations.sort((a, b) => a.version - b.version);
  }

  return {
    getMigrationJournal,

    async status(customMigrationsDir) {
      const journal = getMigrationJournal();
      const allMigrations = await getAvailableMigrations(customMigrationsDir);

      const pendingMigrations = allMigrations.filter(m => m.version > journal.currentVersion);

      return {
        currentVersion: journal.currentVersion,
        availableMigrations: allMigrations.map(m => m.version),
        pendingCount: pendingMigrations.length,
        pendingMigrations: pendingMigrations.map(m => ({ version: m.version, description: m.description }))
      };
    },

    async dryRun(customMigrationsDir) {
      const journal = getMigrationJournal();
      const allMigrations = await getAvailableMigrations(customMigrationsDir);
      const pendingMigrations = allMigrations.filter(m => m.version > journal.currentVersion);

      return {
        wouldRun: pendingMigrations.map(m => ({ version: m.version, description: m.description })),
        wouldUpdateTo: pendingMigrations.length > 0 ? pendingMigrations[pendingMigrations.length - 1].version : journal.currentVersion
      };
    },

    async run(customMigrationsDir) {
      if (fs.existsSync(lockPath)) {
        throw new Error('Migration is locked. Another process may be running.');
      }

      const journal = getMigrationJournal();
      const allMigrations = await getAvailableMigrations(customMigrationsDir);
      const pendingMigrations = allMigrations.filter(m => m.version > journal.currentVersion);

      if (pendingMigrations.length === 0) {
        return { success: true, executed: [] };
      }

      fs.mkdirSync(configDir, { recursive: true });
      try {
        fs.writeFileSync(lockPath, Date.now().toString());
      } catch (e) {
        throw new Error(`Cannot write to configDir: ${e.message}`);
      }

      const results = [];
      let newVersion = journal.currentVersion;

      try {
        for (const migration of pendingMigrations) {
          const startTime = Date.now();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = path.join(backupsDir, `pre-migration-${migration.version}-${timestamp}`);

          try {
            fs.mkdirSync(backupPath, { recursive: true });

            if (fs.existsSync(configDir)) {
              const files = fs.readdirSync(configDir);
              for (const file of files) {
                const fullPath = path.join(configDir, file);
                if (file.endsWith('.json') && file !== '.migration-lock' && fs.statSync(fullPath).isFile()) {
                  fs.copyFileSync(fullPath, path.join(backupPath, file));
                }
              }
            }

            if (migration.up) {
              await migration.up({ configDir, vaultPath });
            }

            if (migration.validate) {
              const valResult = await migration.validate({ configDir, vaultPath });
              if (!valResult.valid) {
                throw new Error(`Validation failed for migration ${migration.version}: ${valResult.errors.join(', ')}`);
              }
            }

            const duration = Date.now() - startTime;
            newVersion = migration.version;

            const entry = {
              version: migration.version,
              description: migration.description,
              status: 'completed',
              executedAt: new Date().toISOString(),
              durationMs: duration,
              error: null
            };

            journal.migrations.push(entry);
            journal.currentVersion = newVersion;
            saveJournal(journal);

            results.push(entry);
          } catch (e) {
            const entry = {
              version: migration.version,
              description: migration.description,
              status: 'failed',
              executedAt: new Date().toISOString(),
              durationMs: Date.now() - startTime,
              error: e.message
            };
            journal.migrations.push(entry);
            saveJournal(journal);
            results.push(entry);
            throw e;
          }
        }
      } finally {
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
        }
      }

      return { success: true, executed: results };
    },

    async rollback(targetVersion, customMigrationsDir) {
      if (fs.existsSync(lockPath)) {
        throw new Error('Migration is locked.');
      }

      const journal = getMigrationJournal();
      if (targetVersion >= journal.currentVersion) {
        return { success: true, executed: [] };
      }

      const allMigrations = await getAvailableMigrations(customMigrationsDir);
      const toRollback = allMigrations
        .filter(m => m.version <= journal.currentVersion && m.version > targetVersion)
        .sort((a, b) => b.version - a.version);

      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(lockPath, Date.now().toString());

      const results = [];
      try {
        for (const migration of toRollback) {
          const startTime = Date.now();
          if (!migration.reversible || !migration.down) {
            throw new Error(`Migration ${migration.version} is not reversible`);
          }

          try {
            await migration.down({ configDir, vaultPath });

            const entry = {
              version: migration.version,
              description: `Rollback: ${migration.description}`,
              status: 'rolled-back',
              executedAt: new Date().toISOString(),
              durationMs: Date.now() - startTime,
              error: null
            };

            journal.migrations.push(entry);
            journal.currentVersion = migration.version - 1;
            saveJournal(journal);
            results.push(entry);
          } catch (e) {
            const entry = {
              version: migration.version,
              description: `Rollback: ${migration.description}`,
              status: 'failed',
              executedAt: new Date().toISOString(),
              durationMs: Date.now() - startTime,
              error: e.message
            };
            journal.migrations.push(entry);
            saveJournal(journal);
            results.push(entry);
            throw e;
          }
        }
      } finally {
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
        }
      }

      return { success: true, executed: results };
    }
  };
}
