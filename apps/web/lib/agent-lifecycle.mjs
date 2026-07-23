function cloneConfig(config) {
  if (!config || !Array.isArray(config.agents)) {
    throw new Error("config must contain an agents array");
  }
  return structuredClone(config);
}

export function deriveLifecycle({ entry, agent, installed, activeAgentId } = {}) {
  return {
    id: entry?.id || agent?.id || "",
    software: installed === true
      ? "installed"
      : installed === false
        ? "not_installed"
        : "unknown",
    profile: !agent
      ? "absent"
      : activeAgentId === agent.id
        ? "active"
        : agent.enabled === false
          ? "disabled"
          : "registered",
    health: "unknown",
    active: Boolean(agent && activeAgentId === agent.id),
  };
}

export function applyLifecycleChange(config, command = {}) {
  const next = cloneConfig(config);
  const agentId = String(command.id || command.agentId || "");
  const index = next.agents.findIndex(agent => agent.id === agentId);
  if (index < 0) throw new Error(`agent '${agentId}' not found`);

  const agent = next.agents[index];
  switch (command.type) {
    case "activate":
      if (!agent.enabled) throw new Error(`disabled agent '${agentId}' cannot be activated`);
      next.activeAgentId = agentId;
      break;
    case "enable":
      next.agents[index] = { ...agent, enabled: true };
      break;
    case "disable":
      next.agents[index] = { ...agent, enabled: false };
      if (next.activeAgentId === agentId) next.activeAgentId = null;
      break;
    case "edit": {
      const patch = command.patch && typeof command.patch === "object"
        ? command.patch
        : {};
      const editable = {};
      for (const field of ["name", "role", "note"]) {
        if (typeof patch[field] === "string") {
          const limit = field === "name" ? 40 : field === "role" ? 80 : 400;
          editable[field] = patch[field].trim().slice(0, limit);
        }
      }
      if ("name" in editable && !editable.name) {
        throw new Error("agent name cannot be empty");
      }
      next.agents[index] = { ...agent, ...editable };
      break;
    }
    default:
      throw new Error(`unsupported lifecycle command '${command.type || ""}'`);
  }
  return next;
}
