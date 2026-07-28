import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createConfigResolver } from '../lib/config-resolver.mjs';

test('createConfigResolver', async (t) => {
  await t.test('returns defaults when no inputs', () => {
    const resolver = createConfigResolver();
    assert.strictEqual(resolver.resolve('logLevel'), 'info');
    assert.strictEqual(resolver.getSource('logLevel'), 'default');
    assert.strictEqual(resolver.resolve('runtimeRoot'), undefined);
    assert.strictEqual(resolver.getSource('runtimeRoot'), 'none');
  });

  await t.test('CLI overrides everything', () => {
    const resolver = createConfigResolver({
      cliArgs: { logLevel: 'debug' },
      env: { REMPEYEK_LOG_LEVEL: 'warn' },
      configDir: '/fake/dir'
    });
    assert.strictEqual(resolver.resolve('logLevel'), 'debug');
    assert.strictEqual(resolver.getSource('logLevel'), 'cli');
  });

  await t.test('env overrides user config', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-'));
    fs.writeFileSync(path.join(tempDir, 'runtime.json'), JSON.stringify({ logLevel: 'error' }));

    const resolver = createConfigResolver({
      env: { REMPEYEK_LOG_LEVEL: 'warn' },
      configDir: tempDir
    });

    assert.strictEqual(resolver.resolve('logLevel'), 'warn');
    assert.strictEqual(resolver.getSource('logLevel'), 'env');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('user config overrides defaults', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rempeyek-'));
    fs.writeFileSync(path.join(tempDir, 'runtime.json'), JSON.stringify({ logLevel: 'error' }));

    const resolver = createConfigResolver({
      configDir: tempDir
    });

    assert.strictEqual(resolver.resolve('logLevel'), 'error');
    assert.strictEqual(resolver.getSource('logLevel'), 'user-config');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('boolean env parsing handles truthy values', () => {
    const resolver = createConfigResolver({
      env: { REMPEYEK_DISABLE_OBSIDIAN: 'yes' }
    });
    assert.strictEqual(resolver.resolve('disableObsidian'), true);
  });

  await t.test('missing config file handled gracefully', () => {
    const resolver = createConfigResolver({
      configDir: '/does/not/exist'
    });
    assert.strictEqual(resolver.resolve('logLevel'), 'info');
    assert.strictEqual(resolver.getSource('logLevel'), 'default');
  });

  await t.test('resolveAll and getAllSources work', () => {
    const resolver = createConfigResolver({
      cliArgs: { port: 8080 },
      env: { REMPEYEK_LOG_LEVEL: 'debug' }
    });

    const all = resolver.resolveAll();
    const sources = resolver.getAllSources();

    assert.strictEqual(all.port, 8080);
    assert.strictEqual(all.logLevel, 'debug');
    assert.strictEqual(all.mode, 'installed');

    assert.strictEqual(sources.port, 'cli');
    assert.strictEqual(sources.logLevel, 'env');
    assert.strictEqual(sources.mode, 'default');
  });
});
