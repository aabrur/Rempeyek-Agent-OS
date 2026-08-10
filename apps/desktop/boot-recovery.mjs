import crypto from "node:crypto";

export function scrubSensitiveData(text, userHome = "") {
  if (typeof text !== "string") text = String(text ?? "");
  let cleaned = text;

  if (userHome && userHome.length > 2) {
    const normalizedHome = userHome.replace(/\\/g, "/");
    const escapedHome = normalizedHome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escapedHome.replace(/\//g, "[/\\\\]+"), "gi");
    cleaned = cleaned.replace(pattern, "%USERPROFILE%");
  }

  cleaned = cleaned.replace(/x-desktop-session=[^\s&]+/gi, "x-desktop-session=[REDACTED_TOKEN]");
  cleaned = cleaned.replace(/dashToken=[^\s&]+/gi, "dashToken=[REDACTED_TOKEN]");
  cleaned = cleaned.replace(/desktopToken=[^\s&]+/gi, "desktopToken=[REDACTED_TOKEN]");

  cleaned = cleaned.replace(/\b(sk-proj-[a-zA-Z0-9_-]+)\b/g, "[REDACTED_API_KEY]");
  cleaned = cleaned.replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_API_KEY]");
  cleaned = cleaned.replace(/\b(AIzaSy[a-zA-Z0-9_-]{33})\b/g, "[REDACTED_API_KEY]");
  cleaned = cleaned.replace(/\b(ghp_[a-zA-Z0-9]{36})\b/g, "[REDACTED_API_KEY]");

  return cleaned;
}

export function createIncidentRecord({
  phase = "unknown",
  error = null,
  appVersion = "2.4.1",
  packaged = false,
  userHome = "",
  retryable = true,
  rendererState = "failed",
  localServiceState = "online",
} = {}) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const userSafeMessage = scrubSensitiveData(rawMessage, userHome);
  const incidentId = `inc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  return {
    incidentId,
    timestamp: new Date().toISOString(),
    phase,
    errorClass: error?.name || "StartupError",
    userSafeMessage,
    retryable,
    appVersion,
    packaged,
    rendererState,
    localServiceState,
  };
}

export function createBootWatchdog({
  timeoutMs = 12000,
  maxRetries = 3,
  onBootFailure = () => {},
  userHome = "",
} = {}) {
  let isAppReady = false;
  let timer = null;
  let currentPhase = "initializing";
  let retryCount = 0;

  return {
    start() {
      if (timer) clearTimeout(timer);
      isAppReady = false;
      currentPhase = "boot-watchdog-started";
      timer = setTimeout(() => {
        if (!isAppReady) {
          const incident = createIncidentRecord({
            phase: "boot-timeout",
            error: new Error(`Boot watchdog timed out after ${timeoutMs}ms at phase: ${currentPhase}`),
            userHome,
            retryable: retryCount < maxRetries,
          });
          onBootFailure(incident);
        }
      }, timeoutMs);
    },

    markPhase(phase) {
      currentPhase = phase;
    },

    notifyReady() {
      isAppReady = true;
      currentPhase = "app-ready";
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    isReady() {
      return isAppReady;
    },

    getPhase() {
      return currentPhase;
    },

    recordRetryAttempt(attempt = null) {
      if (attempt !== null) {
        retryCount = attempt;
      } else {
        retryCount += 1;
      }
      return {
        retryAllowed: retryCount <= maxRetries,
        attempt: retryCount,
      };
    },

    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
