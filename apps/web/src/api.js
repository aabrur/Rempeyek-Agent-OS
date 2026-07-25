/* API client. Never throws — always resolves to an object, {error} on failure.
   401 → the caller shows the token overlay (see App). */
let TOKEN = "";
try { TOKEN = localStorage.getItem("dashToken") || ""; } catch {}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export function setToken(t) {
  TOKEN = t || "";
  try { localStorage.setItem("dashToken", TOKEN); } catch {}
}

async function request(path, opts = {}, attempt = 0) {
  const { timeoutMs = 8000, ...init } = opts;
  try {
    const res = await fetch(path, {
      ...init,
      headers: { ...(TOKEN ? { "x-dash-token": TOKEN } : {}), ...(init.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401) {
      if (TOKEN && attempt < 1) return request(path, opts, attempt + 1);
      onUnauthorized();
      return { status: 401, body: { error: "unauthorized" } };
    }
    return { status: res.status, body: await res.json() };
  } catch (e) {
    return {
      status: 0,
      body: {
        error: e?.name === "TimeoutError"
          ? "timeout"
          : e?.message || "network error",
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
