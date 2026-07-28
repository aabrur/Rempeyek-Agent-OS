import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isPathAllowed, isSymlinkSafe } from './access-policy-engine.mjs';

export function createGraphifyUnifiedEngine({ vaultPath } = {}) {
  if (!vaultPath) throw new TypeError('vaultPath is required');

  const graphifyVaultData = path.join(vaultPath, '.graphify');
  const graphReportsDir = path.join(vaultPath, 'Graph', 'Reports');
  const graphIndexesDir = path.join(vaultPath, 'Graph', 'Indexes');
  const projectRegistryFile = path.join(vaultPath, 'System', 'project-registry.json');

  for (const dir of [graphifyVaultData, graphReportsDir, graphIndexesDir, path.dirname(projectRegistryFile)]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const graphJsonPath = path.join(graphifyVaultData, 'graph.json');
  const indexJsonPath = path.join(graphIndexesDir, 'graph-index.json');
  const warnings = [];

  function calculateFileHash(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(buffer).digest('hex');
    } catch {
      return '';
    }
  }

  return {
    initializeGraph() {
      const now = new Date().toISOString();
      if (!fs.existsSync(graphJsonPath)) {
        const initialGraph = {
          nodes: [],
          edges: [],
          metadata: {
            created_at: now,
            updated_at: now,
            graph_version: '2.3.0'
          }
        };
        fs.writeFileSync(graphJsonPath, JSON.stringify(initialGraph, null, 2), 'utf8');
      }

      if (!fs.existsSync(projectRegistryFile)) {
        fs.writeFileSync(projectRegistryFile, JSON.stringify({ projects: [] }, null, 2), 'utf8');
      }

      return this.getGraphStats();
    },

    registerProject({ projectId, name, sourcePath, syncMode = 'reference', include = ['**/*.md', '**/*.json'], exclude = ['node_modules/**', '.git/**'] }) {
      let registry = { projects: [] };
      if (fs.existsSync(projectRegistryFile)) {
        try { registry = JSON.parse(fs.readFileSync(projectRegistryFile, 'utf8')); } catch {}
      }

      const existingIndex = registry.projects.findIndex(p => p.project_id === projectId);
      const projectRecord = {
        project_id: projectId,
        name,
        source_path: sourcePath,
        vault_path: `Vault/02-Projects/${projectId}`,
        indexing_enabled: true,
        sync_mode: syncMode,
        include,
        exclude,
        registered_at: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        registry.projects[existingIndex] = projectRecord;
      } else {
        registry.projects.push(projectRecord);
      }

      fs.writeFileSync(projectRegistryFile, JSON.stringify(registry, null, 2), 'utf8');
      return projectRecord;
    },

    scanProject(projectId) {
      let registry = { projects: [] };
      if (fs.existsSync(projectRegistryFile)) {
        try { registry = JSON.parse(fs.readFileSync(projectRegistryFile, 'utf8')); } catch {}
      }

      const project = registry.projects.find(p => p.project_id === projectId);
      if (!project) throw new Error(`Project ${projectId} not found in project registry`);

      let graph = { nodes: [], edges: [], metadata: {} };
      if (fs.existsSync(graphJsonPath)) {
        try { graph = JSON.parse(fs.readFileSync(graphJsonPath, 'utf8')); } catch {}
      }

      const now = new Date().toISOString();
      const newNodes = [];
      const newEdges = [];

      // Add Project Node
      const projectNodeId = `Project:${project.project_id}`;
      newNodes.push({
        id: projectNodeId,
        type: 'Project',
        name: project.name,
        sourcePath: project.source_path,
        createdAt: now,
        accessScope: 'project',
        confidence: 'verified'
      });

      // Scan directory if exists and path is allowed & safe
      if (fs.existsSync(project.source_path)) {
        const projectPolicy = { allowed_roots: [project.source_path] };
        const pathCheck = isPathAllowed(project.source_path, projectPolicy);
        const symCheck = isSymlinkSafe(project.source_path, [project.source_path]);
        if (!pathCheck.allowed || !symCheck.safe) {
          warnings.push(`Project path access denied: ${project.source_path} (${pathCheck.reason || symCheck.reason})`);
        } else {
          const scanDir = (dirPath) => {
            try {
              const items = fs.readdirSync(dirPath, { withFileTypes: true });
              for (const item of items) {
                if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist' || item.name === 'build') continue;
                if (item.isSymbolicLink()) continue;
                const fullPath = path.join(dirPath, item.name);

                // Access policy verification per file
                const fileCheck = isPathAllowed(fullPath, projectPolicy);
                if (!fileCheck.allowed) continue;

                if (item.isDirectory()) {
                  scanDir(fullPath);
                } else if (item.isFile()) {
                  const ext = path.extname(item.name).toLowerCase();
                  if (['.md', '.txt', '.json', '.mjs', '.js', '.ts', '.py'].includes(ext)) {
                    const hash = calculateFileHash(fullPath);
                    const docNodeId = `Document:${hash.substring(0, 16)}`;
                    newNodes.push({
                      id: docNodeId,
                      type: 'Document',
                      name: item.name,
                      sourcePath: fullPath,
                      sourceHash: hash,
                      createdAt: now,
                      accessScope: 'project',
                      confidence: 'verified'
                    });

                    newEdges.push({
                      from: projectNodeId,
                      to: docNodeId,
                      type: 'PROJECT_CONTAINS',
                      createdAt: now,
                      confidence: 'verified'
                    });
                  }
                }
              }
            } catch (err) {
              warnings.push(`Scan error at ${dirPath}: ${err.message}`);
            }
          };
          scanDir(project.source_path);
        }
      }

      // Merge nodes & edges deduplicated
      const existingNodeIds = new Set(graph.nodes.map(n => n.id));
      for (const node of newNodes) {
        if (!existingNodeIds.has(node.id)) {
          graph.nodes.push(node);
          existingNodeIds.add(node.id);
        }
      }

      const edgeKeys = new Set(graph.edges.map(e => `${e.from}->${e.to}:${e.type}`));
      for (const edge of newEdges) {
        const key = `${edge.from}->${edge.to}:${edge.type}`;
        if (!edgeKeys.has(key)) {
          graph.edges.push(edge);
          edgeKeys.add(key);
        }
      }

      graph.metadata.updated_at = now;
      graph.metadata.warnings = warnings;
      fs.writeFileSync(graphJsonPath, JSON.stringify(graph, null, 2), 'utf8');

      // Update Report Markdown
      const reportMd = `# Graphify Audit Report\n\n- Updated At: \`${now}\`\n- Total Graph Nodes: **${graph.nodes.length}**\n- Total Graph Edges: **${graph.edges.length}**\n- Security Warnings: **${warnings.length}**\n\n## Project Nodes\n${graph.nodes.filter(n => n.type === 'Project').map(n => `- **${n.name}** (\`${n.sourcePath}\`)`).join('\n')}\n`;
      fs.writeFileSync(path.join(graphReportsDir, 'GRAPH_REPORT.md'), reportMd, 'utf8');
      fs.writeFileSync(indexJsonPath, JSON.stringify({ updated_at: now, node_count: graph.nodes.length, edge_count: graph.edges.length, warnings_count: warnings.length }, null, 2), 'utf8');

      return { nodesAdded: newNodes.length, edgesAdded: newEdges.length, totalNodes: graph.nodes.length, totalEdges: graph.edges.length, warnings };
    },

    getGraphStats() {
      if (!fs.existsSync(graphJsonPath)) return { nodes: 0, edges: 0, warnings: 0 };
      try {
        const graph = JSON.parse(fs.readFileSync(graphJsonPath, 'utf8'));
        return { nodes: graph.nodes.length, edges: graph.edges.length, warnings: (graph.metadata?.warnings || []).length };
      } catch {
        return { nodes: 0, edges: 0, warnings: 0 };
      }
    }
  };
}
