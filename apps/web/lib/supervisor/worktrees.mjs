import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const OUTPUT_LIMIT = 2 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40,64}$/;

function identifier(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error('Invalid Supervisor worktree identifier');
  return value;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function samePath(left, right) {
  return path.relative(left, right) === '';
}

async function rejectLinks(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Symlink or junction is not allowed: ${current}`);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

function relativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\')) {
    throw new Error('Ownership paths must be nonempty repository-relative paths using forward slashes');
  }
  const normalized = value.replace(/\/+$/, '');
  if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)
    || normalized.split('/').some((part) => !part || part === '.' || part === '..' || /^\.git(?:[ .]|$)/i.test(part))
    || /[:*?\[\]]/.test(normalized)) throw new Error(`Unsafe ownership or changed path: ${value}`);
  return normalized;
}

function ownership(paths) {
  if (!Array.isArray(paths) || !paths.length) throw new Error('Writable workers require explicit ownedPaths');
  return [...new Set(paths.map((owned) => owned === '.' ? '.' : relativePath(owned)))];
}

function owns(file, ownedPaths) {
  return ownedPaths.some((owned) => owned === '.' || file === owned || file.startsWith(`${owned}/`));
}

function git(cwd, args, { env = {}, input } = {}) {
  const processEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  return new Promise((resolve, reject) => {
    const child = execFile('git', [
      '-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
      '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
      '-c', 'diff.external=', '-c', 'core.quotePath=false', ...args,
    ], {
      cwd, shell: false, windowsHide: true, timeout: 120_000,
      maxBuffer: OUTPUT_LIMIT, encoding: 'utf8',
      env: { ...processEnv, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', ...env },
    }, (error, stdout, stderr) => {
      if (error) {
        const failure = new Error(`Git ${args[0]} failed: ${(stderr || error.message).slice(0, 4000)}`);
        failure.code = error.code;
        reject(failure);
      } else resolve(stdout);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function resolveCommit(repositoryPath, baseline) {
  if (typeof baseline !== 'string' || !COMMIT_PATTERN.test(baseline)) throw new Error('A full baseline commit hash is required');
  const actual = (await git(repositoryPath, ['rev-parse', '--verify', `${baseline}^{commit}`])).trim();
  if (actual !== baseline) throw new Error('Baseline commit does not match');
  return actual;
}

/** Manages isolated checkouts without changing or cleaning the user checkout. */
export function createWorktreeManager({ root }) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Supervisor root must be an absolute path');
  const managedRoot = path.resolve(root);
  const treesRoot = path.join(managedRoot, 'worktrees');
  const recordsRoot = path.join(managedRoot, 'worktree-records');
  const temporaryRoot = path.join(managedRoot, 'worktree-temp');

  async function prepare() {
    await rejectLinks(managedRoot);
    for (const directory of [managedRoot, treesRoot, recordsRoot, temporaryRoot]) {
      await rejectLinks(directory);
      await fs.mkdir(directory, { recursive: true });
      if (!inside(managedRoot, await fs.realpath(directory))) throw new Error('Managed directory escaped storage root');
    }
  }

  async function inspect(repositoryPath) {
    if (typeof repositoryPath !== 'string' || !path.isAbsolute(repositoryPath)) throw new Error('Repository path must be absolute');
    await rejectLinks(repositoryPath);
    const canonical = await fs.realpath(repositoryPath);
    const repository = (await git(canonical, ['rev-parse', '--show-toplevel'])).trim();
    if (!samePath(canonical, await fs.realpath(repository))) throw new Error('Select the repository root, not a subdirectory');
    await rejectLinks(path.join(canonical, '.git'));
    const baseline = (await git(canonical, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
    const branch = (await git(canonical, ['branch', '--show-current'])).trim();
    const tracked = await git(canonical, ['diff', '--name-only', '--no-renames', '-z', baseline, '--']);
    const staged = await git(canonical, ['diff', '--cached', '--name-only', '--no-renames', '-z', baseline, '--']);
    const untracked = await git(canonical, ['ls-files', '--others', '--exclude-standard', '-z']);
    const dirtyFiles = [...new Set(`${tracked}${staged}${untracked}`.split('\0').filter(Boolean))];
    return { repositoryPath: canonical, baseline, branch, dirty: dirtyFiles.length > 0, dirtyFiles };
  }

  async function create({ runId, unitId, repositoryPath, baseline }) {
    identifier(runId);
    identifier(unitId);
    await prepare();
    const repository = await inspect(repositoryPath);
    await resolveCommit(repository.repositoryPath, baseline);
    if (inside(repository.repositoryPath, treesRoot)) throw new Error('Managed worktrees must live outside the source repository');
    const parent = path.join(treesRoot, runId);
    const target = path.join(parent, unitId);
    const recordDirectory = path.join(recordsRoot, runId);
    await rejectLinks(parent);
    await rejectLinks(recordDirectory);
    await fs.mkdir(parent, { recursive: true });
    await fs.mkdir(recordDirectory, { recursive: true });
    const recordPath = path.join(recordDirectory, `${unitId}.json`);
    // An exclusive reservation prevents concurrent calls from sharing a writable checkout.
    const reservation = await fs.open(recordPath, 'wx');
    try {
      await rejectLinks(target);
      const branch = `codex/supervisor/${runId}/${unitId}`;
      await git(repository.repositoryPath, ['worktree', 'add', '-b', branch, '--', target, baseline]);
      const canonical = await fs.realpath(target);
      if (!inside(treesRoot, canonical)) throw new Error('Created worktree escaped the managed root');
      const gitDir = (await git(canonical, ['rev-parse', '--absolute-git-dir'])).trim();
      const commonDir = (await git(repository.repositoryPath, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
      await rejectLinks(gitDir);
      await rejectLinks(commonDir);
      if (!inside(path.join(commonDir, 'worktrees'), gitDir)) throw new Error('Unexpected worktree Git metadata location');
      const record = { path: canonical, branch, baseline, repositoryPath: repository.repositoryPath, gitDir, commonDir };
      await reservation.writeFile(JSON.stringify(record));
      return { path: canonical, branch, baseline };
    } finally {
      await reservation.close();
    }
  }

  async function validate(worktreePath, baseline) {
    await prepare();
    if (typeof worktreePath !== 'string' || !path.isAbsolute(worktreePath)) throw new Error('Worktree path must be absolute');
    await rejectLinks(worktreePath);
    const canonical = await fs.realpath(worktreePath);
    if (!inside(treesRoot, canonical) || samePath(treesRoot, canonical)) throw new Error('Worktree is outside Supervisor storage');
    const segments = path.relative(treesRoot, canonical).split(path.sep);
    if (segments.length !== 2) throw new Error('Invalid managed worktree location');
    const [runId, unitId] = segments.map(identifier);
    const recordPath = path.join(recordsRoot, runId, `${unitId}.json`);
    await rejectLinks(recordPath);
    const record = JSON.parse(await fs.readFile(recordPath, 'utf8'));
    if (!samePath(record.path, canonical) || record.baseline !== baseline) throw new Error('Worktree does not match its Supervisor record');
    await rejectLinks(path.join(canonical, '.git'));
    await rejectLinks(record.gitDir);
    await rejectLinks(record.commonDir);
    const gitPointer = await fs.readFile(path.join(canonical, '.git'), 'utf8');
    if (!gitPointer.startsWith('gitdir: ') || !samePath(path.resolve(canonical, gitPointer.slice(8).trim()), record.gitDir)) {
      throw new Error('Worktree Git pointer was redirected');
    }
    await rejectLinks(path.join(record.gitDir, 'commondir'));
    await rejectLinks(path.join(record.commonDir, 'config'));
    const commonPointer = await fs.readFile(path.join(record.gitDir, 'commondir'), 'utf8');
    if (!samePath(path.resolve(record.gitDir, commonPointer.trim()), record.commonDir)) throw new Error('Worktree shared Git pointer was redirected');
    const gitDir = (await git(canonical, ['rev-parse', '--absolute-git-dir'])).trim();
    const commonDir = (await git(canonical, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
    if (!samePath(gitDir, record.gitDir) || !samePath(commonDir, record.commonDir)) throw new Error('Worktree Git metadata was redirected');
    await resolveCommit(canonical, baseline);
    return record;
  }

  async function collect({ path: worktreePath, baseline, ownedPaths }) {
    const record = await validate(worktreePath, baseline);
    const declared = ownership(ownedPaths);
    for (const owned of declared) await rejectLinks(path.join(record.path, owned));
    const candidatePaths = [...new Set((await git(record.path, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))];
    const violations = [];
    for (const file of candidatePaths) {
      try {
        relativePath(file);
        await rejectLinks(path.join(record.path, file));
      } catch (error) {
        violations.push({ path: file, reason: error.message });
      }
    }
    // Never follow a symlink or stage a submodule's independently writable checkout.
    const stagedModes = await git(record.path, ['ls-files', '--stage', '-z']);
    for (const entry of stagedModes.split('\0').filter(Boolean)) {
      if (entry.startsWith('160000 ')) violations.push({ path: entry.slice(entry.indexOf('\t') + 1), reason: 'Submodule workspaces are not supported for Supervisor workers' });
    }
    if (violations.length) return { filesChanged: [], diff: '', commit: null, violations, hasChanges: true };
    const indexPath = path.join(temporaryRoot, `${randomUUID()}.index`);
    const env = { GIT_INDEX_FILE: indexPath };
    try {
      await git(record.path, ['read-tree', baseline], { env });
      await git(record.path, ['add', '--all', '--', '.'], { env });
      const snapshotModes = await git(record.path, ['ls-files', '--stage', '-z'], { env });
      for (const entry of snapshotModes.split('\0').filter(Boolean)) {
        if (/^(120000|160000) /.test(entry)) {
          violations.push({ path: entry.slice(entry.indexOf('\t') + 1), reason: 'Symlinks and nested repositories are not supported in worker snapshots' });
        }
      }
      const filesChanged = (await git(record.path, ['diff', '--cached', '--name-only', '--no-renames', '-z', baseline, '--'], { env })).split('\0').filter(Boolean);
      for (const file of filesChanged) {
        try { relativePath(file); } catch (error) { violations.push({ path: file, reason: error.message }); }
        if (!owns(file, declared)) violations.push({ path: file, reason: 'Changed path is outside the worker ownership declaration' });
      }
      const diff = await git(record.path, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames', baseline, '--'], { env });
      const head = (await git(record.path, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
      return { filesChanged, diff, commit: head === baseline ? null : head, violations, hasChanges: filesChanged.length > 0 };
    } finally {
      await fs.unlink(indexPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      await fs.unlink(`${indexPath}.lock`).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }

  async function integrate({ runId, unitId = `integration-${randomUUID()}`, repositoryPath, baseline, workers }) {
    identifier(runId);
    identifier(unitId);
    if (!Array.isArray(workers)) throw new Error('Integration requires a worker list');
    const collected = [];
    const conflicts = [];
    for (const worker of workers) {
      identifier(worker.id);
      ownership(worker.ownedPaths);
      const record = await validate(worker.path, worker.baseline);
      if (!samePath(await fs.realpath(repositoryPath), record.repositoryPath)) throw new Error('Cannot integrate worktrees from different repositories');
      const result = await collect(worker);
      conflicts.push(...result.violations.map((violation) => ({ workerId: worker.id, ...violation })));
      collected.push({ id: worker.id, ...result });
    }
    if (conflicts.length) return { path: null, branch: null, baseline, filesChanged: [], conflicts, commit: null, artifacts: [] };
    const integration = await create({ runId, unitId, repositoryPath, baseline });
    for (const worker of collected) {
      if (!worker.hasChanges) continue;
      try {
        await git(integration.path, ['apply', '--check', '--index', '--binary', '-'], { input: worker.diff });
        await git(integration.path, ['apply', '--index', '--binary', '-'], { input: worker.diff });
      } catch (error) {
        conflicts.push({ workerId: worker.id, reason: error.message });
        break;
      }
    }
    const filesChanged = (await git(integration.path, ['diff', '--cached', '--name-only', '--no-renames', '-z', baseline, '--'])).split('\0').filter(Boolean);
    let commit = null;
    if (!conflicts.length) {
      if (filesChanged.length) {
        await git(integration.path, [
          '-c', 'user.name=Supervisor', '-c', 'user.email=supervisor@localhost',
          '-c', 'commit.gpgSign=false', 'commit', '--no-verify', '-m', `Supervisor integration ${runId}/${unitId}`,
        ]);
      }
      commit = (await git(integration.path, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
    }
    return {
      ...integration, filesChanged, conflicts, commit,
      artifacts: [{ type: 'worktree', path: integration.path, branch: integration.branch, commit }],
    };
  }

  return { inspect, create, collect, integrate };
}
