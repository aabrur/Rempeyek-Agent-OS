/* Cosmos map iconography — one lucide glyph per known agent id.
   Unknown agents fall back to Cpu so a fresh roster never renders empty. */
import {
  Atom, Bot, BookOpen, Brain, Code2, Cpu, Sigma, Terminal, Wind, Wrench,
} from "lucide-react";

const ICONS = {
  "claude-code": Bot,
  hermes: Wind,
  openclaw: Wrench,
  codex: BookOpen,
  "kilo-code": Code2,
  cline: Terminal,
  pi: Sigma,
  antigravity: Atom,
  copilot: Bot,
};

/** The Neural Vault core node. */
export const CORE_ICON = Brain;

export function iconFor(agentId) {
  return ICONS[agentId] || Cpu;
}
