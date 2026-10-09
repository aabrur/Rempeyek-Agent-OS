import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

export const CONTEXT_LIMITS = { count: 12, fileBytes: 2 * 1024 * 1024, totalBytes: 8 * 1024 * 1024 };

// Catalogue documents only. Selecting a plugin never enables its tools or hooks.
let catalogCache = null;
let catalogExpiresAt = 0;
let catalogLoading = null;
export async function contextCatalog() {
  if (catalogCache && Date.now() < catalogExpiresAt) return catalogCache;
  if (catalogLoading) return catalogLoading;
  catalogLoading = scanCatalog().then(entries => {
    catalogCache = entries; catalogExpiresAt = Date.now() + 60000; return entries;
  }).finally(() => { catalogLoading = null; });
  return catalogLoading;
}

async function scanCatalog() {
  const entries = [];
  const queue = [
    { root: path.join(os.homedir(), '.skills'), depth: 3 },
    { root: path.join(process.cwd(), '.agents', 'skills'), depth: 3 },
    { root: path.join(os.homedir(), '.codex', 'plugins', 'cache'), depth: 8 },
  ];
  let visited = 0;
  while (queue.length && visited < 9000) {
    const batch = queue.splice(0, Math.min(16, 9000 - visited));
    visited += batch.length;
    await Promise.all(batch.map(async ({ root, depth }) => {
      let children;
      try { if ((await fs.promises.lstat(root)).isSymbolicLink()) return; children = await fs.promises.readdir(root, { withFileTypes: true }); } catch { return; }
      for (const child of children) {
        if (child.isSymbolicLink()) continue;
        const file = path.join(root, child.name);
        if (child.isDirectory() && depth > 0 && !['node_modules', '.git', 'tests', 'assets', 'scripts'].includes(child.name)) queue.push({ root: file, depth: depth - 1 });
        else if (child.isFile() && (child.name === 'SKILL.md' || (child.name === 'plugin.json' && ['.codex-plugin', '.claude-plugin'].includes(path.basename(root))))) {
          try {
            const stat = await fs.promises.stat(file);
            if (stat.size > CONTEXT_LIMITS.fileBytes) continue;
            const kind = child.name === 'SKILL.md' ? 'skill' : 'plugin';
            if (kind === 'plugin' && path.basename(root) === '.claude-plugin') {
              try { await fs.promises.access(path.join(path.dirname(root), '.codex-plugin', 'plugin.json')); continue; } catch { /* Use the available manifest. */ }
            }
            let name = kind === 'skill' ? path.basename(root) : path.basename(path.dirname(path.dirname(root)));
            if (kind === 'plugin') {
              const manifest = JSON.parse(await fs.promises.readFile(file, 'utf8'));
              name = String(manifest.interface?.displayName || manifest.name || name).slice(0, 160);
            }
            entries.push({ id: createHash('sha256').update(file).digest('hex'), kind, name, path: file, size: stat.size });
          } catch { /* A removed or unreadable entry does not invalidate the catalogue. */ }
        }
      }
    }));
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

export function prepareContext(input = [], catalog = []) {
  if (!Array.isArray(input) || input.length > CONTEXT_LIMITS.count) throw new Error('Attach at most 12 items');
  let total = 0;
  return input.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid attachment');
    let bytes, name, kind;
    if (item.catalogId) {
      const entry = catalog.find(entry => entry.id === item.catalogId);
      if (!entry) throw new Error('Selected skill or plugin is no longer available');
      if (fs.lstatSync(entry.path).isSymbolicLink() || fs.statSync(entry.path).size > CONTEXT_LIMITS.fileBytes) throw new Error('Context document changed; select it again');
      bytes = fs.readFileSync(entry.path); name = `${entry.name}${entry.kind === 'skill' ? '-SKILL.md' : '-plugin.json'}`; kind = entry.kind;
    } else {
      if (!['media', 'file'].includes(item.kind) || typeof item.name !== 'string' || typeof item.data !== 'string' || item.data.length > Math.ceil(CONTEXT_LIMITS.fileBytes / 3) * 4 || item.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data)) throw new Error('Invalid file attachment');
      bytes = Buffer.from(item.data, 'base64'); name = item.name; kind = item.kind;
      if (bytes.toString('base64') !== item.data) throw new Error('Invalid file encoding');
    }
    total += bytes.length;
    if (bytes.length > CONTEXT_LIMITS.fileBytes || total > CONTEXT_LIMITS.totalBytes) throw new Error('Attachments allow 2 MB per file and 8 MB total');
    // Only native raster formats are sent as visual input; other files remain references.
    const image = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
    if (kind === 'media' && !image) throw new Error('Media supports PNG, JPEG and WebP images');
    return { name: path.basename(name).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 160) || 'attachment', kind, bytes, image };
  });
}

export function saveContext(root, runId, entries) {
  if (!entries.length) return [];
  const directory = path.join(root, 'inputs', runId);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return entries.map((entry, index) => {
    const file = path.join(directory, `${index + 1}-${entry.name}${entry.image ? `.${entry.image}` : ''}`);
    fs.writeFileSync(file, entry.bytes, { flag: 'wx', mode: 0o600 });
    const text = !entry.image && !entry.bytes.includes(0) ? entry.bytes.toString('utf8').slice(0, 16000) : '';
    return { name: entry.name, kind: entry.kind, path: file, size: entry.bytes.length, image: Boolean(entry.image), text,
      truncated: Boolean(text && entry.bytes.toString('utf8').length > text.length) };
  });
}
