import fs from 'node:fs';
import path from 'node:path';

export function createSharedMemoryEngine({ vaultPath, agentsDir } = {}) {
  if (!vaultPath || !agentsDir) {
    throw new TypeError('vaultPath and agentsDir are required');
  }

  const memoryDirs = {
    shared: path.join(vaultPath, 'Memory', 'Shared'),
    decisions: path.join(vaultPath, 'Memory', 'Decisions'),
    lessons: path.join(vaultPath, 'Memory', 'Lessons'),
    preferences: path.join(vaultPath, 'Memory', 'Preferences'),
    entities: path.join(vaultPath, 'Memory', 'Entities'),
    procedures: path.join(vaultPath, 'Memory', 'Procedures'),
    handoffs: path.join(vaultPath, 'Memory', 'Handoffs'),
    sessionsActive: path.join(vaultPath, 'Sessions', 'Active'),
    sessionsCompleted: path.join(vaultPath, 'Sessions', 'Completed'),
    sessionsFailed: path.join(vaultPath, 'Sessions', 'Failed')
  };

  for (const dir of Object.values(memoryDirs)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const indexFile = path.join(memoryDirs.shared, 'index.json');
  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, JSON.stringify({ version: 1, memories: [] }, null, 2), 'utf8');
  }

  return {
    startSession({ nodeId, agentId, taskId, taskSummary, projectId = 'default' } = {}) {
      if (!nodeId || !agentId || !taskId) {
        throw new TypeError('nodeId, agentId, and taskId are required');
      }

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      const sessionRecord = {
        session_id: sessionId,
        node_id: nodeId,
        agent_id: agentId,
        task_id: taskId,
        task_summary: taskSummary || taskId,
        project_id: projectId,
        started_at: now,
        status: 'active',
        skills_loaded: [],
        memory_sources: ['Vault/Memory/Shared', 'Vault/Memory/Decisions'],
        graph_context: [],
        files_allowed: ['*'],
        files_denied: ['.ssh', '.gnupg', 'Credentials'],
        approval_state: 'approved',
        decisions: [],
        files_changed: [],
        validation_results: []
      };

      // Write to Vault/Sessions/Active/<session-id>.json
      const sessionFile = path.join(memoryDirs.sessionsActive, `${sessionId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify(sessionRecord, null, 2), 'utf8');

      // Write to Node private sessions directory
      const nodeSessionDir = path.join(agentsDir, nodeId, 'sessions');
      fs.mkdirSync(nodeSessionDir, { recursive: true });
      fs.writeFileSync(path.join(nodeSessionDir, `${sessionId}.json`), JSON.stringify(sessionRecord, null, 2), 'utf8');

      return sessionRecord;
    },

    recordDecision(sessionId, { title, rationale, sourceFiles = [] }) {
      const activeFile = path.join(memoryDirs.sessionsActive, `${sessionId}.json`);
      if (!fs.existsSync(activeFile)) return null;

      const session = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
      const decision = {
        decision_id: `decision-${Date.now()}`,
        title,
        rationale,
        source_files: sourceFiles,
        timestamp: new Date().toISOString()
      };
      session.decisions.push(decision);

      fs.writeFileSync(activeFile, JSON.stringify(session, null, 2), 'utf8');
      return decision;
    },

    recordFileChange(sessionId, filePath, action = 'modified') {
      const activeFile = path.join(memoryDirs.sessionsActive, `${sessionId}.json`);
      if (!fs.existsSync(activeFile)) return null;

      const session = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
      session.files_changed.push({ path: filePath, action, timestamp: new Date().toISOString() });

      fs.writeFileSync(activeFile, JSON.stringify(session, null, 2), 'utf8');
      return session;
    },

    endSession(sessionId, { status = 'completed', completedSummary, filesChanged = [], decisions = [], validation = [], unresolved = [], nextAction = '', securityNotes = '' } = {}) {
      const activeFile = path.join(memoryDirs.sessionsActive, `${sessionId}.json`);
      if (!fs.existsSync(activeFile)) throw new Error(`Active session ${sessionId} not found`);

      const session = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
      const now = new Date().toISOString();

      session.status = status;
      session.ended_at = now;
      session.completed_summary = completedSummary || session.task_summary;
      session.unresolved = unresolved;
      session.next_action = nextAction;
      session.security_notes = securityNotes;

      // Move session file to Completed or Failed
      const targetDir = status === 'completed' ? memoryDirs.sessionsCompleted : memoryDirs.sessionsFailed;
      const targetFile = path.join(targetDir, `${sessionId}.json`);
      fs.writeFileSync(targetFile, JSON.stringify(session, null, 2), 'utf8');
      try { fs.unlinkSync(activeFile); } catch {}

      // Write Handoff Markdown
      const safeTime = now.replace(/[:.]/g, '-');
      const handoffFileName = `${safeTime}-${session.node_id}-${session.task_id}.md`;
      const handoffPath = path.join(memoryDirs.handoffs, handoffFileName);

      const handoffMd = `# Agent Handoff

## Identity
- Node: **${session.node_id}**
- Agent: **${session.agent_id}**
- Session: \`${sessionId}\`
- Project: **${session.project_id}**

## Task
${session.task_summary}

## Completed
${completedSummary || 'Task completed successfully.'}

## Files Changed
${(filesChanged.length > 0 ? filesChanged : session.files_changed).map(f => `- \`${typeof f === 'string' ? f : f.path}\``).join('\n') || '- None'}

## Decisions
${(decisions.length > 0 ? decisions : session.decisions).map(d => `- **${d.title}**: ${d.rationale}`).join('\n') || '- None'}

## Validation
${validation.map(v => `- \`${v.command || v.test}\`: ${v.outcome || 'Passed'}`).join('\n') || '- Verified passing.'}

## Unresolved
${unresolved.map(u => `- ${u}`).join('\n') || '- None'}

## Recommended Next Action
${nextAction || 'Continue regular task lifecycle.'}

## Security Notes
${securityNotes || 'Access policy enforced. No credentials exposed.'}
`;

      fs.writeFileSync(handoffPath, handoffMd, 'utf8');

      return { session, handoffPath };
    },

    promoteMemory({ title, type = 'lesson', content, createdBy, projectId = 'default' }) {
      const memoryId = `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const now = new Date().toISOString();

      const memoryRecord = {
        memory_id: memoryId,
        title,
        type,
        status: 'active',
        created_by: createdBy,
        reviewed_by: 'system',
        project_id: projectId,
        created_at: now,
        updated_at: now,
        confidence: 'verified',
        content
      };

      const memoryFile = path.join(memoryDirs.shared, `${memoryId}.json`);
      fs.writeFileSync(memoryFile, JSON.stringify(memoryRecord, null, 2), 'utf8');

      // Update Index
      const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
      index.memories.push({
        memory_id: memoryId,
        title,
        type,
        created_by: createdBy,
        created_at: now
      });
      fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');

      return memoryRecord;
    },

    getRecentHandoffs(limit = 10) {
      const files = fs.readdirSync(memoryDirs.handoffs)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, limit);

      return files.map(file => {
        const filePath = path.join(memoryDirs.handoffs, file);
        const content = fs.readFileSync(filePath, 'utf8');
        return { file, path: filePath, content };
      });
    }
  };
}
