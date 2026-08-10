import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function switchboardPath(telemetryDir) {
  return path.join(telemetryDir, "switchboard-messages.json");
}

export function readSwitchboardMessages(telemetryDir) {
  const file = switchboardPath(telemetryDir);
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(raw.messages) ? raw.messages : Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveSwitchboardMessages(telemetryDir, messages) {
  const file = switchboardPath(telemetryDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    messages: Array.isArray(messages) ? messages : [],
  };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
  return payload.messages;
}

export function createSwitchboardMessage({
  fromAgentId = "user",
  toAgentId,
  message,
  priority = "normal",
  now = new Date(),
} = {}) {
  const text = String(message || "").trim();
  const target = String(toAgentId || "").trim();
  if (!target || !text) {
    return { error: "toAgentId and message are required" };
  }
  return {
    id: `msg-${now.getTime()}-${crypto.randomBytes(2).toString("hex")}`,
    fromAgentId: String(fromAgentId || "user").trim() || "user",
    toAgentId: target,
    message: text.slice(0, 4000),
    priority: ["low", "normal", "high"].includes(priority) ? priority : "normal",
    status: "unread",
    timestamp: now.toISOString(),
  };
}

export function markSwitchboardRead(messages, { messageId, agentId, now = new Date() } = {}) {
  let updated = false;
  const next = (messages || []).map(item => {
    const match = (messageId && item.id === messageId)
      || (agentId && item.toAgentId === agentId && item.status !== "read");
    if (!match) return item;
    updated = true;
    return { ...item, status: "read", readAt: now.toISOString() };
  });
  return { messages: next, updated };
}

export function unreadForAgent(messages, agentId) {
  return (messages || []).filter(
    item => item.toAgentId === agentId && item.status !== "read",
  );
}

/** Resolve skill install roots for a registered agent so plugins can sync per host. */
export function agentSkillTargets(agent = {}, userHome = "") {
  const home = String(agent?.gateway?.home || "").trim();
  const id = String(agent?.id || "");
  const roots = [];
  if (home) roots.push(path.join(home, "skills"));
  // Host-specific conventional skill dirs
  if (id === "claude-code") roots.push(path.join(userHome, ".claude", "skills"));
  if (id === "codex") roots.push(path.join(userHome, ".codex", "skills"));
  if (id === "opencode") roots.push(path.join(userHome, ".opencode", "skills"));
  if (id === "cursor-agent") roots.push(path.join(userHome, ".cursor", "skills"));
  if (id === "hermes") {
    roots.push(path.join(userHome, ".hermes", "skills"));
    if (process.env.LOCALAPPDATA) {
      roots.push(path.join(process.env.LOCALAPPDATA, "hermes", "skills"));
    }
  }
  if (id === "openclaw") roots.push(path.join(userHome, ".openclaw", "skills"));
  // Always include the agents-standard warehouse
  roots.push(path.join(userHome, ".agents", "skills"));
  return [...new Set(roots.filter(Boolean))];
}
