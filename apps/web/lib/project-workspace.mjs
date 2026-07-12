function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/); const metadata = {};
  for (const line of match?.[1].split(/\r?\n/) ?? []) { const i = line.indexOf(':'); if (i > 0) metadata[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { metadata, body: match ? markdown.slice(match[0].length) : markdown };
}
function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/); const start = lines.findIndex((line) => line.trim() === `## ${heading}`); if (start < 0) return '';
  const endOffset = lines.slice(start + 1).findIndex((line) => /^## /.test(line)); const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join('\n').trim();
}
const clean = (text) => text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target).trim();
const tasks = (md) => [...md.matchAll(/^- \[([ xX])\] (.+?) <!-- id: ([a-z0-9-]+) -->$/gm)].map((m) => ({ id: m[3], title: m[2].trim(), status: m[1].toLowerCase() === 'x' ? 'completed' : 'pending' }));
const decisions = (md) => [...section(md, 'Decisions').matchAll(/^- \[([ xX])\] (.+?) \| (\d{4}-\d{2}-\d{2}) \| (.+)$/gm)].map((m) => ({ text: clean(m[2]), status: m[1].toLowerCase() === 'x' ? 'resolved' : 'unresolved', date: m[3], actor: m[4].trim() }));
const activity = (md) => [...section(md, 'Activity').matchAll(/^- ([^|\s]+) \| ([^|]+) \| (.+?)(?: <!-- event: [^>]+ -->)?$/gm)].map((m) => ({ at: m[1], actor: m[2].trim(), summary: clean(m[3]) })).sort((a, b) => b.at.localeCompare(a.at));
function artifacts(md) {
  const output = [];
  for (const line of section(md, 'Artifacts').split(/\r?\n/)) {
    const wiki = line.match(/^- \[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/); if (wiki) output.push({ label: wiki[2] || wiki[1], target: wiki[1], kind: 'wikilink' });
    const link = line.match(/^- \[([^\]]+)\]\(([^)]+)\)$/); if (link) output.push({ label: link[1], target: link[2], kind: 'link' });
  } return output;
}
function links(...docs) { const output = []; for (const md of docs) for (const m of md.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) if (!output.includes(m[1])) output.push(m[1]); return output; }
function dto(id, snapshot) {
  const { metadata, body } = frontmatter(snapshot.project); const summary = body.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('#')) ?? '';
  return { id, title: metadata.title || id, status: metadata.status || 'unknown', summary: clean(summary), updatedAt: metadata.updated || null, nextAction: clean(section(body, 'Next Action').split(/\r?\n/).find(Boolean) ?? ''), tasks: tasks(snapshot.tasks), decisions: decisions(snapshot.memory), recentArtifacts: artifacts(body), links: links(snapshot.project, snapshot.tasks, snapshot.memory), activity: activity(snapshot.memory) };
}
function validateEvent(event) {
  if (event?.type !== 'project.activity.recorded') throw new TypeError('Unsupported project event');
  for (const key of ['id', 'projectId', 'at', 'actor', 'summary']) if (typeof event[key] !== 'string' || !event[key].trim()) throw new TypeError(`Invalid event ${key}`);
  if (Number.isNaN(Date.parse(event.at)) || /[\r\n|]/.test(event.actor) || /[\r\n]/.test(event.summary)) throw new TypeError('Invalid event data');
}
export function createProjectWorkspace({ store }) {
  if (!store) throw new TypeError('store is required');
  return Object.freeze({
    async query(query) { if (!query || Object.keys(query).some((key) => key !== 'id')) throw new TypeError('Invalid project query'); return dto(query.id, await store.readSnapshot(query.id)); },
    async execute(command) { if (command?.type !== 'project.task.set-status') throw new TypeError('Unsupported project command'); await store.setTaskStatus(command.projectId, command.taskId, command.status); const project = dto(command.projectId, await store.readSnapshot(command.projectId)); return { projectId: command.projectId, task: project.tasks.find((task) => task.id === command.taskId) }; },
    async ingest(event) { validateEvent(event); const appended = await store.appendActivity(event.projectId, event); return { accepted: true, duplicate: !appended, eventId: event.id }; },
  });
}
