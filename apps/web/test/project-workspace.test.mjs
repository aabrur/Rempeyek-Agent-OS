import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createProjectWorkspace } from '../lib/project-workspace.mjs';
import { createVaultProjectStore } from '../lib/vault-project-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureVault = path.join(here, 'fixtures', 'vault');

async function withVault(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'rempeyek-projects-'));
  await cp(fixtureVault, root, { recursive: true });
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('query returns a stable project DTO parsed from Markdown', async () => {
  const projects = createProjectWorkspace({ store: createVaultProjectStore({ vaultRoot: fixtureVault }) });
  const project = await projects.query({ id: 'apollo' });

  assert.deepEqual(project, {
    id: 'apollo',
    title: 'Apollo Migration',
    status: 'active',
    summary: 'Move the local agent workspace to the project-first experience.',
    updatedAt: '2026-07-11T16:20:00.000Z',
    nextAction: 'Review the Architecture Decision with the founder.',
    tasks: [
      { id: 'task-brief', title: 'Define the project brief', status: 'completed' },
      { id: 'task-architecture', title: 'Review architecture decision', status: 'pending' },
      { id: 'task-today', title: 'Ship the Today view', status: 'pending' },
    ],
    decisions: [
      { text: 'Use a project-first home', status: 'unresolved', date: '2026-07-11', actor: 'founder' },
      { text: 'Keep Node and vanilla adapters', status: 'resolved', date: '2026-07-10', actor: 'architecture' },
    ],
    recentArtifacts: [
      { label: 'Research Notes', target: 'Research Notes', kind: 'wikilink' },
      { label: 'Prototype', target: 'artifacts/prototype.html', kind: 'link' },
    ],
    links: ['Architecture Decision', 'Research Notes'],
    activity: [
      { at: '2026-07-11T16:20:00.000Z', actor: 'human', summary: 'Reviewed Research Notes' },
      { at: '2026-07-11T14:00:00.000Z', actor: 'agent', summary: 'Created Architecture Decision' },
    ],
  });
});

test('execute accepts typed task commands and rejects unknown commands', async () => withVault(async (vaultRoot) => {
  const projects = createProjectWorkspace({ store: createVaultProjectStore({ vaultRoot }) });
  const result = await projects.execute({
    type: 'project.task.set-status', projectId: 'apollo', taskId: 'task-architecture', status: 'completed',
  });
  assert.equal(result.task.status, 'completed');
  assert.equal((await projects.query({ id: 'apollo' })).tasks[1].status, 'completed');

  await assert.rejects(
    projects.execute({ type: 'filesystem.write', projectId: 'apollo' }),
    /Unsupported project command/,
  );
}));

test('ingest appends validated project activity and is idempotent by event id', async () => withVault(async (vaultRoot) => {
  const projects = createProjectWorkspace({ store: createVaultProjectStore({ vaultRoot }) });
  const event = {
    type: 'project.activity.recorded', id: 'evt-42', projectId: 'apollo',
    at: '2026-07-12T08:00:00.000Z', actor: 'codex', summary: 'Prepared Today projection',
  };
  assert.deepEqual(await projects.ingest(event), { accepted: true, duplicate: false, eventId: 'evt-42' });
  assert.deepEqual(await projects.ingest(event), { accepted: true, duplicate: true, eventId: 'evt-42' });

  const memory = await readFile(path.join(vaultRoot, 'Projects', 'apollo', 'Memory.md'), 'utf8');
  assert.equal(memory.match(/Prepared Today projection/g)?.length, 1);
  assert.equal((await projects.query({ id: 'apollo' })).activity[0].actor, 'codex');
}));

test('store rejects traversal in project identifiers', async () => {
  const projects = createProjectWorkspace({ store: createVaultProjectStore({ vaultRoot: fixtureVault }) });
  await assert.rejects(projects.query({ id: '../private' }), /Invalid project id/);
  await assert.rejects(projects.query({ id: 'apollo/..' }), /Invalid project id/);
});

