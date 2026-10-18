#!/usr/bin/env node
// Optional, static REA inspection of an existing local JavaScript build.
import { readFileSync, existsSync, realpathSync, statSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const defaults = {
  'rempeyek-agent-os': 'apps/web/dist',
  'mirror-trap-app': '.next/static'
};
const version = '6.7.0';
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const help = args.includes('--help') || args.includes('-h');

if (help) {
  console.log('Usage: node scripts/rea-inspect.mjs [--target path] [--dry-run]');
  process.exit(0);
}

const targetPos = args.indexOf('--target');
if (targetPos !== -1 && (!args[targetPos + 1] || args[targetPos + 1].startsWith('--'))) {
  throw new Error('--target requires an existing directory or .asar file');
}
const valid = args.filter((arg, i) => arg === '--dry-run' || (arg === '--target') || (targetPos >= 0 && i === targetPos + 1));
if (valid.length !== args.length) throw new Error('Unknown argument. Run --help.');
const input = targetPos >= 0 ? args[targetPos + 1] : defaults[pkg.name];
if (!input) throw new Error('No default target for this project. Pass --target.');
const candidate = isAbsolute(input) ? input : resolve(root, input);
if (!existsSync(candidate)) throw new Error('Missing build: ' + candidate + '. Build the application first.');
const target = realpathSync(candidate);
if (!statSync(target).isDirectory() && !target.toLowerCase().endsWith('.asar')) {
  throw new Error('Target must be a directory or Electron .asar file.');
}
if (process.platform === 'win32' && /[&|<>"\r\n%^!]/.test(target)) {
  throw new Error('Unsupported shell characters in Windows target path.');
}

const report = join(root, '.rea-reports', pkg.name + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
console.log('Target: ' + target);
console.log('Report: ' + report);
if (dryRun) {
  console.log('Dry run only. No REA execution.');
  process.exit(0);
}
const parts = process.versions.node.split('.').map(Number);
if (!((parts[0] === 22 && parts[1] >= 19) || (parts[0] === 24 && parts[1] >= 11) || parts[0] >= 26)) {
  throw new Error('REA requires Node.js 22.19+, 24.11+, or 26+.');
}
mkdirSync(dirname(report), { recursive: true });
const file = openSync(report, 'wx', 0o600);
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['-y', 'rea-agents@' + version, 'analyze-javascript-application', target, '--json'], {
  cwd: root, shell: process.platform === 'win32', stdio: ['ignore', file, 'inherit'], windowsHide: true
});
closeSync(file);
if (result.error || result.status !== 0) {
  unlinkSync(report);
  throw new Error('REA failed: ' + (result.error?.message || result.status));
}
try { JSON.parse(readFileSync(report, 'utf8')); } catch {
  unlinkSync(report);
  throw new Error('REA returned invalid JSON. Report discarded.');
}
console.log('REA evidence saved locally. Review/redact before sharing. Never commit .rea-reports/.');
