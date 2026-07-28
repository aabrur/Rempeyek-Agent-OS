import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildVaultGraph } from './vault-graph.mjs';

const CODE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.yaml', '.yml', '.css', '.html'
]);

const REPO_DIRS = ['apps', 'packages', 'scripts', 'docs', 'prompts', '.github'];
const REPO_ROOT_FILES = ['README.md', 'CHANGELOG.md', 'CLAUDE.md', 'CONTEXT.md', 'LICENSE', 'checkpoint.md', 'package.json', 'agents.config.example.json'];

function sha256Short(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex').substring(0, 12);
}

function safeStat(absPath) {
  try {
    return fs.statSync(absPath);
  } catch {
    return null;
  }
}

function safeReadJson(absPath) {
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
}

function walkDir(dir, baseDir, out = [], maxDepth = 15, currentDepth = 0) {
  if (currentDepth > maxDepth) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'release' || entry.name === 'out' || entry.name === 'coverage') {
      continue;
    }
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, baseDir, out, maxDepth, currentDepth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext)) {
        const rel = path.relative(baseDir, full).replace(/\\/g, '/');
        const st = safeStat(full);
        out.push({ rel, mtime: st?.mtimeMs || Date.now(), absPath: full });
      }
    }
  }
  return out;
}

export function buildUnifiedMemoryGraph({ vaultPath, rootDir, configDir } = {}) {
  const warnings = [];
  const nodesMap = new Map();
  const edgesMap = new Map();

  const addNode = (node) => {
    if (!node || !node.id) return null;
    if (!nodesMap.has(node.id)) {
      nodesMap.set(node.id, {
        id: node.id,
        type: node.type || 'vault-note',
        label: node.label || String(node.id).split('/').pop(),
        scope: node.scope || 'shared',
        source: node.source || 'vault',
        sourcePath: node.sourcePath || node.id,
        updatedAt: node.updatedAt || new Date().toISOString(),
        status: node.status || 'active',
        confidence: node.confidence || 'verified',
        metadata: node.metadata || {},
        // Backward compatibility fields for neural-engine renderer
        folder: node.folder || (node.id.includes('/') ? node.id.slice(0, node.id.lastIndexOf('/')) : '(root)'),
        degree: 0,
        mtime: node.mtime || (node.updatedAt ? Date.parse(node.updatedAt) : Date.now())
      });
    } else {
      // Merge node metadata
      const existing = nodesMap.get(node.id);
      existing.metadata = { ...existing.metadata, ...(node.metadata || {}) };
      if (node.status) existing.status = node.status;
      if (node.updatedAt) existing.updatedAt = node.updatedAt;
    }
    return nodesMap.get(node.id);
  };

  const addEdge = ({ source, target, type = 'RELATED_TO', confidence = 'verified', provenance = 'system' }) => {
    if (!source || !target || source === target) return;
    if (!nodesMap.has(source) || !nodesMap.has(target)) return;
    const edgeId = `edge:${sha256Short(`${source}->${target}:${type}`)}`;
    if (!edgesMap.has(edgeId)) {
      edgesMap.set(edgeId, {
        id: edgeId,
        source,
        target,
        type,
        confidence,
        provenance,
        // Compatibility for neural-engine
        s: source,
        t: target
      });
      const sNode = nodesMap.get(source);
      const tNode = nodesMap.get(target);
      if (sNode) sNode.degree += 1;
      if (tNode) tNode.degree += 1;
    }
  };

  // 1. Vault Notes, Folders, Assets & Wikilinks (Base Vault Graph)
  if (vaultPath && fs.existsSync(vaultPath)) {
    try {
      const vaultFiles = [];
      const scanVaultDir = (dir, base) => {
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          if (entry.isSymbolicLink()) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanVaultDir(full, base);
          } else if (entry.isFile()) {
            const rel = path.relative(base, full).replace(/\\/g, '/');
            const st = safeStat(full);
            let text = null;
            if (rel.toLowerCase().endsWith('.md')) {
              try { text = fs.readFileSync(full, 'utf8'); } catch {}
            }
            vaultFiles.push({ rel, mtime: st?.mtimeMs || Date.now(), text, kind: 'vault' });
          }
        }
      };
      scanVaultDir(vaultPath, vaultPath);
      const baseGraph = buildVaultGraph({ files: vaultFiles });
      for (const bNode of baseGraph.nodes || []) {
        let nodeType = bNode.type || 'vault-note';
        if (nodeType === 'note') nodeType = 'vault-note';
        addNode({
          id: bNode.id,
          type: nodeType,
          label: bNode.label,
          scope: 'shared',
          source: 'vault',
          sourcePath: bNode.id,
          updatedAt: bNode.mtime ? new Date(bNode.mtime).toISOString() : new Date().toISOString(),
          status: 'active',
          confidence: 'verified',
          folder: bNode.folder,
          mtime: bNode.mtime,
          metadata: { origType: bNode.type }
        });
      }
      for (const bEdge of baseGraph.edges || []) {
        let relType = 'LINKS_TO';
        if (bEdge.type === 'ghost') relType = 'REFERENCES';
        if (bEdge.type === 'tag') relType = 'REFERENCES';
        if (bEdge.type === 'folder') relType = 'BELONGS_TO';
        addEdge({ source: bEdge.source, target: bEdge.target, type: relType, provenance: 'vault-wikilink' });
      }
    } catch (err) {
      warnings.push(`Vault graph build error: ${err.message}`);
    }
  }

  // 2. Whole Application Source Projection (Repo/)
  if (rootDir && fs.existsSync(rootDir)) {
    try {
      for (const dirName of REPO_DIRS) {
        const absDir = path.join(rootDir, dirName);
        if (!fs.existsSync(absDir)) continue;
        const repoFiles = walkDir(absDir, rootDir);
        for (const file of repoFiles) {
          const virtualId = `Repo/${file.rel}`;
          const isDoc = file.rel.endsWith('.md');
          addNode({
            id: virtualId,
            type: isDoc ? 'documentation' : 'application-module',
            label: path.basename(file.rel),
            scope: 'source',
            source: 'repository',
            sourcePath: file.rel,
            updatedAt: new Date(file.mtime).toISOString(),
            status: 'active',
            confidence: 'verified',
            folder: `Repo/${path.dirname(file.rel)}`,
            mtime: file.mtime,
            metadata: { extension: path.extname(file.rel) }
          });

          // Link to parent folder node
          const folderParts = file.rel.split('/').slice(0, -1);
          let prevFolder = 'folder:Repo';
          addNode({ id: prevFolder, type: 'folder', label: 'Repo', scope: 'source', sourcePath: 'Repo' });
          for (let i = 0; i < folderParts.length; i++) {
            const folderId = `folder:Repo/${folderParts.slice(0, i + 1).join('/')}`;
            addNode({ id: folderId, type: 'folder', label: folderParts[i], scope: 'source', sourcePath: folderParts.slice(0, i + 1).join('/') });
            addEdge({ source: prevFolder, target: folderId, type: 'CONTAINS', provenance: 'repo-structure' });
            prevFolder = folderId;
          }
          addEdge({ source: prevFolder, target: virtualId, type: 'CONTAINS', provenance: 'repo-structure' });
        }
      }

      for (const fileName of REPO_ROOT_FILES) {
        const absFile = path.join(rootDir, fileName);
        if (fs.existsSync(absFile)) {
          const st = safeStat(absFile);
          const virtualId = `Repo/${fileName}`;
          const isDoc = fileName.endsWith('.md');
          addNode({
            id: virtualId,
            type: isDoc ? 'documentation' : 'application-module',
            label: fileName,
            scope: 'source',
            source: 'repository',
            sourcePath: fileName,
            updatedAt: st ? new Date(st.mtimeMs).toISOString() : new Date().toISOString(),
            status: 'active',
            confidence: 'verified',
            folder: 'Repo',
            mtime: st?.mtimeMs || Date.now()
          });
          addEdge({ source: 'folder:Repo', target: virtualId, type: 'CONTAINS', provenance: 'repo-structure' });
        }
      }
    } catch (err) {
      warnings.push(`Repo source projection error: ${err.message}`);
    }
  }

  // 3. AI Family Registry (Agents)
  if (vaultPath) {
    const familyRegistryPath = path.join(vaultPath, 'System', 'AI-Family', 'family-registry.json');
    const familyData = safeReadJson(familyRegistryPath);
    if (familyData && Array.isArray(familyData.nodes)) {
      for (const agentNode of familyData.nodes) {
        const agentId = `Agent:${agentNode.node_id || agentNode.agent_id}`;
        addNode({
          id: agentId,
          type: 'agent',
          label: agentNode.display_name || agentNode.name || agentNode.node_id,
          scope: 'system',
          source: 'family-registry',
          sourcePath: `System/AI-Family/family-registry.json#${agentNode.node_id}`,
          updatedAt: agentNode.last_seen_at || agentNode.created_at || new Date().toISOString(),
          status: agentNode.status || 'active',
          confidence: 'verified',
          metadata: {
            provider: agentNode.provider,
            role: agentNode.role,
            nodeId: agentNode.node_id,
            trustLevel: agentNode.trust_level
          }
        });

        // Link agent to its Vault lane folder
        if (agentNode.role || agentNode.display_name) {
          const laneFolder = `folder:Brains/${agentNode.display_name || agentNode.node_id}`;
          if (nodesMap.has(laneFolder)) {
            addEdge({ source: agentId, target: laneFolder, type: 'OWNED_BY', provenance: 'family-registry' });
          }
        }
      }
    }
  }

  // 4. Project Registry & Project Workspaces
  if (vaultPath) {
    const projectRegPath = path.join(vaultPath, 'System', 'project-registry.json');
    const projData = safeReadJson(projectRegPath);
    if (projData && Array.isArray(projData.projects)) {
      for (const proj of projData.projects) {
        const projId = `Project:${proj.project_id}`;
        addNode({
          id: projId,
          type: 'project',
          label: proj.name || proj.project_id,
          scope: 'project',
          source: 'project-registry',
          sourcePath: proj.source_path || proj.vault_path,
          updatedAt: proj.registered_at || new Date().toISOString(),
          status: proj.indexing_enabled ? 'active' : 'idle',
          confidence: 'verified',
          metadata: { syncMode: proj.sync_mode }
        });
      }
    }
  }

  // 5. Active, Completed & Interrupted Sessions
  if (vaultPath) {
    const sessionDirs = ['Active', 'Completed', 'Interrupted'];
    for (const sub of sessionDirs) {
      const sDir = path.join(vaultPath, 'Sessions', sub);
      if (fs.existsSync(sDir)) {
        let files = [];
        try { files = fs.readdirSync(sDir); } catch {}
        for (const f of files) {
          if (!f.endsWith('.json')) continue;
          const sData = safeReadJson(path.join(sDir, f));
          if (sData) {
            const sessId = `Session:${sData.session_id || f.replace('.json', '')}`;
            addNode({
              id: sessId,
              type: 'session',
              label: `Session ${sData.session_id || f.replace('.json', '')}`,
              scope: 'shared',
              source: 'session-store',
              sourcePath: `Sessions/${sub}/${f}`,
              updatedAt: sData.ended_at || sData.started_at || new Date().toISOString(),
              status: sData.status || sub.toLowerCase(),
              confidence: 'verified',
              metadata: {
                nodeId: sData.node_id,
                agentId: sData.agent_id,
                taskId: sData.task_id
              }
            });

            if (sData.node_id) {
              const agentId = `Agent:${sData.node_id}`;
              if (nodesMap.has(agentId)) {
                addEdge({ source: agentId, target: sessId, type: 'STARTED', provenance: 'session-log' });
              }
            }

            if (sData.task_id) {
              const taskId = `Task:${sData.task_id}`;
              if (nodesMap.has(taskId)) {
                addEdge({ source: sessId, target: taskId, type: 'WORKED_ON', provenance: 'session-log' });
              }
            }
          }
        }
      }
    }
  }

  // 6. Shared Memory Index
  if (vaultPath) {
    const sharedMemIndexPath = path.join(vaultPath, 'Memory', 'Shared', 'index.json');
    const memData = safeReadJson(sharedMemIndexPath);
    if (memData && Array.isArray(memData.memories)) {
      for (const mem of memData.memories) {
        const memId = `Memory:${mem.memory_id}`;
        addNode({
          id: memId,
          type: 'shared-memory',
          label: mem.title || mem.memory_id,
          scope: 'shared',
          source: 'shared-memory-engine',
          sourcePath: `Memory/Shared/index.json#${mem.memory_id}`,
          updatedAt: mem.updated_at || mem.created_at || new Date().toISOString(),
          status: mem.status || 'active',
          confidence: mem.confidence || 'verified',
          metadata: { type: mem.type, createdBy: mem.created_by }
        });

        if (mem.created_by) {
          const agentId = `Agent:${mem.created_by}`;
          if (nodesMap.has(agentId)) {
            addEdge({ source: agentId, target: memId, type: 'CREATED', provenance: 'memory-index' });
          }
        }
      }
    }
  }

  // 7. Graphify Subgraph Nodes & Edges
  if (vaultPath) {
    const graphJsonPath = path.join(vaultPath, '.graphify', 'graph.json');
    const gData = safeReadJson(graphJsonPath);
    if (gData && Array.isArray(gData.nodes)) {
      for (const gNode of gData.nodes) {
        const nodeId = gNode.id;
        addNode({
          id: nodeId,
          type: gNode.type || 'graphify-concept',
          label: gNode.name || gNode.label || nodeId,
          scope: 'shared',
          source: 'graphify',
          sourcePath: gNode.sourcePath || '.graphify/graph.json',
          updatedAt: gNode.createdAt || new Date().toISOString(),
          status: 'active',
          confidence: gNode.confidence || 'inferred',
          metadata: { accessScope: gNode.accessScope }
        });
      }
      if (Array.isArray(gData.edges)) {
        for (const gEdge of gData.edges) {
          addEdge({
            source: gEdge.from || gEdge.source,
            target: gEdge.to || gEdge.target,
            type: gEdge.type || 'RELATED_TO',
            confidence: gEdge.confidence || 'inferred',
            provenance: 'graphify'
          });
        }
      }
    }
  }

  // 8. Migration Journal Records
  if (configDir) {
    const journalPath = path.join(configDir, 'migration-journal.json');
    const jData = safeReadJson(journalPath);
    if (jData && Array.isArray(jData.migrations)) {
      for (const mig of jData.migrations) {
        const migId = `Migration:v${mig.version}`;
        addNode({
          id: migId,
          type: 'migration',
          label: `Migration v${mig.version}: ${mig.description || ''}`,
          scope: 'system',
          source: 'migration-engine',
          sourcePath: 'Config/migration-journal.json',
          updatedAt: mig.executedAt || new Date().toISOString(),
          status: mig.status || 'completed',
          confidence: 'verified',
          metadata: { durationMs: mig.durationMs }
        });
      }
    }
  }

  const nodes = [...nodesMap.values()];
  const edges = [...edgesMap.values()];

  const stats = {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    byType: {}
  };
  for (const n of nodes) {
    stats.byType[n.type] = (stats.byType[n.type] || 0) + 1;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRevision: sha256Short(`${nodes.length}:${edges.length}`),
    nodes,
    edges,
    stats,
    filters: {
      availableTypes: Object.keys(stats.byType),
      availableScopes: ['system', 'shared', 'project', 'agent-private', 'source']
    },
    warnings,
    health: {
      status: warnings.length === 0 ? 'healthy' : 'degraded',
      warningsCount: warnings.length
    },
    // Backward compatibility fields for neural-engine
    adjacency: Object.fromEntries(nodes.map(n => [n.id, edges.filter(e => e.source === n.id || e.target === n.id).map(e => e.source === n.id ? e.target : e.source)])),
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      datasetIdentity: sha256Short(`${nodes.length}:${edges.length}`),
      generatedAt: new Date().toISOString()
    }
  };
}
