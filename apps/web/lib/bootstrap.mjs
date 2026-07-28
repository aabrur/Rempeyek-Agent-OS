import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRuntimeManifest } from './runtime-manifest.mjs';
import { scaffoldVaultStructure } from './vault-project-store.mjs';
import { initializeAIFamilyRegistry } from './ai-family-registry.mjs';
import { createSharedMemoryEngine } from './shared-memory-engine.mjs';
import { createSkillsSyncEngine } from './skills-sync-engine.mjs';
import { createGraphifyUnifiedEngine } from './graphify-unified-engine.mjs';

const DEFAULT_ACCESS_POLICY = {
  schema_version: 1,
  allowed_roots: [],
  denied_roots: [],
  allowed_extensions: [".md", ".txt", ".json", ".yaml", ".yml", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"],
  denied_extensions: [".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".msi", ".com", ".scr"],
  max_file_size: 10485760,
  follow_symlinks: false,
  allow_network_paths: false,
  allow_hidden_files: false,
  require_approval_for: ["execute_process", "network_access", "write_project_files"],
  redaction_patterns: ["password", "secret", "api_key", "token", "seed", "mnemonic", "private_key"],
  agent_overrides: {}
};

export function createBootstrap({ configDir, vaultPath, agentsDir, backupsDir, agents = [] } = {}) {
  if (!configDir || !vaultPath) {
    throw new Error('configDir and vaultPath are required');
  }

  const runtimeRoot = path.dirname(configDir);
  const manifest = createRuntimeManifest(configDir);

  return {
    isBootstrapped() {
      const data = manifest.read();
      return data !== null && data.bootstrapCompleted === true;
    },

    getStatus() {
      const data = manifest.read();
      if (!data) return { bootstrapped: false, state: manifest.detectInstallationState() };
      return {
        bootstrapped: data.bootstrapCompleted === true,
        state: manifest.detectInstallationState(),
        version: data.applicationVersion,
        mode: data.mode,
        vaultPath: data.vaultPath
      };
    },

    run() {
      const result = {
        success: true,
        timestamp: new Date().toISOString(),
        steps: {},
        warnings: [],
        errors: []
      };

      // Step 1: Create runtime directories
      const runtimeDirs = [
        configDir,
        path.join(runtimeRoot, 'Logs'),
        path.join(runtimeRoot, 'Cache'),
        backupsDir || path.join(runtimeRoot, 'Backups'),
        path.join(runtimeRoot, 'Quarantine'),
        path.join(runtimeRoot, 'Temp'),
        path.join(runtimeRoot, 'Runtime'),
        path.join(runtimeRoot, 'Updates'),
        path.join(runtimeRoot, 'Packages'),
        agentsDir || path.join(runtimeRoot, 'Agents')
      ];
      try {
        let anyCreated = false;
        for (const dir of runtimeDirs) {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            anyCreated = true;
          }
        }
        result.steps.runtimeDirs = { status: anyCreated ? 'created' : 'existing', path: runtimeRoot };
      } catch (err) {
        result.steps.runtimeDirs = { status: 'error', error: err.message };
        result.errors.push(`Runtime dirs: ${err.message}`);
      }

      // Step 2: Create or validate runtime manifest
      try {
        if (manifest.exists()) {
          result.steps.manifest = { status: 'existing' };
        } else {
          manifest.create({
            mode: process.env.REMPEYEK_MODE || 'installed',
            platform: process.platform,
            architecture: process.arch,
            applicationVersion: '2.3.0',
            vaultPath
          });
          result.steps.manifest = { status: 'created' };
        }
      } catch (err) {
        result.steps.manifest = { status: 'error', error: err.message };
        result.errors.push(`Manifest: ${err.message}`);
      }

      // Step 3: Scaffold Vault structure
      try {
        const vaultExisted = fs.existsSync(vaultPath);
        scaffoldVaultStructure(vaultPath, { agents });
        result.steps.vault = { status: vaultExisted ? 'existing' : 'scaffolded' };
      } catch (err) {
        result.steps.vault = { status: 'error', error: err.message };
        result.errors.push(`Vault: ${err.message}`);
      }

      // Step 4: Initialize AI Family Registry
      try {
        const registryPath = path.join(vaultPath, 'System', 'AI-Family', 'family-registry.json');
        const registryExisted = fs.existsSync(registryPath);
        const registry = initializeAIFamilyRegistry({ vaultPath, agentsDir: agentsDir || path.join(runtimeRoot, 'Agents'), agents });
        const nodeCount = (registry && registry.nodes) ? registry.nodes.length : 0;
        result.steps.familyRegistry = { status: registryExisted ? 'existing' : 'initialized', nodeCount };
      } catch (err) {
        result.steps.familyRegistry = { status: 'error', error: err.message };
        result.errors.push(`Family registry: ${err.message}`);
      }

      // Step 5: Initialize Shared Memory Engine
      try {
        const memIndexPath = path.join(vaultPath, 'Memory', 'Shared', 'index.json');
        const memExisted = fs.existsSync(memIndexPath);
        createSharedMemoryEngine({ vaultPath, agentsDir: agentsDir || path.join(runtimeRoot, 'Agents') });
        result.steps.sharedMemory = { status: memExisted ? 'existing' : 'initialized' };
      } catch (err) {
        result.steps.sharedMemory = { status: 'error', error: err.message };
        result.errors.push(`Shared memory: ${err.message}`);
      }

      // Step 6: Initialize Graphify
      try {
        const graphIndexPath = path.join(vaultPath, 'Graph', 'Indexes', 'graph-index.json');
        const graphExisted = fs.existsSync(graphIndexPath);
        const graphEngine = createGraphifyUnifiedEngine({ vaultPath });
        graphEngine.initializeGraph();
        result.steps.graphify = { status: graphExisted ? 'existing' : 'initialized' };
      } catch (err) {
        result.steps.graphify = { status: 'error', error: err.message };
        result.errors.push(`Graphify: ${err.message}`);
      }

      // Step 7: Initialize Skills Sync (soft failure if warehouse absent)
      try {
        const home = process.env.USERPROFILE || os.homedir();
        const skillsWarehouse = process.env.REMPEYEK_SKILLS_PATH || path.join(home, '.skills');
        const skillsEngine = createSkillsSyncEngine({
          centralWarehouseDir: skillsWarehouse,
          vaultPath,
          agentsDir: agentsDir || path.join(runtimeRoot, 'Agents')
        });
        if (!fs.existsSync(skillsWarehouse)) {
          result.warnings.push(`Skills warehouse not found at ${skillsWarehouse}. Skills sync will be available when the warehouse is created.`);
          result.steps.skills = { status: 'no-warehouse' };
        } else {
          result.steps.skills = { status: 'initialized' };
        }
      } catch (err) {
        result.warnings.push(`Skills init: ${err.message}`);
        result.steps.skills = { status: 'warning', warning: err.message };
      }

      // Step 8: Write default access policy
      try {
        const policyPath = path.join(configDir, 'access-policy.json');
        if (fs.existsSync(policyPath)) {
          result.steps.accessPolicy = { status: 'existing' };
        } else {
          fs.writeFileSync(policyPath, JSON.stringify(DEFAULT_ACCESS_POLICY, null, 2), 'utf8');
          result.steps.accessPolicy = { status: 'created' };
        }
      } catch (err) {
        result.steps.accessPolicy = { status: 'error', error: err.message };
        result.errors.push(`Access policy: ${err.message}`);
      }

      // Step 9: Mark bootstrap complete in manifest
      try {
        manifest.update({ bootstrapCompleted: true });
      } catch (err) {
        result.errors.push(`Manifest update: ${err.message}`);
      }

      // Step 10: Write bootstrap report
      result.success = result.errors.length === 0;
      try {
        const reportPath = path.join(configDir, 'bootstrap-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');
      } catch {
        // Non-fatal: report is informational
      }

      return result;
    }
  };
}
