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

export function isAllowedIpcSender(event, origin) {
  if (!event || typeof origin !== "string" || !origin) return false;
  if (event.senderFrame) {
    if (typeof event.senderFrame.origin === "string" && event.senderFrame.origin.length > 0) {
      return event.senderFrame.origin === origin;
    }
    if (typeof event.senderFrame.url === "string" && event.senderFrame.url.length > 0) {
      return isAllowedLocalNavigation(event.senderFrame.url, origin);
    }
    return false;
  }
  if (typeof event.sender?.getURL === "function") {
    const senderUrl = event.sender.getURL();
    if (typeof senderUrl === "string" && senderUrl.length > 0) {
      return isAllowedLocalNavigation(senderUrl, origin);
    }
  }
  return false;
}

export function assertTrustedIpcSender(event, origin) {
  if (!origin || !isAllowedIpcSender(event, origin)) {
    throw new Error("unauthorized IPC sender");
  }
}

