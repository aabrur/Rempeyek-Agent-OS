const BASE_NAMES = [
  "PATH", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP",
  "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "NODE_PATH",
  "TERM", "COLORTERM", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
];
const NEVER_FORWARD = new Set(["DASH_TOKEN", "DASH_REMOTE", "DASH_ALLOWED_ORIGINS", "VAULT_PATH", "AGENTS_CONFIG", "AGENT_STATE_DIR"]);
const DEFAULT_PROVIDER_ENV = {
  "claude-code": ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
  codex: ["OPENAI_API_KEY"],
  antigravity: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  hermes: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
};

function buildAgentEnv(agent = {}, sourceEnv = process.env, workdir = "") {
  const sourceKeys = new Map(Object.keys(sourceEnv).map(key => [key.toUpperCase(), key]));
  const requested = new Set([
    ...BASE_NAMES,
    ...(DEFAULT_PROVIDER_ENV[agent.id] || []),
    ...(Array.isArray(agent.gateway?.envAllow) ? agent.gateway.envAllow : []),
  ]);
  const result = {};
  for (const requestedName of requested) {
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(requestedName)) continue;
    const upper = requestedName.toUpperCase();
    if (NEVER_FORWARD.has(upper)) continue;
    const sourceKey = sourceKeys.get(upper);
    if (sourceKey && sourceEnv[sourceKey] !== undefined) result[sourceKey] = sourceEnv[sourceKey];
  }
  result.AGENT_WORKDIR = workdir;
  return result;
}

module.exports = { buildAgentEnv };
