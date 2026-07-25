const EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export function isAllowedExternalUrl(value) {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isAllowedLocalNavigation(value, origin) {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

export function withDesktopSessionHeader(details, origin, token) {
  const headers = { ...(details.requestHeaders || {}) };
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === "x-desktop-session") delete headers[name];
  }
  if (isAllowedLocalNavigation(details.url, origin)) {
    headers["x-desktop-session"] = token;
  }
  return headers;
}
