import fs from 'node:fs';
import path from 'node:path';

export function createStartupLifecycle({ configDir, vaultPath, agentsDir }) {
  return {
    run() {
      const report = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          manifest: { status: 'ok', details: 'Manifest found' },
          permissions: { status: 'ok', details: 'Write access verified' },
          registries: { status: 'ok', details: 'All registries present' },
          sessions: { status: 'ok', interruptedCount: 0 },
          graphify: { status: 'ok' },
          memory: { status: 'ok' }
        }
      };

      try {
        const manifestPath = path.join(configDir, 'runtime-manifest.json');
        if (!fs.existsSync(manifestPath)) {
          report.checks.manifest = { status: 'missing', details: 'Manifest not found' };
          report.status = 'uninitialized';
        } else {
            try {
                JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            } catch(e) {
                report.checks.manifest = { status: 'invalid', details: 'Manifest is not valid JSON' };
                report.status = 'degraded';
            }
        }
      } catch (e) {
        report.checks.manifest = { status: 'invalid', details: e.message };
        report.status = 'degraded';
      }

      try {
        const testFile = path.join(vaultPath, '.test-write');
        fs.mkdirSync(vaultPath, { recursive: true });
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (e) {
        report.checks.permissions = { status: 'readonly', details: e.message };
        report.status = 'degraded';
      }

      const registries = ['family-registry.json', 'project-registry.json'];
      let missingRegistries = [];
      for (const reg of registries) {
        if (!fs.existsSync(path.join(configDir, reg))) {
            missingRegistries.push(reg);
        }
      }

      if (missingRegistries.length > 0) {
        report.checks.registries = { status: 'missing', details: `Missing: ${missingRegistries.join(', ')}` };
        report.status = report.status === 'uninitialized' ? 'uninitialized' : 'degraded';
      }

      const activeSessionsDir = path.join(vaultPath, 'Sessions', 'Active');
      const interruptedSessionsDir = path.join(vaultPath, 'Sessions', 'Interrupted');

      try {
        if (fs.existsSync(activeSessionsDir)) {
          const activeSessions = fs.readdirSync(activeSessionsDir);
          if (activeSessions.length > 0) {
            fs.mkdirSync(interruptedSessionsDir, { recursive: true });
            let interruptedCount = 0;
            for (const session of activeSessions) {
              const activePath = path.join(activeSessionsDir, session);
              const interruptedPath = path.join(interruptedSessionsDir, session);
              fs.renameSync(activePath, interruptedPath);
              interruptedCount++;

              // try to update status if json
              try {
                  const content = JSON.parse(fs.readFileSync(interruptedPath, 'utf8'));
                  content.status = 'interrupted';
                  fs.writeFileSync(interruptedPath, JSON.stringify(content, null, 2));
              } catch(e) {}
            }
            report.checks.sessions = { status: 'recovered', interruptedCount };
          }
        }
      } catch (e) {
          // ignore
      }

      const graphifyDir = path.join(vaultPath, '.graphify');
      const graphIndexesDir = path.join(vaultPath, 'Graph');
      if (!fs.existsSync(graphifyDir) && !fs.existsSync(graphIndexesDir)) {
          report.checks.graphify = { status: 'missing' };
      }
      const memoryDir = path.join(vaultPath, 'Memory');
      if (!fs.existsSync(memoryDir)) {
          report.checks.memory = { status: 'missing' };
      }

      return report;
    }
  };
}
