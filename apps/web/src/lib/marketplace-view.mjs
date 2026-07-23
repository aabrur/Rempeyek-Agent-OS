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
      label: operationState.runningId === entry.id ? "installing…" : "—",
      adapterId: null,
    };
  }
  if (entry.installed && (entry.kind !== "agent" || entry.registered)) {
    return { kind: "state", label: "✓ ready", adapterId: null };
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
  if (entry.officialUrl) {
    return { kind: "official-link", label: "Official page ↗", adapterId: null };
  }
  if (entry.kind === "agent" && !entry.registered) {
    return { kind: "register", label: "Register", adapterId: null };
  }
  return {
    kind: "state",
    label: entry.registered ? "registered" : "unavailable",
    adapterId: null,
  };
}
