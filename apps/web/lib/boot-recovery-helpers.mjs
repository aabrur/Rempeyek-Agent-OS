export function scrubWebSensitiveData(text, userHome = "") {
  if (typeof text !== "string") text = String(text ?? "");
  let cleaned = text;

  if (userHome && userHome.length > 2) {
    const normalizedHome = userHome.replace(/\\/g, "/");
    const escapedHome = normalizedHome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escapedHome.replace(/\//g, "[/\\\\]+"), "gi");
    cleaned = cleaned.replace(pattern, "[REDACTED_PATH]");
  }

  cleaned = cleaned.replace(/x-desktop-session=[^\s&]+/gi, "x-desktop-session=[REDACTED_TOKEN]");
  cleaned = cleaned.replace(/dashToken=[^\s&]+/gi, "dashToken=[REDACTED_TOKEN]");
  cleaned = cleaned.replace(/desktopToken=[^\s&]+/gi, "desktopToken=[REDACTED_TOKEN]");

  cleaned = cleaned.replace(/\b(sk-proj-[a-zA-Z0-9_-]+)\b/g, "[REDACTED_API_KEY]");
  cleaned = cleaned.replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_API_KEY]");
  cleaned = cleaned.replace(/\b(AIzaSy[a-zA-Z0-9_-]{33})\b/g, "[REDACTED_API_KEY]");
  cleaned = cleaned.replace(/\b(ghp_[a-zA-Z0-9]{36})\b/g, "[REDACTED_API_KEY]");
  cleaned = cleaned.replace(/\b([0-9a-fA-F]{32}|[0-9a-fA-F]{64})\b/g, "[REDACTED_TOKEN]");

  return cleaned;
}

export function formatUserSafeErrorMessage(error, userHome = "") {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "Unknown workspace error");
  return scrubWebSensitiveData(rawMessage, userHome);
}

export function evaluateBootPhaseStatus(phase = "initializing") {
  const phases = {
    initializing: { shell: "ok", service: "pending", renderer: "pending", bundle: "pending", api: "pending" },
    "did-finish-load": { shell: "ok", service: "ok", renderer: "ok", bundle: "pending", api: "pending" },
    "renderer-init": { shell: "ok", service: "ok", renderer: "ok", bundle: "pending", api: "pending" },
    "bundle-evaluated": { shell: "ok", service: "ok", renderer: "ok", bundle: "ok", api: "pending" },
    "react-mounted": { shell: "ok", service: "ok", renderer: "ok", bundle: "ok", api: "pending" },
    "app-ready": { shell: "ok", service: "ok", renderer: "ok", bundle: "ok", api: "ok" },

    "server-failed": { shell: "ok", service: "error", renderer: "pending", bundle: "pending", api: "pending" },
    "did-fail-load": { shell: "ok", service: "error", renderer: "error", bundle: "pending", api: "pending" },
    "bundle-evaluation-failed": { shell: "ok", service: "ok", renderer: "ok", bundle: "error", api: "pending" },
    "api-failed": { shell: "ok", service: "ok", renderer: "ok", bundle: "ok", api: "error" },
  };

  return phases[phase] || { shell: "ok", service: "ok", renderer: "error", bundle: "error", api: "pending" };
}
