import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getVaultHealth, scaffoldVaultStructure } from './vault-project-store.mjs';
import { getDefaultSystemPaths } from './access-policy-engine.mjs';
import { initializeAIFamilyRegistry } from './ai-family-registry.mjs';
import { createSharedMemoryEngine } from './shared-memory-engine.mjs';
import { createSkillsSyncEngine } from './skills-sync-engine.mjs';
import { createGraphifyUnifiedEngine } from './graphify-unified-engine.mjs';

export function createUnifiedCommandRouter({ env = process.env, agents = [], platform = process.platform } = {}) {
  const paths = getDefaultSystemPaths(env, platform);
  const vaultPath = paths.sharedVault;
  const agentsDir = paths.agentsRuntimeState;

  // Initialize Core Engines
  scaffoldVaultStructure(vaultPath, { agents });
  const familyRegistry = initializeAIFamilyRegistry({ vaultPath, agentsDir, agents });
  const sharedMemory = createSharedMemoryEngine({ vaultPath, agentsDir });
  const skillsEngine = createSkillsSyncEngine({ centralWarehouseDir: paths.centralSkillsWarehouse, vaultPath, agentsDir });
  const graphifyEngine = createGraphifyUnifiedEngine({ vaultPath });
  graphifyEngine.initializeGraph();

  return {
    async executeCommand(request) {
      const { command, operation = 'status', arguments: args = {}, nodeId = 'Node-1' } = request || {};
      const requestedAt = new Date().toISOString();

      try {
        let result = {};

        switch (command) {
          case '/obsidian': {
            const health = getVaultHealth(vaultPath);
            result = {
              vault_path: vaultPath,
              health,
              message: 'Canonical Vault initialized and healthy.'
            };
            break;
          }

          case '/obsidian-vault': {
            if (operation === 'init' || operation === 'repair') {
              scaffoldVaultStructure(vaultPath, { agents });
              result = { status: 'repaired', vault_path: vaultPath, health: getVaultHealth(vaultPath) };
            } else if (operation === 'register-project') {
              const { projectId, name, sourcePath } = args;
              result = graphifyEngine.registerProject({ projectId: projectId || 'default', name: name || projectId, sourcePath: sourcePath || paths.runtimeRoot });
            } else {
              result = { status: 'healthy', vault_path: vaultPath, health: getVaultHealth(vaultPath) };
            }
            break;
          }

          case '/shared-memory': {
            if (operation === 'read') {
              result = { handoffs: sharedMemory.getRecentHandoffs(args.limit || 5) };
            } else if (operation === 'promote') {
              result = sharedMemory.promoteMemory({
                title: args.title || 'Promoted Lesson',
                type: args.type || 'lesson',
                content: args.content || '',
                createdBy: nodeId,
                projectId: args.projectId || 'default'
              });
            } else {
              result = { status: 'active', vault_path: vaultPath };
            }
            break;
          }

          case '/graphify': {
            if (operation === 'scan' || operation === 'project') {
              const projId = args.projectId || 'rempeyek-agent-os';
              graphifyEngine.registerProject({ projectId: projId, name: 'Rempeyek Agent OS', sourcePath: args.path || paths.runtimeRoot });
              result = graphifyEngine.scanProject(projId);
            } else {
              result = { status: 'active', stats: graphifyEngine.getGraphStats() };
            }
            break;
          }

          case '/skills': {
            if (operation === 'sync') {
              result = skillsEngine.syncSkillsToNodes({ nodes: familyRegistry.nodes });
            } else if (operation === 'discover') {
              result = { skills: skillsEngine.discoverWarehouseSkills() };
            } else if (operation === 'validate') {
              const skills = skillsEngine.discoverWarehouseSkills();
              const issues = [];
              for (const skill of skills) {
                if (!skill.manifest) issues.push({ skill: skill.name, issue: 'missing manifest' });
              }
              result = { valid: issues.length === 0, issues, total: skills.length };
            } else {
              result = skillsEngine.getSkillsStatus();
            }
            break;
          }

          case '/agents': {
            const registryPath = path.join(vaultPath, 'System', 'AI-Family', 'family-registry.json');
            const readRegistry = () => {
              try {
                return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
              } catch {
                return { nodes: [], schema_version: 1 };
              }
            };
            const writeRegistry = (data) => {
              fs.mkdirSync(path.dirname(registryPath), { recursive: true });
              const tmpPath = registryPath + '.tmp';
              fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
              fs.renameSync(tmpPath, registryPath);
            };

            if (operation === 'status' || operation === 'list') {
              const registry = readRegistry();
              result = { nodes: registry.nodes || [], total: (registry.nodes || []).length };
            } else if (operation === 'discover') {
              const home = env.USERPROFILE || os.homedir();
              const knownAgentDirs = [
                { dir: '.claude', provider: 'claude', name: 'Claude Code' },
                { dir: '.commandcode', provider: 'command-code', name: 'Command Code' },
                { dir: '.gemini', provider: 'gemini', name: 'Antigravity / Gemini' },
                { dir: '.cursor', provider: 'cursor', name: 'Cursor' },
                { dir: '.continue', provider: 'continue', name: 'Continue' },
                { dir: '.codeium', provider: 'codeium', name: 'Codeium' }
              ];
              const discovered = [];
              for (const agent of knownAgentDirs) {
                const agentPath = path.join(home, agent.dir);
                if (fs.existsSync(agentPath)) {
                  discovered.push({ ...agent, path: agentPath, exists: true });
                }
              }
              result = { discovered, total: discovered.length };
            } else if (operation === 'register') {
              const { agentId, name, provider, role, capabilities } = args;
              if (!agentId) throw new Error('agentId is required for register operation');
              const registry = readRegistry();
              const nodeNum = (registry.nodes || []).length + 1;
              const newNode = {
                node_id: `Node-${nodeNum}`,
                agent_id: agentId,
                display_name: name || agentId,
                provider: provider || 'other',
                role: role || 'assistant',
                capabilities: capabilities || [],
                status: 'active',
                created_at: new Date().toISOString(),
                schema_version: 1
              };
              registry.nodes = registry.nodes || [];
              registry.nodes.push(newNode);
              writeRegistry(registry);
              result = { registered: newNode };
            } else if (operation === 'inspect') {
              const targetNodeId = args.nodeId || nodeId;
              const registry = readRegistry();
              const node = (registry.nodes || []).find(n => n.node_id === targetNodeId);
              if (!node) throw new Error(`Node not found: ${targetNodeId}`);
              // Try to read node identity file
              let identity = null;
              try {
                const identityPath = path.join(agentsDir, targetNodeId, 'identity.json');
                identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
              } catch { /* no identity file */ }
              result = { node, identity };
            } else if (operation === 'enable' || operation === 'disable') {
              const targetNodeId = args.nodeId || nodeId;
              const registry = readRegistry();
              const node = (registry.nodes || []).find(n => n.node_id === targetNodeId);
              if (!node) throw new Error(`Node not found: ${targetNodeId}`);
              node.status = operation === 'enable' ? 'active' : 'inactive';
              node.updated_at = new Date().toISOString();
              writeRegistry(registry);
              result = { node_id: targetNodeId, status: node.status };
            } else if (operation === 'health') {
              const registry = readRegistry();
              const health = [];
              for (const node of (registry.nodes || [])) {
                const nodeDir = path.join(agentsDir, node.node_id);
                const hasIdentity = fs.existsSync(path.join(nodeDir, 'identity.json'));
                const hasSkills = fs.existsSync(path.join(nodeDir, 'Skills'));
                let sessionCount = 0;
                try {
                  const sessDir = path.join(vaultPath, 'Sessions', 'Active');
                  if (fs.existsSync(sessDir)) {
                    sessionCount = fs.readdirSync(sessDir).filter(f => f.includes(node.node_id)).length;
                  }
                } catch { /* no sessions */ }
                health.push({
                  node_id: node.node_id,
                  status: node.status,
                  identity: hasIdentity ? 'ok' : 'missing',
                  skills: hasSkills ? 'synced' : 'not-synced',
                  activeSessions: sessionCount
                });
              }
              result = { nodes: health, total: health.length };
            } else {
              throw new Error(`Unknown /agents operation: ${operation}`);
            }
            break;
          }

          case '/rempeyek-status': {
            // Gather comprehensive system status
            const configDir = paths.systemConfig;
            const status = {
              application: { version: '2.3.0', mode: 'installed' },
              runtime: { status: 'healthy', path: paths.runtimeRoot },
              vault: { status: 'unknown', path: vaultPath },
              agents: { total: 0, active: 0, nodes: [] },
              skills: { total: 0, synced: false },
              memory: { shared: 0, handoffs: 0 },
              graphify: { nodes: 0, edges: 0 },
              projects: { registered: 0 },
              security: { policyActive: false }
            };

            // Runtime manifest
            try {
              const manifestPath = path.join(configDir, 'runtime-manifest.json');
              if (fs.existsSync(manifestPath)) {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                status.application.version = manifest.applicationVersion || '2.3.0';
                status.application.mode = manifest.mode || 'installed';
                status.runtime.status = manifest.bootstrapCompleted ? 'healthy' : 'uninitialized';
              } else {
                status.runtime.status = 'uninitialized';
              }
            } catch { status.runtime.status = 'degraded'; }

            // Vault health
            try {
              const vHealth = getVaultHealth(vaultPath);
              status.vault.status = vHealth.exists ? 'healthy' : 'missing';
              status.vault.noteCount = vHealth.noteCount || 0;
            } catch { status.vault.status = 'error'; }

            // Agents
            try {
              const registryPath = path.join(vaultPath, 'System', 'AI-Family', 'family-registry.json');
              if (fs.existsSync(registryPath)) {
                const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
                const nodes = registry.nodes || [];
                status.agents.total = nodes.length;
                status.agents.active = nodes.filter(n => n.status === 'active').length;
                status.agents.nodes = nodes.map(n => ({ id: n.node_id, name: n.display_name, status: n.status }));
              }
            } catch { /* no registry */ }

            // Skills
            try {
              const skillsStatus = skillsEngine.getSkillsStatus();
              status.skills.total = skillsStatus.totalSkills || 0;
              status.skills.synced = skillsStatus.synced || false;
            } catch { /* skills error */ }

            // Memory
            try {
              const handoffs = sharedMemory.getRecentHandoffs(100);
              status.memory.handoffs = Array.isArray(handoffs) ? handoffs.length : 0;
              const memIndexPath = path.join(vaultPath, 'Memory', 'Shared', 'index.json');
              if (fs.existsSync(memIndexPath)) {
                const memIndex = JSON.parse(fs.readFileSync(memIndexPath, 'utf8'));
                status.memory.shared = Array.isArray(memIndex.memories) ? memIndex.memories.length : 0;
              }
            } catch { /* memory error */ }

            // Graphify
            try {
              const gStats = graphifyEngine.getGraphStats();
              status.graphify.nodes = gStats.nodeCount || 0;
              status.graphify.edges = gStats.edgeCount || 0;
            } catch { /* graphify error */ }

            // Projects
            try {
              const projRegistryPath = path.join(vaultPath, 'Graph', 'Indexes', 'project-registry.json');
              if (fs.existsSync(projRegistryPath)) {
                const projRegistry = JSON.parse(fs.readFileSync(projRegistryPath, 'utf8'));
                status.projects.registered = Object.keys(projRegistry.projects || {}).length;
              }
            } catch { /* projects error */ }

            // Security policy
            try {
              const policyPath = path.join(configDir, 'access-policy.json');
              status.security.policyActive = fs.existsSync(policyPath);
            } catch { /* policy error */ }

            result = status;
            break;
          }

          default:
            throw new Error(`Unknown command: ${command}`);
        }

        return {
          success: true,
          command,
          operation,
          result,
          warnings: [],
          evidence: [`Executed against Vault: ${vaultPath}`],
          completedAt: new Date().toISOString()
        };
      } catch (error) {
        return {
          success: false,
          command,
          operation,
          error: error.message,
          completedAt: new Date().toISOString()
        };
      }
    }
  };
}
