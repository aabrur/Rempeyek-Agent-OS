import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isPathAllowed,
  resolveCanonicalPath,
  resolveRealPath,
  isSymlinkSafe,
  DENIED_SENSITIVE_PATTERNS,
  getDefaultSystemPaths
} from '../lib/access-policy-engine.mjs';

describe('Security Hardening', () => {
  describe('DENIED_SENSITIVE_PATTERNS expansion', () => {
    const sensitiveTestPaths = [
      // Original patterns
      'C:\\Users\\test\\.ssh\\id_rsa',
      'C:\\Users\\test\\.gnupg\\pubring.kbx',
      'C:\\Users\\test\\AppData\\Local\\Google\\Chrome\\User Data\\Default',
      // New wallet/crypto patterns
      'C:\\Users\\test\\.ethereum\\keystore',
      'C:\\Users\\test\\.bitcoin\\wallet.dat',
      'C:\\Users\\test\\.solana\\id.json',
      'C:\\Users\\test\\seed.txt',
      'C:\\Users\\test\\docs\\mnemonic.txt',
      // New password manager patterns
      'C:\\Users\\test\\.password-store\\github.gpg',
      'C:\\Users\\test\\passwords.kdbx',
      // New cloud credential patterns
      'C:\\Users\\test\\.aws\\credentials',
      'C:\\Users\\test\\.azure\\config',
      'C:\\Users\\test\\.gcloud\\credentials.json',
      // New browser patterns
      'C:\\Users\\test\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data',
      'C:\\Users\\test\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\abc123',
      // OS credential store
      'C:\\Users\\test\\AppData\\Local\\Microsoft\\Vault\\data'
    ];

    for (const testPath of sensitiveTestPaths) {
      it(`should deny: ${testPath}`, () => {
        const result = isPathAllowed(testPath);
        assert.strictEqual(result.allowed, false, `Expected ${testPath} to be denied`);
      });
    }
  });

  describe('Safe paths should be allowed', () => {
    const safePaths = [
      'C:\\Users\\test\\Documents\\project\\README.md',
      'C:\\Users\\test\\Documents\\code\\index.js',
      'C:\\projects\\my-app\\src\\App.tsx'
    ];

    for (const testPath of safePaths) {
      it(`should allow: ${testPath}`, () => {
        const result = isPathAllowed(testPath);
        assert.strictEqual(result.allowed, true, `Expected ${testPath} to be allowed`);
      });
    }
  });

  describe('resolveCanonicalPath', () => {
    it('should normalize path', () => {
      const result = resolveCanonicalPath('C:\\Users\\test\\..\\test\\Documents');
      assert.ok(result.includes('test'));
      assert.ok(!result.includes('..'));
    });

    it('should return empty for null', () => {
      assert.strictEqual(resolveCanonicalPath(null), '');
    });

    it('should use Windows canonicalization for Windows input on Ubuntu', () => {
      assert.strictEqual(
        resolveCanonicalPath('C:\\Users\\test\\..\\test\\Documents', 'linux'),
        'C:\\Users\\test\\Documents'
      );
    });

    it('should use path.win32 for injected Windows platform', () => {
      const paths = getDefaultSystemPaths({ USERPROFILE: 'C:\\Users\\test' }, 'win32');
      assert.strictEqual(paths.runtimeRoot, 'C:\\Users\\test\\AppData\\Local\\Rempeyek-Agent-OS');
      assert.strictEqual(paths.sharedVault, 'C:\\Users\\test\\AppData\\Local\\Rempeyek-Agent-OS\\Vault');
    });

    it('should use POSIX paths for injected Ubuntu platform', () => {
      const paths = getDefaultSystemPaths({ USERPROFILE: '/home/test' }, 'linux');
      assert.strictEqual(paths.runtimeRoot, '/home/test/AppData/Local/Rempeyek-Agent-OS');
    });
  });

  describe('resolveRealPath', () => {
    it('should return empty for null', () => {
      assert.strictEqual(resolveRealPath(null), '');
    });

    it('should resolve non-existent paths to absolute', () => {
      const result = resolveRealPath('C:\\Users\\test\\nonexistent');
      assert.ok(result.includes('nonexistent'));
    });
  });

  describe('isSymlinkSafe', () => {
    it('should return unsafe for empty path', () => {
      const result = isSymlinkSafe('');
      assert.strictEqual(result.safe, false);
    });

    it('should return safe for regular file/dir', () => {
      // os.tmpdir() should be a real directory
      const result = isSymlinkSafe(process.cwd());
      assert.strictEqual(result.safe, true);
    });
  });

  describe('getDefaultSystemPaths', () => {
    it('should support REMPEYEK_RUNTIME_ROOT env var', () => {
      const paths = getDefaultSystemPaths({ REMPEYEK_RUNTIME_ROOT: 'C:\\custom\\root' });
      assert.strictEqual(paths.runtimeRoot, 'C:\\custom\\root');
    });

    it('should support REMPEYEK_VAULT_PATH env var', () => {
      const paths = getDefaultSystemPaths({ REMPEYEK_VAULT_PATH: 'D:\\my-vault' });
      assert.strictEqual(paths.sharedVault, 'D:\\my-vault');
    });

    it('should support REMPEYEK_SKILLS_PATH env var', () => {
      const paths = getDefaultSystemPaths({ REMPEYEK_SKILLS_PATH: 'D:\\skills' });
      assert.strictEqual(paths.centralSkillsWarehouse, 'D:\\skills');
    });

    it('should include new dirs (backups, cache, temp, updates, packages)', () => {
      const paths = getDefaultSystemPaths({});
      assert.ok(paths.backupsDir);
      assert.ok(paths.cacheDir);
      assert.ok(paths.tempDir);
      assert.ok(paths.updatesDir);
      assert.ok(paths.packagesDir);
    });
  });

  describe('Access policy enforcement', () => {
    it('should deny paths in explicitly denied roots', () => {
      const result = isPathAllowed('C:\\secret\\data.json', {
        denied_roots: ['C:\\secret']
      });
      assert.strictEqual(result.allowed, false);
    });

    it('should deny paths not in allowed roots when specified', () => {
      const result = isPathAllowed('C:\\outside\\data.json', {
        allowed_roots: ['C:\\inside']
      });
      assert.strictEqual(result.allowed, false);
    });

    it('should allow paths in allowed roots', () => {
      const result = isPathAllowed('C:\\inside\\data.json', {
        allowed_roots: ['C:\\inside']
      });
      assert.strictEqual(result.allowed, true);
    });
  });
});
