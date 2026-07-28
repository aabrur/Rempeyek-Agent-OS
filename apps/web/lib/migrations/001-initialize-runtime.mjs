import fs from 'node:fs';
import path from 'node:path';

export const version = 1;
export const description = 'Initialize runtime directories';
export const reversible = true;

const dirs = [
  'Config', 'Logs', 'Cache', 'Backups', 'Quarantine', 'Temp', 'Runtime', 'Updates', 'Packages'
];

export async function up({ configDir, vaultPath }) {
  const created = [];
  for (const d of dirs) {
    const dirPath = path.join(vaultPath, d);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      created.push(dirPath);
    }
  }
  return { created };
}

export async function down({ configDir, vaultPath }) {
  const removed = [];
  for (const d of dirs) {
    const dirPath = path.join(vaultPath, d);
    if (fs.existsSync(dirPath)) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        removed.push(dirPath);
      } catch (e) {
        // ignore
      }
    }
  }
  return { removed };
}

export async function validate({ configDir, vaultPath }) {
  const errors = [];
  for (const d of dirs) {
    const dirPath = path.join(vaultPath, d);
    if (!fs.existsSync(dirPath)) {
      errors.push(`Directory ${d} missing`);
    }
  }
  return { valid: errors.length === 0, errors };
}
