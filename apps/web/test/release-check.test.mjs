import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRepoUrl, parseVersion, compareVersions, releaseState } from '../lib/release-check.mjs';

test('parseRepoUrl handles https, ssh, and .git suffixes', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/aabrur/Rempeyek-Agent-OS.git'),
    { owner: 'aabrur', repo: 'Rempeyek-Agent-OS', slug: 'aabrur/Rempeyek-Agent-OS' });
  assert.deepEqual(parseRepoUrl('git@github.com:aabrur/Rempeyek-Agent-OS.git')?.slug, 'aabrur/Rempeyek-Agent-OS');
  assert.deepEqual(parseRepoUrl('https://github.com/o/r')?.slug, 'o/r');
  assert.equal(parseRepoUrl('https://gitlab.com/o/r'), null, 'only GitHub is a release source');
  assert.equal(parseRepoUrl(''), null);
  assert.equal(parseRepoUrl(undefined), null);
});

test('version parsing and comparison are strict and v-prefix tolerant', () => {
  assert.deepEqual(parseVersion('v2.1.0'), [2, 1, 0]);
  assert.deepEqual(parseVersion('2.1.0-beta.1'), [2, 1, 0], 'prerelease suffix ignored for ordering');
  assert.equal(parseVersion('latest'), null);
  assert.equal(compareVersions('2.1.0', '2.0.0'), 1);
  assert.equal(compareVersions('v2.0.0', '2.0.0'), 0);
  assert.equal(compareVersions('2.0.9', '2.1.0'), -1);
  assert.equal(compareVersions('garbage', '2.0.0'), 0, 'malformed input can never claim an update');
});

test('releaseState only offers an update for a strictly newer, well-formed tag', () => {
  const newer = releaseState({ current: '2.0.0', latestTag: 'v2.1.0', url: 'https://x/rel', notes: 'notes' });
  assert.equal(newer.updateAvailable, true);
  assert.equal(newer.latest, '2.1.0');
  assert.equal(newer.current, '2.0.0');

  assert.equal(releaseState({ current: '2.1.0', latestTag: 'v2.1.0' }).updateAvailable, false, 'same version');
  assert.equal(releaseState({ current: '2.2.0', latestTag: 'v2.1.0' }).updateAvailable, false, 'local ahead');
  assert.equal(releaseState({ current: '2.0.0', latestTag: 'nightly' }).updateAvailable, false, 'malformed tag');
  assert.equal(releaseState({ current: '2.0.0', latestTag: 'nightly' }).latest, null);
});

test('release notes are carried but bounded', () => {
  const long = 'x'.repeat(9000);
  const s = releaseState({ current: '1.0.0', latestTag: 'v2.0.0', notes: long });
  assert.ok(s.notes.length <= 4000, 'notes are truncated so a hostile release body cannot flood the UI');
});
