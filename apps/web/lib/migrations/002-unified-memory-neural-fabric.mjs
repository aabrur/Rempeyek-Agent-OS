import fs from 'node:fs';
import path from 'node:path';
import { APP_VERSION } from '../version.mjs';

export const version = 2;
export const description = 'Initialize Unified Memory Neural Fabric data structures and registries';
export const reversible = true;

export async function up({ configDir, vaultPath }) {
  if (!configDir || !vaultPath) {
    throw new Error('configDir and vaultPath are required for migration 002');
  }

  const requiredVaultDirs = [
    path.join(vaultPath, 'Memory', 'Shared'),
    path.join(vaultPath, 'Memory', 'Candidates'),
    path.join(vaultPath, 'Sessions', 'Active'),
    path.join(vaultPath, 'Sessions', 'Completed'),
    path.join(vaultPath, 'Sessions', 'Interrupted'),
    path.join(vaultPath, 'Graph', 'Indexes'),
    path.join(vaultPath, 'Graph', 'Reports'),
    path.join(vaultPath, 'System', 'AI-Family'),
    path.join(vaultPath, 'System', 'Skills-Warehouse'),
    path.join(vaultPath, '.graphify')
  ];

  for (const dir of requiredVaultDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Initialize Memory Shared index if missing
  const sharedIndexFile = path.join(vaultPath, 'Memory', 'Shared', 'index.json');
  if (!fs.existsSync(sharedIndexFile)) {
    fs.writeFileSync(sharedIndexFile, JSON.stringify({ schema_version: 1, memories: [], updated_at: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Initialize Graphify index if missing
  const graphIndexFile = path.join(vaultPath, 'Graph', 'Indexes', 'graph-index.json');
  if (!fs.existsSync(graphIndexFile)) {
    fs.writeFileSync(graphIndexFile, JSON.stringify({ updated_at: new Date().toISOString(), node_count: 0, edge_count: 0 }, null, 2), 'utf8');
  }

  // Update runtime manifest version if present
  const manifestPath = path.join(configDir, 'runtime-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.applicationVersion = APP_VERSION;
      manifest.runtimeSchemaVersion = 2;
      manifest.memorySchemaVersion = 2;
      manifest.graphSchemaVersion = 2;
      manifest.updatedAt = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch {}
  }

  return { success: true, version: 2, description };
}

export async function down({ configDir, vaultPath }) {
  // Reversible rollback removes generated index metadata files only, NEVER user notes or .obsidian
  const indexFiles = [
    path.join(vaultPath, 'Graph', 'Indexes', 'graph-index.json')
  ];

  for (const f of indexFiles) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  }

  const manifestPath = path.join(configDir, 'runtime-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.applicationVersion = '2.2.3';
      manifest.runtimeSchemaVersion = 1;
      manifest.memorySchemaVersion = 1;
      manifest.graphSchemaVersion = 1;
      manifest.updatedAt = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch {}
  }

  return { success: true, rolledBackTo: 1 };
}

export async function validate({ configDir, vaultPath }) {
  const errors = [];
  if (!fs.existsSync(vaultPath)) {
    errors.push(`Vault path does not exist: ${vaultPath}`);
  }
  const sharedDir = path.join(vaultPath, 'Memory', 'Shared');
  if (!fs.existsSync(sharedDir)) {
    errors.push(`Shared memory directory missing: ${sharedDir}`);
  }
  return { valid: errors.length === 0, errors };
}
