import fs from 'node:fs';
import path from 'node:path';
import { APP_VERSION } from '../version.mjs';

export const version = 3;
export const description = 'Initialize Work Continuity & Social Publishing data structures and registries';
export const reversible = true;

export async function up({ configDir, vaultPath }) {
  if (!configDir || !vaultPath) {
    throw new Error('configDir and vaultPath are required for migration 003');
  }

  const requiredVaultDirs = [
    path.join(vaultPath, 'Work', 'Missions'),
    path.join(vaultPath, 'Work', 'Contracts'),
    path.join(vaultPath, 'Work', 'Runs'),
    path.join(vaultPath, 'Work', 'Evidence'),
    path.join(vaultPath, 'Work', 'Verifications'),
    path.join(vaultPath, 'Work', 'Handoffs'),
    path.join(vaultPath, 'Social', 'Campaigns'),
    path.join(vaultPath, 'Social', 'Variants'),
    path.join(vaultPath, 'Social', 'Jobs'),
    path.join(vaultPath, 'Social', 'Receipts'),
    path.join(vaultPath, 'Social', 'Analytics'),
    path.join(vaultPath, 'Social', 'Connectors'),
  ];

  for (const dir of requiredVaultDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Initialize connectors registry if missing
  const connectorRegistryFile = path.join(vaultPath, 'Social', 'Connectors', 'registry.json');
  if (!fs.existsSync(connectorRegistryFile)) {
    const defaultConnectors = [
      {
        connectorId: 'con-twitter-default',
        providerId: 'direct-api',
        platform: 'twitter',
        accountName: 'X / Twitter Default',
        status: 'UNCONFIGURED',
        capabilities: ['social.content.generate', 'social.publish.execute', 'social.analytics.read'],
        isManualSetupRequired: true,
      },
      {
        connectorId: 'con-linkedin-default',
        providerId: 'direct-api',
        platform: 'linkedin',
        accountName: 'LinkedIn Default',
        status: 'UNCONFIGURED',
        capabilities: ['social.content.generate', 'social.publish.execute', 'social.analytics.read'],
        isManualSetupRequired: true,
      },
      {
        connectorId: 'con-sandbox-default',
        providerId: 'sandbox-provider',
        platform: 'twitter',
        accountName: 'Sandbox Mock Engine',
        status: 'CONNECTED',
        capabilities: ['social.content.generate', 'social.publish.execute', 'social.analytics.read'],
        isManualSetupRequired: false,
      },
    ];
    fs.writeFileSync(connectorRegistryFile, JSON.stringify({ schema_version: 1, connectors: defaultConnectors, updated_at: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Update runtime manifest version if present
  const manifestPath = path.join(configDir, 'runtime-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.applicationVersion = APP_VERSION;
      manifest.runtimeSchemaVersion = 3;
      manifest.workSchemaVersion = 1;
      manifest.publishingSchemaVersion = 1;
      manifest.updatedAt = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch {}
  }

  return { success: true, version: 3, description };
}

export async function down({ configDir, vaultPath }) {
  // Reversible rollback removes generated index metadata files only, NEVER user notes
  const generatedFiles = [
    path.join(vaultPath, 'Social', 'Connectors', 'registry.json'),
  ];

  for (const f of generatedFiles) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  }

  const manifestPath = path.join(configDir, 'runtime-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.runtimeSchemaVersion = 2;
      delete manifest.workSchemaVersion;
      delete manifest.publishingSchemaVersion;
      manifest.updatedAt = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch {}
  }

  return { success: true, rolledBackTo: 2 };
}

export async function validate({ configDir, vaultPath }) {
  const errors = [];
  if (!fs.existsSync(vaultPath)) {
    errors.push(`Vault path does not exist: ${vaultPath}`);
  }
  const workDir = path.join(vaultPath, 'Work', 'Missions');
  if (!fs.existsSync(workDir)) {
    errors.push(`Work missions directory missing: ${workDir}`);
  }
  const socialDir = path.join(vaultPath, 'Social', 'Campaigns');
  if (!fs.existsSync(socialDir)) {
    errors.push(`Social campaigns directory missing: ${socialDir}`);
  }
  return { valid: errors.length === 0, errors };
}
