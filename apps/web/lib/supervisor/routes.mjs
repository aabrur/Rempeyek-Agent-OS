import { redactSecrets } from '../access-policy-engine.mjs';

async function body(req, limit = 32 * 1024) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Use application/json'), { statusCode: 415 });
  const origin = req.headers.origin;
  if (origin) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw Object.assign(new Error('Invalid Origin'), { statusCode: 403 }); }
    if (parsed.host.toLowerCase() !== String(req.headers.host || '').toLowerCase()) throw Object.assign(new Error('Cross-origin Supervisor mutation rejected'), { statusCode: 403 });
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Supervisor request is too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Body must be valid JSON'); }
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Body must be a JSON object');
  return input;
}

/** Called only after the application's access and authentication checks. */
export async function handleSupervisor(req, res, supervisor, json) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean).slice(2);
    const [resource, id, action, artifactId] = parts;
    if (parts.some(part => !/^[a-zA-Z0-9-]+$/.test(part)) || parts.length > 4) return json(res, 404, { error: 'Supervisor route not found' });
    if (req.method === 'GET') {
      if (resource === 'providers' && !id) return json(res, 200, { providers: await supervisor.providerList() });
      if (resource === 'config' && !id) return json(res, 200, supervisor.config());
      if (resource === 'context' && !id) return json(res, 200, await supervisor.contextCatalog());
      if (resource === 'runs' && !id) return json(res, 200, { runs: supervisor.list() });
      if (resource === 'runs' && id) {
        if (!action) return json(res, 200, { run: supervisor.get(id) });
        if (action === 'events' && !artifactId) return json(res, 200, { events: supervisor.get(id).events });
        if (action === 'artifacts') return json(res, 200, artifactId ? supervisor.readArtifact(id, artifactId) : { artifacts: supervisor.get(id).artifacts });
      }
    } else if (req.method === 'POST') {
      if (resource === 'project' && !id) return json(res, 200, await supervisor.inspectProject(await body(req)));
      if (resource === 'runs' && !id) return json(res, 201, { run: await supervisor.create(await body(req, 12 * 1024 * 1024)) });
      if (resource === 'runs' && id && !artifactId && ['pause', 'resume', 'cancel', 'reassign', 'approval'].includes(action)) return json(res, 200, { run: await supervisor.action(id, action, await body(req)) });
      if (resource === 'providers' && id && action === 'config' && !artifactId) return json(res, 200, { provider: await supervisor.configureProvider(id, await body(req)) });
    }
    return json(res, 404, { error: 'Supervisor route not found' });
  } catch (error) {
    if (!res.headersSent && !res.destroyed) json(res, error.statusCode || 400, { error: redactSecrets(error.message).slice(0, 4000) });
  }
}
