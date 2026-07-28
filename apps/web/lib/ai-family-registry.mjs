import fs from 'node:fs';
import path from 'node:path';

export function initializeAIFamilyRegistry({ vaultPath, agentsDir, agents = [] } = {}) {
  if (!vaultPath || !agentsDir) {
    throw new TypeError('vaultPath and agentsDir are required');
  }

  const aiFamilyVaultDir = path.join(vaultPath, 'System', 'AI-Family');
  fs.mkdirSync(aiFamilyVaultDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  const registryFile = path.join(aiFamilyVaultDir, 'family-registry.json');
  const markdownFile = path.join(aiFamilyVaultDir, 'AI-Family.md');

  let existingRegistry = { nodes: [], version: 1 };
  if (fs.existsSync(registryFile)) {
    try {
      existingRegistry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    } catch {}
  }

  const nodeMap = new Map();
  let maxNodeNum = 0;

  for (const node of existingRegistry.nodes || []) {
    if (node.node_id && node.agent_id) {
      nodeMap.set(node.agent_id, node);
      const match = node.node_id.match(/^Node-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNodeNum) maxNodeNum = num;
      }
    }
  }

  const now = new Date().toISOString();
  const updatedNodes = [];

  for (const agent of agents) {
    const agentId = agent.id || agent.agent_id;
    if (!agentId) continue;

    let node = nodeMap.get(agentId);
    if (!node) {
      maxNodeNum++;
      const nodeId = `Node-${maxNodeNum}`;
      node = {
        node_id: nodeId,
        agent_id: agentId,
        display_name: agent.name || agent.display_name || agentId,
        provider: agent.provider || (agentId.includes('claude') ? 'claude' : agentId.includes('gy') || agentId.includes('antigravity') ? 'antigravity' : 'other'),
        role: agent.role || 'operational agent',
        capabilities: agent.capabilities || ['coding', 'research'],
        status: 'active',
        created_at: now,
        last_seen_at: now,
        skills_manifest: `Agents/${nodeId}/skills/skills-manifest.json`,
        memory_scope: ['shared', 'project', 'private'],
        trust_level: 'standard',
        schema_version: 1
      };
      nodeMap.set(agentId, node);
    } else {
      node.last_seen_at = now;
      node.status = 'active';
      if (agent.name) node.display_name = agent.name;
      if (agent.role) node.role = agent.role;
    }
    updatedNodes.push(node);

    // Create Agent Node Dir Structure
    const nodeDir = path.join(agentsDir, node.node_id);
    const subDirs = ['skills', 'memory', 'cache', 'sessions', 'logs', 'checkpoints'];
    for (const sub of subDirs) {
      fs.mkdirSync(path.join(nodeDir, sub), { recursive: true });
    }

    fs.writeFileSync(path.join(nodeDir, 'identity.json'), JSON.stringify(node, null, 2), 'utf8');

    const configPath = path.join(nodeDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({
        agent_id: agentId,
        node_id: node.node_id,
        auto_sync_skills: true,
        memory_promotions_enabled: true
      }, null, 2), 'utf8');
    }
  }

  // Preserve nodes that were not in the current input list but exist in registry
  for (const [agentId, node] of nodeMap.entries()) {
    if (!updatedNodes.some(n => n.node_id === node.node_id)) {
      updatedNodes.push(node);
    }
  }

  updatedNodes.sort((a, b) => {
    const numA = parseInt(a.node_id.replace('Node-', ''), 10) || 0;
    const numB = parseInt(b.node_id.replace('Node-', ''), 10) || 0;
    return numA - numB;
  });

  const finalRegistry = {
    schema_version: 1,
    updated_at: now,
    node_count: updatedNodes.length,
    nodes: updatedNodes
  };

  fs.writeFileSync(registryFile, JSON.stringify(finalRegistry, null, 2), 'utf8');

  // Build Markdown summary
  let md = `# Rempeyek Agent OS AI Family System\n\nLast Synchronized: \`${now}\`\nTotal Nodes: **${updatedNodes.length}**\n\n`;
  md += `| Node ID | Agent Name | Provider | Role | Status | Created At |\n`;
  md += `|---|---|---|---|---|---|\n`;
  for (const n of updatedNodes) {
    md += `| **${n.node_id}** | ${n.display_name} | \`${n.provider}\` | ${n.role} | \`${n.status}\` | ${n.created_at.split('T')[0]} |\n`;
  }
  md += `\n---\n*Shared Runtime Body: \`Rempeyek-Agent-OS\` | Shared Vault: \`Vault\`*\n`;

  fs.writeFileSync(markdownFile, md, 'utf8');

  return finalRegistry;
}
