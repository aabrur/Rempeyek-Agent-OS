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
