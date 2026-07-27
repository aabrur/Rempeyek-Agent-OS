import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
function validId(id, label = 'project') { if (typeof id !== 'string' || !ID.test(id)) throw new TypeError(`Invalid ${label} id`); }
function inside(root, ...parts) {
  const base = path.resolve(root); const target = path.resolve(base, ...parts);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new TypeError('Path escapes Vault root');
  return target;
}
async function atomicWrite(file, text) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, text, 'utf8'); await rename(temporary, file);
}

import { mkdirSync, existsSync, writeFileSync, unlinkSync, statSync, readdirSync } from 'node:fs';

export function scaffoldVaultStructure(vaultPath, { agents = [] } = {}) {
  if (!vaultPath) return;
  const rootDirs = ["Brains", "Projects", "Tasks", "Inbox", "Reports", "Memory", "Attachments", ".obsidian"];
  for (const dir of rootDirs) {
    try { mkdirSync(path.join(vaultPath, dir), { recursive: true }); } catch {}
  }

  // Create minimal obsidian app config
  const obsConfig = path.join(vaultPath, ".obsidian", "app.json");
  if (!existsSync(obsConfig)) {
    try { writeFileSync(obsConfig, JSON.stringify({ legacyEditor: false, livePreview: true }, null, 2), "utf8"); } catch {}
  }

  // Scaffold Brains lanes for agents
  for (const agent of agents) {
    const lane = agent.lane || agent.name || agent.id;
    if (!lane) continue;
    const laneDir = path.join(vaultPath, "Brains", lane);
    for (const sub of ["Knowledge", "Notes", "Daily"]) {
      try { mkdirSync(path.join(laneDir, sub), { recursive: true }); } catch {}
    }
    const files = [
      { name: "Identity.md", content: `# ${agent.name || lane} Identity\n\n- Node: ${agent.node || "Node-1"}\n- Role: ${agent.role || "Agent"}\n` },
      { name: "Memory.md", content: `# ${agent.name || lane} Memory\n\n## Retained State\n` },
      { name: "Rules.md", content: `# ${agent.name || lane} Rules\n\n- Operating rules and safety constraints.\n` },
    ];
    for (const file of files) {
      const filePath = path.join(laneDir, file.name);
      if (!existsSync(filePath)) {
        try { writeFileSync(filePath, file.content, "utf8"); } catch {}
      }
    }
  }
}

export function getVaultHealth(vaultPath) {
  if (!vaultPath || !existsSync(vaultPath)) {
    return { exists: false, writable: false, noteCount: 0, obsidianAppInstalled: false };
  }
  let writable = false;
  try {
    const testFile = path.join(vaultPath, `.health-${Date.now()}.tmp`);
    writeFileSync(testFile, "test", "utf8");
    unlinkSync(testFile);
    writable = true;
  } catch {
    writable = existsSync(vaultPath);
  }

  let noteCount = 0;
  const countMarkdown = (dir) => {
    try {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (item.name.startsWith(".")) continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) countMarkdown(full);
        else if (item.isFile() && item.name.endsWith(".md")) noteCount++;
      }
    } catch {}
  };
  countMarkdown(vaultPath);

  return {
    exists: true,
    writable,
    noteCount,
    obsidianAppInstalled: existsSync(path.join(process.env.LOCALAPPDATA || "", "Programs", "Obsidian")) || existsSync("C:\\Program Files\\Obsidian\\Obsidian.exe"),
  };
}

export function createVaultProjectStore({ vaultRoot }) {
  if (!vaultRoot) throw new TypeError('vaultRoot is required');
  const projectsRoot = inside(vaultRoot, 'Projects');
  const file = (projectId, name) => { validId(projectId); return inside(projectsRoot, projectId, name); };
  return Object.freeze({
    async readSnapshot(projectId) {
      const [project, tasks, memory] = await Promise.all(['Project.md', 'Tasks.md', 'Memory.md'].map((name) => readFile(file(projectId, name), 'utf8')));
      return { project, tasks, memory };
    },
    async setTaskStatus(projectId, taskId, status) {
      validId(taskId, 'task');
      if (!['pending', 'completed'].includes(status)) throw new TypeError('Invalid task status');
      const target = file(projectId, 'Tasks.md'); const source = await readFile(target, 'utf8'); let found = false;
      const text = source.replace(/^- \[([ xX])\] (.+?) <!-- id: ([a-z0-9-]+) -->$/gm, (line, mark, title, id) => {
        if (id !== taskId) return line; found = true;
        return `- [${status === 'completed' ? 'x' : ' '}] ${title} <!-- id: ${id} -->`;
      });
      if (!found) throw new Error(`Unknown task: ${taskId}`);
      await atomicWrite(target, text);
    },
    async appendActivity(projectId, event) {
      const target = file(projectId, 'Memory.md'); const source = await readFile(target, 'utf8');
      const marker = `<!-- event: ${event.id} -->`; if (source.includes(marker)) return false;
      const line = `- ${event.at} | ${event.actor} | ${event.summary} ${marker}`; const heading = '## Activity'; const index = source.indexOf(heading);
      const text = index < 0 ? `${source.trimEnd()}\n\n${heading}\n\n${line}\n` : `${source.slice(0, index + heading.length)}\n\n${line}${source.slice(index + heading.length)}`;
      await atomicWrite(target, text); return true;
    },
  });
}
