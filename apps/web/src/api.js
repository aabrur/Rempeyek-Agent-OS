/* API client. Never throws - always resolves to an object, {error} on failure.
   401 → the caller shows the token overlay (see App). */
let TOKEN = "";
try { TOKEN = localStorage.getItem("dashToken") || ""; } catch {}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export function setToken(t) {
  TOKEN = t || "";
  try { localStorage.setItem("dashToken", TOKEN); } catch {}
}

export const API_ERROR_CODES = Object.freeze({
  NETWORK_ERROR: "NETWORK_ERROR",
  SERVER_UNAVAILABLE: "SERVER_UNAVAILABLE",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_INVALID: "AUTH_INVALID",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  TIMEOUT: "TIMEOUT",
  MALFORMED_RESPONSE: "MALFORMED_RESPONSE",
  SERVER_ERROR: "SERVER_ERROR",
});

async function request(path, opts = {}, attempt = 0) {
  const { timeoutMs = 8000, maxRetries = 2, ...init } = opts;
  try {
    const res = await fetch(path, {
      ...init,
      headers: { ...(TOKEN ? { "x-dash-token": TOKEN } : {}), ...(init.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401) {
      if (TOKEN && attempt < 1) return request(path, opts, attempt + 1);
      onUnauthorized();
      return { status: 401, body: { error: "Authentication required", code: API_ERROR_CODES.AUTH_REQUIRED } };
    }
    if (res.status === 403) {
      return { status: 403, body: { error: "Access forbidden", code: API_ERROR_CODES.FORBIDDEN } };
    }
    if (res.status === 404) {
      return { status: 404, body: { error: "Resource not found", code: API_ERROR_CODES.NOT_FOUND } };
    }
    if (res.status >= 500) {
      let body;
      try { body = await res.json(); } catch { body = { error: "Server error", code: API_ERROR_CODES.SERVER_ERROR }; }
      return { status: res.status, body: { ...body, code: body.code || API_ERROR_CODES.SERVER_ERROR } };
    }
    let body;
    try {
      body = await res.json();
    } catch {
      return { status: res.status, body: { error: "Malformed server response", code: API_ERROR_CODES.MALFORMED_RESPONSE } };
    }
    return { status: res.status, body };
  } catch (e) {
    if (attempt < maxRetries && e?.name !== "TimeoutError") {
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
      return request(path, opts, attempt + 1);
    }
    const isTimeout = e?.name === "TimeoutError";
    const isOffline = e?.name === "TypeError" || String(e?.message || "").toLowerCase().includes("fetch") || String(e?.message || "").toLowerCase().includes("network") || String(e?.message || "").toLowerCase().includes("connect");
    return {
      status: 0,
      body: {
        error: isTimeout
          ? "Request timed out"
          : isOffline
            ? "Server unreachable"
            : e?.message || "Network error",
        code: isTimeout
          ? API_ERROR_CODES.TIMEOUT
          : isOffline
            ? API_ERROR_CODES.SERVER_UNAVAILABLE
            : API_ERROR_CODES.NETWORK_ERROR,
      },
    };
  }
}

export async function api(path, opts = {}, attempt = 0) {
  return (await request(path, opts, attempt)).body;
}

export function apiResponse(path, opts = {}) {
  return request(path, opts);
}

export async function getMissions(projectId) {
  return api(`/api/work/missions${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
}

export async function createMission(data) {
  return api('/api/work/missions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
}

export async function patchMission(missionId, data) {
  return api(`/api/work/missions/${encodeURIComponent(missionId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
}

export async function getCampaigns(projectId) {
  return api(`/api/social/campaigns${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
}

export async function createCampaign(data) {
  return api('/api/social/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
}

export async function scheduleCampaign(campaignId, data = {}) {
  return api(`/api/social/campaigns/${encodeURIComponent(campaignId)}/schedule`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
}

export async function publishCampaign(campaignId, data = {}) {
  return api(`/api/social/campaigns/${encodeURIComponent(campaignId)}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
}

export async function retryCampaign(campaignId, data = {}) {
  return api(`/api/social/campaigns/${encodeURIComponent(campaignId)}/retry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
}

export async function getConnectors() {
  return api('/api/social/connectors');
}

