import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  logLevel: 'info',
  updateChannel: 'stable',
  disableObsidian: false,
  port: 3456,
  mode: 'installed'
};

const ENV_MAP = {
  runtimeRoot: ['REMPEYEK_RUNTIME_ROOT', 'AGENT_STATE_DIR'],
  vaultPath: ['REMPEYEK_VAULT_PATH', 'VAULT_PATH'],
  skillsPath: ['REMPEYEK_SKILLS_PATH'],
  logLevel: ['REMPEYEK_LOG_LEVEL'],
  updateChannel: ['REMPEYEK_UPDATE_CHANNEL'],
  disableObsidian: ['REMPEYEK_DISABLE_OBSIDIAN'],
  port: ['PORT'],
  mode: ['REMPEYEK_MODE']
};

export function createConfigResolver({ cliArgs = {}, env = process.env, configDir } = {}) {
  let userConfig = {};

  if (configDir) {
    try {
      const configPath = path.join(configDir, 'runtime.json');
      if (fs.existsSync(configPath)) {
        userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (e) {
      // Gracefully ignore errors if the config file does not exist or is invalid
    }
  }

  const isTruthy = (val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
  };

  const getEnvValue = (key) => {
    const envVars = ENV_MAP[key];
    if (!envVars) return undefined;

    for (const envVar of envVars) {
      if (env[envVar] !== undefined) {
        if (key === 'disableObsidian') return isTruthy(env[envVar]);
        if (key === 'port') return parseInt(env[envVar], 10) || env[envVar];
        return env[envVar];
      }
    }
    return undefined;
  };

  const keys = Object.keys(ENV_MAP);

  const resolveItem = (key) => {
    if (cliArgs[key] !== undefined) return { value: cliArgs[key], source: 'cli' };

    const envValue = getEnvValue(key);
    if (envValue !== undefined) return { value: envValue, source: 'env' };

    if (userConfig[key] !== undefined) return { value: userConfig[key], source: 'user-config' };

    if (DEFAULTS[key] !== undefined) return { value: DEFAULTS[key], source: 'default' };

    return { value: undefined, source: 'none' };
  };

  return {
    resolve(key) {
      return resolveItem(key).value;
    },
    resolveAll() {
      const all = {};
      for (const key of keys) {
        const val = this.resolve(key);
        if (val !== undefined) {
          all[key] = val;
        }
      }
      return all;
    },
    getSource(key) {
      return resolveItem(key).source;
    },
    getAllSources() {
      const sources = {};
      for (const key of keys) {
        sources[key] = this.getSource(key);
      }
      return sources;
    }
  };
}
