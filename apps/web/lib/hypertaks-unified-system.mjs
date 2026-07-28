import fs from 'node:fs';
import path from 'node:path';
import { getDefaultSystemPaths, isPathAllowed } from './access-policy-engine.mjs';
import { scaffoldVaultStructure, getVaultHealth } from './vault-project-store.mjs';
import { initializeAIFamilyRegistry } from './ai-family-registry.mjs';
import { createSharedMemoryEngine } from './shared-memory-engine.mjs';
import { createSkillsSyncEngine } from './skills-sync-engine.mjs';
import { createGraphifyUnifiedEngine } from './graphify-unified-engine.mjs';
import { createUnifiedCommandRouter } from './unified-command-router.mjs';

export function initializeHypertaksUnifiedSystem({ env = process.env, agents = [] } = {}) {
  const paths = getDefaultSystemPaths(env);

  // Ensure Root Directories Exist
  const requiredDirs = [
    paths.runtimeRoot,
    paths.sharedVault,
    paths.agentsRuntimeState,
    paths.sharedGraphifyData,
    paths.systemConfig,
    paths.logsDir,
    paths.quarantineDir
  ];

  for (const dir of requiredDirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create System Configuration Files
  const accessPolicyFile = path.join(paths.systemConfig, 'access-policy.json');
  if (!fs.existsSync(accessPolicyFile)) {
    const accessPolicyData = {
      allowed_roots: [paths.runtimeRoot, paths.home],
      denied_roots: [
        path.join(paths.home, '.ssh'),
        path.join(paths.home, '.gnupg'),
        path.join(paths.home, 'AppData', 'Roaming', 'Microsoft', 'Credentials'),
        path.join(paths.home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
        path.join(paths.home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data')
      ],
      allowed_extensions: ['.md', '.txt', '.json', '.yaml', '.yml', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py'],
      denied_extensions: ['.pem', '.key', '.env', '.dat'],
      max_file_size: 10485760, // 10MB
      require_approval_for: ['delete', 'elevate_permissions']
    };
    fs.writeFileSync(accessPolicyFile, JSON.stringify(accessPolicyData, null, 2), 'utf8');
  }

  const runtimeConfigFile = path.join(paths.systemConfig, 'runtime.json');
  if (!fs.existsSync(runtimeConfigFile)) {
    fs.writeFileSync(runtimeConfigFile, JSON.stringify({
      system_name: 'Rempeyek Agent OS',
      version: '2.2.3',
      unified_system_enabled: true,
      vault_path: paths.sharedVault,
      skills_warehouse: paths.centralSkillsWarehouse,
      initialized_at: new Date().toISOString()
    }, null, 2), 'utf8');
  }

  // Scaffold Vault Folders
  const vaultSubDirs = [
    '00-Inbox', '01-Daily', '02-Projects', '03-Areas', '04-Resources', '05-Archives',
    'Agents', 'Memory/Shared', 'Memory/Decisions', 'Memory/Lessons', 'Memory/Preferences',
    'Memory/Entities', 'Memory/Procedures', 'Memory/Handoffs',
    'Graph/Nodes', 'Graph/Edges', 'Graph/Indexes', 'Graph/Reports',
    'Sessions/Active', 'Sessions/Completed', 'Sessions/Failed',
    'Skills/Registry', 'Skills/Assignments', 'Skills/Reports',
    'System/AI-Family', 'System/Commands', 'System/Schemas', 'System/Policies', 'System/Migrations',
    'Attachments', 'Imports', 'Quarantine', '.graphify', '.obsidian'
  ];

  for (const subDir of vaultSubDirs) {
    fs.mkdirSync(path.join(paths.sharedVault, subDir), { recursive: true });
  }

  // Create Schema Files
  const schemasDir = path.join(paths.sharedVault, 'System', 'Schemas');
  const sessionSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'SessionRecord',
    type: 'object',
    required: ['session_id', 'node_id', 'agent_id', 'task_id', 'started_at', 'status']
  };
  fs.writeFileSync(path.join(schemasDir, 'session.schema.json'), JSON.stringify(sessionSchema, null, 2), 'utf8');

  // Initialize Engines
  scaffoldVaultStructure(paths.sharedVault, { agents });
  const aiFamilyRegistry = initializeAIFamilyRegistry({ vaultPath: paths.sharedVault, agentsDir: paths.agentsRuntimeState, agents });
  const sharedMemory = createSharedMemoryEngine({ vaultPath: paths.sharedVault, agentsDir: paths.agentsRuntimeState });
  const skillsEngine = createSkillsSyncEngine({ centralWarehouseDir: paths.centralSkillsWarehouse, vaultPath: paths.sharedVault, agentsDir: paths.agentsRuntimeState });
  const graphifyEngine = createGraphifyUnifiedEngine({ vaultPath: paths.sharedVault });
  graphifyEngine.initializeGraph();

  // Auto Sync Skills to Nodes on Startup
  skillsEngine.syncSkillsToNodes({ nodes: aiFamilyRegistry.nodes });

  const commandRouter = createUnifiedCommandRouter({ env, agents });

  return {
    paths,
    aiFamilyRegistry,
    sharedMemory,
    skillsEngine,
    graphifyEngine,
    commandRouter,
    getVaultHealth() {
      return getVaultHealth(paths.sharedVault);
    },
    executeCommand(req) {
      return commandRouter.executeCommand(req);
    }
  };
}
