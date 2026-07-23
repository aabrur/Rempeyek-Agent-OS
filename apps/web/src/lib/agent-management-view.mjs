const RETAINED = Object.freeze([
  "vault",
  "telemetry",
  "activity",
  "workflows",
  "logs",
  "credentials",
  "software",
  "user files",
]);

export function agentManagementRows(lifecycle = []) {
  return lifecycle.map(agent => {
    const actions = [];
    if (agent.profile !== "absent") {
      actions.push("edit");
      actions.push(agent.profile === "disabled" ? "enable" : "disable");
      if (!agent.active) actions.push("activate");
      actions.push("remove");
    }
    if (agent.uninstallable !== false && agent.software === "installed") {
      actions.push("uninstall");
    }
    return {
      ...agent,
      badges: [agent.software, agent.profile],
      actions,
    };
  });
}

export function removalImpact(agent = {}, children = []) {
  return {
    agentId: agent.id || "",
    name: agent.name || agent.id || "",
    retained: [...RETAINED],
    childIds: children.map(child => child.id),
  };
}
