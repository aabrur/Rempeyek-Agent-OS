export function filterMarketplace(entries = [], kind = "all") {
  return entries
    .filter(entry => kind === "all" || entry.kind === kind)
    .sort((a, b) =>
      Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
    );
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
