export function filterMarketplace(entries = [], kind = "all") {
  const rank = entry => {
    let score = Number(Boolean(entry.featured)) * 100;
    // Keep freshly curated / service gateways visible near the top.
    if (entry.id === "hypertaks-agent") score += 50;
    if (entry.id === "hermes" || entry.id === "openclaw") score += 20;
    if (entry.kind === "plugin") score += 5;
    if (entry.curatedAt) score += Math.min(10, String(entry.curatedAt).length);
    return score;
  };
  return entries
    .filter(entry => kind === "all" || entry.kind === kind)
    .sort((a, b) => rank(b) - rank(a) || String(a.name).localeCompare(String(b.name)));
}

export function marketplaceAction(entry, operationState = {}) {
  if (operationState.runningId) {
    return {
      kind: "state",
      label: operationState.runningId === entry.id ? "installing…" : "-",
      adapterId: null,
    };
  }
  if (entry.installed && entry.kind === "agent" && !entry.registered) {
    return { kind: "register", label: "Register to Rempeyek Agent OS", adapterId: null };
  }
  if (entry.installed && (entry.kind !== "agent" || entry.registered)) {
    return { kind: "state", label: "✓ ready", adapterId: null };
  }
  const manualAdapter = entry.adapterIds?.find(id => id === "official-url" || id === "wsl-only");
  if (manualAdapter || (!entry.adapterIds?.length && entry.officialUrl)) {
    return {
      kind: "manual",
      label: "Open install guide",
      adapterId: manualAdapter || null,
      url: entry.officialUrl,
    };
  }
  if (entry.adapterIds?.length) {
    return {
      kind: "install",
      label: entry.kind === "agent" && !entry.registered
        ? "Install + register"
        : "Install",
      adapterId: entry.adapterIds[0],
    };
  }
  if (entry.kind === "agent" && !entry.registered) {
    return { kind: "register", label: "Register to Rempeyek Agent OS", adapterId: null };
  }
  return {
    kind: "state",
    label: entry.registered ? "registered" : "manual setup required",
    adapterId: null,
  };
}
