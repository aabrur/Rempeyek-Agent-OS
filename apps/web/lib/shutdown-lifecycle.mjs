import fs from 'node:fs';
import path from 'node:path';

export function createShutdownLifecycle({ configDir, vaultPath, agentsDir }) {
  return {
    run() {
      const report = {
        timestamp: new Date().toISOString(),
        interruptedSessions: 0
      };

      const activeSessionsDir = path.join(vaultPath, 'Sessions', 'Active');
      const interruptedSessionsDir = path.join(vaultPath, 'Sessions', 'Interrupted');

      try {
        if (fs.existsSync(activeSessionsDir)) {
          const activeSessions = fs.readdirSync(activeSessionsDir);
          if (activeSessions.length > 0) {
            fs.mkdirSync(interruptedSessionsDir, { recursive: true });
            for (const session of activeSessions) {
              const activePath = path.join(activeSessionsDir, session);
              const interruptedPath = path.join(interruptedSessionsDir, session);

              try {
                  const content = JSON.parse(fs.readFileSync(activePath, 'utf8'));
                  content.status = 'interrupted';
                  content.interrupted_at = report.timestamp;

                  const tmpPath = `${interruptedPath}.tmp`;
                  fs.writeFileSync(tmpPath, JSON.stringify(content, null, 2));
                  fs.renameSync(tmpPath, interruptedPath);
                  fs.unlinkSync(activePath);
              } catch (e) {
                  fs.renameSync(activePath, interruptedPath);
              }
              report.interruptedSessions++;
            }
          }
        }
      } catch (e) {
        // ignore
      }

      try {
        const manifestPath = path.join(configDir, 'runtime-manifest.json');
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            manifest.lastShutdownAt = report.timestamp;
            const tmpManifest = `${manifestPath}.tmp`;
            fs.writeFileSync(tmpManifest, JSON.stringify(manifest, null, 2));
            fs.renameSync(tmpManifest, manifestPath);
        }
      } catch (e) {
        // ignore
      }

      return report;
    }
  };
}
