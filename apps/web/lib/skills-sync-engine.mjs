import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

function copyDirRecursiveSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function createSkillsSyncEngine({ centralWarehouseDir, vaultPath, agentsDir } = {}) {
  const warehouse = centralWarehouseDir || path.join(process.env.USERPROFILE || os.homedir(), '.skills');

  const skillsVaultDir = path.join(vaultPath, 'Skills');
  const registryDir = path.join(skillsVaultDir, 'Registry');
  const assignmentsDir = path.join(skillsVaultDir, 'Assignments');
  const reportsDir = path.join(skillsVaultDir, 'Reports');

  for (const dir of [registryDir, assignmentsDir, reportsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  function calculateDirectoryChecksum(dirPath) {
    if (!fs.existsSync(dirPath)) return '';
    const hash = crypto.createHash('sha256');
    const items = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      if (item.isSymbolicLink()) continue;
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        hash.update(calculateDirectoryChecksum(fullPath));
      } else if (item.isFile()) {
        hash.update(item.name);
        try {
          hash.update(fs.readFileSync(fullPath));
        } catch {}
      }
    }
    return hash.digest('hex');
  }

  function parseSkillManifest(skillDir) {
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    let name = path.basename(skillDir);
    let description = '';
    let version = '1.0.0';
    let capabilities = ['general'];

    if (fs.existsSync(skillMdPath)) {
      try {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const descMatch = content.match(/^description:\s*(.+)$/m);
        const capMatch = content.match(/^capabilities:\s*\[(.+)\]$/m);

        if (nameMatch) name = nameMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
        if (capMatch) capabilities = capMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
      } catch {}
    }

    return { name, description, version, capabilities, skillMdPath };
  }

  return {
    discoverWarehouseSkills() {
      if (!fs.existsSync(warehouse)) return [];
      const entries = fs.readdirSync(warehouse, { withFileTypes: true });
      const skills = [];

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const skillDir = path.join(warehouse, entry.name);
        const manifest = parseSkillManifest(skillDir);
        const checksum = calculateDirectoryChecksum(skillDir);

        skills.push({
          skill_id: entry.name,
          name: manifest.name,
          version: manifest.version,
          source_path: skillDir,
          checksum,
          manifest_path: manifest.skillMdPath,
          capabilities: manifest.capabilities,
          assigned_nodes: [],
          trust_status: checksum ? 'unreviewed' : 'quarantined',
          validation_status: checksum ? 'valid' : 'invalid',
          last_synced_at: new Date().toISOString()
        });
      }
      return skills;
    },

    syncSkillsToNodes({ nodes = [] } = {}) {
      const warehouseSkills = this.discoverWarehouseSkills();
      const now = new Date().toISOString();
      const registryFile = path.join(registryDir, 'skills-registry.json');

      const assignments = {};

      for (const node of nodes) {
        const nodeId = node.node_id;
        const nodeSkillsDir = path.join(agentsDir, nodeId, 'skills');
        fs.mkdirSync(nodeSkillsDir, { recursive: true });

        const nodeAssignments = [];

        for (const skill of warehouseSkills) {
          if (skill.validation_status !== 'valid') continue;

          // Capability matching logic without unconditional || true
          const nodeCaps = node.capabilities || ['coding', 'research'];
          const matchesCap = skill.capabilities.some(c => c === 'general' || nodeCaps.includes(c) || nodeCaps.includes('all'));

          if (matchesCap) {
            const destDir = path.join(nodeSkillsDir, skill.skill_id);
            if (fs.existsSync(skill.source_path)) {
              copyDirRecursiveSync(skill.source_path, destDir);
            }

            nodeAssignments.push(skill.skill_id);
            if (!skill.assigned_nodes.includes(nodeId)) {
              skill.assigned_nodes.push(nodeId);
            }
          }
        }

        assignments[nodeId] = nodeAssignments;
        fs.writeFileSync(
          path.join(assignmentsDir, `${nodeId}.json`),
          JSON.stringify({ node_id: nodeId, skills: nodeAssignments, synced_at: now }, null, 2),
          'utf8'
        );
      }

      fs.writeFileSync(registryFile, JSON.stringify({ version: 1, updated_at: now, skills: warehouseSkills }, null, 2), 'utf8');

      return { warehouseSkills, assignments };
    },

    getSkillsStatus() {
      const registryFile = path.join(registryDir, 'skills-registry.json');
      if (fs.existsSync(registryFile)) {
        return JSON.parse(fs.readFileSync(registryFile, 'utf8'));
      }
      return { version: 1, updated_at: new Date().toISOString(), skills: [] };
    }
  };
}
