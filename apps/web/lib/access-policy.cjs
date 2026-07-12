const crypto = require("crypto");
const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
function equal(a, b) { a = Buffer.from(String(a || "")); b = Buffer.from(String(b || "")); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function hostname(host) { host = String(host || "").toLowerCase(); return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]; }
function createAccessPolicy(env = process.env) {
  const remote = env.DASH_REMOTE === "1", token = String(env.DASH_TOKEN || "");
  const origins = String(env.DASH_ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (remote && !token) throw new Error("DASH_REMOTE=1 requires DASH_TOKEN");
  if (remote && !origins.length) throw new Error("DASH_REMOTE=1 requires DASH_ALLOWED_ORIGINS");
  const allowedOrigins = new Set(), allowedHosts = new Set();
  for (const origin of origins) {
    let parsed; try { parsed = new URL(origin); } catch { throw new Error(`invalid DASH_ALLOWED_ORIGINS entry: ${origin}`); }
    if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin) throw new Error(`invalid DASH_ALLOWED_ORIGINS entry: ${origin}`);
    allowedOrigins.add(origin); allowedHosts.add(parsed.host.toLowerCase());
  }
  return { remote, responseHeaders: {}, authorize(req) {
    const host = String(req.headers && req.headers.host || "").toLowerCase();
    if (!host) return { allowed: false, status: 400, error: "missing Host header" };
    if (remote ? !allowedHosts.has(host) : !LOOPBACK.has(hostname(host))) return { allowed: false, status: 403, error: "Host is not allowed" };
    if (!String(req.url || "").split("?", 1)[0].startsWith("/api/")) return { allowed: true };
    if (remote && !equal(req.headers && req.headers["x-dash-token"], token)) return { allowed: false, status: 401, error: "invalid or missing dashboard token" };
    if (remote && MUTATIONS.has(String(req.method || "GET").toUpperCase()) && !allowedOrigins.has(String(req.headers && req.headers.origin || ""))) return { allowed: false, status: 403, error: "Origin is not allowed" };
    return { allowed: true };
  }};
}
module.exports = { createAccessPolicy };
