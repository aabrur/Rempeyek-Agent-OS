"""Command Adapters for Rempeyek Agent OS built-in agents.

Maps specific capabilities, binary candidates, runtime types (task, service, hybrid),
and native commands per agent, avoiding naive generic <binary> <action> execution.
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class CommandAdapter:
    agent_id: str
    display_name: str
    runtime_type: str  # "task", "service", or "hybrid"
    binary_candidates: list[str]
    summon_command: list[str]
    gateway_run_command: list[str]
    version_command: list[str]
    native_stop: Optional[list[str]] = None
    native_logs: Optional[list[str]] = None
    native_status: Optional[list[str]] = None
    auth_check: Optional[list[str]] = None
    health_check: Optional[list[str]] = None
    windows_support: bool = True
    wsl_fallback: bool = False
    verified: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


# Registry of all 21 built-in agent adapters
ADAPTERS: dict[str, CommandAdapter] = {
    "hermes": CommandAdapter(
        agent_id="hermes",
        display_name="Hermes",
        runtime_type="service",
        binary_candidates=["hermes.cmd", "hermes-agent.exe", "hermes.exe", "hermes"],
        summon_command=["hermes.cmd"],
        gateway_run_command=["hermes.cmd", "gateway", "run"],
        native_stop=["hermes.cmd", "gateway", "stop"],
        native_logs=["hermes.cmd", "gateway", "logs"],
        native_status=["hermes.cmd", "gateway", "status"],
        version_command=["hermes.cmd", "--version"],
        verified=False,
    ),
    "openclaw": CommandAdapter(
        agent_id="openclaw",
        display_name="OpenClaw",
        runtime_type="service",
        binary_candidates=["openclaw.cmd", "openclaw.exe", "openclaw"],
        summon_command=["openclaw.cmd"],
        gateway_run_command=["openclaw.cmd", "gateway", "run"],
        native_stop=["openclaw.cmd", "gateway", "stop"],
        native_logs=["openclaw.cmd", "gateway", "logs"],
        native_status=["openclaw.cmd", "gateway", "status"],
        version_command=["openclaw.cmd", "--version"],
        verified=False,
    ),
    "antigravity": CommandAdapter(
        agent_id="antigravity",
        display_name="Antigravity",
        runtime_type="task",
        binary_candidates=["agy.cmd", "agy.exe", "agy", "antigravity"],
        summon_command=["agy.cmd"],
        gateway_run_command=["agy.cmd"],
        version_command=["agy.cmd", "--version"],
        verified=True,
    ),
    "cline": CommandAdapter(
        agent_id="cline",
        display_name="Cline",
        runtime_type="task",
        binary_candidates=["cline.cmd", "cline.exe", "cline"],
        summon_command=["cline.cmd"],
        gateway_run_command=["cline.cmd"],
        version_command=["cline.cmd", "--version"],
        verified=False,
    ),
    "codex": CommandAdapter(
        agent_id="codex",
        display_name="Codex",
        runtime_type="task",
        binary_candidates=["codex.cmd", "codex.exe", "codex"],
        summon_command=["codex.cmd"],
        gateway_run_command=["codex.cmd"],
        version_command=["codex.cmd", "--version"],
        verified=False,
    ),
    "claude-code": CommandAdapter(
        agent_id="claude-code",
        display_name="Claude Code",
        runtime_type="task",
        binary_candidates=["claude.cmd", "claude.exe", "claude"],
        summon_command=["claude.cmd"],
        gateway_run_command=["claude.cmd"],
        version_command=["claude.cmd", "--version"],
        verified=False,
    ),
    "github-copilot-cli": CommandAdapter(
        agent_id="github-copilot-cli",
        display_name="GitHub Copilot CLI",
        runtime_type="task",
        binary_candidates=["copilot.cmd", "copilot.exe", "copilot", "gh.exe", "gh"],
        summon_command=["copilot.cmd"],
        gateway_run_command=["copilot.cmd"],
        version_command=["copilot.cmd", "--version"],
        verified=False,
    ),
    "opencode": CommandAdapter(
        agent_id="opencode",
        display_name="OpenCode",
        runtime_type="task",
        binary_candidates=["opencode.cmd", "opencode.exe", "opencode"],
        summon_command=["opencode.cmd"],
        gateway_run_command=["opencode.cmd"],
        version_command=["opencode.cmd", "--version"],
        verified=False,
    ),
    "qwen-code": CommandAdapter(
        agent_id="qwen-code",
        display_name="Qwen Code",
        runtime_type="task",
        binary_candidates=["qwen.cmd", "qwen.exe", "qwen"],
        summon_command=["qwen.cmd"],
        gateway_run_command=["qwen.cmd"],
        version_command=["qwen.cmd", "--version"],
        verified=False,
    ),
    "aider": CommandAdapter(
        agent_id="aider",
        display_name="Aider",
        runtime_type="task",
        binary_candidates=["aider.cmd", "aider.exe", "aider"],
        summon_command=["aider.cmd"],
        gateway_run_command=["aider.cmd"],
        version_command=["aider.cmd", "--version"],
        verified=False,
    ),
    "goose": CommandAdapter(
        agent_id="goose",
        display_name="Goose",
        runtime_type="task",
        binary_candidates=["goose.cmd", "goose.exe", "goose"],
        summon_command=["goose.cmd"],
        gateway_run_command=["goose.cmd"],
        version_command=["goose.cmd", "--version"],
        verified=False,
    ),
    "openhands": CommandAdapter(
        agent_id="openhands",
        display_name="OpenHands",
        runtime_type="task",
        binary_candidates=["openhands.cmd", "openhands.exe", "openhands"],
        summon_command=["openhands.cmd"],
        gateway_run_command=["openhands.cmd"],
        version_command=["openhands.cmd", "--version"],
        verified=False,
    ),
    "mistral-vibe": CommandAdapter(
        agent_id="mistral-vibe",
        display_name="Mistral Vibe",
        runtime_type="task",
        binary_candidates=["vibe.cmd", "vibe.exe", "vibe"],
        summon_command=["vibe.cmd"],
        gateway_run_command=["vibe.cmd"],
        version_command=["vibe.cmd", "--version"],
        verified=False,
    ),
    "cursor-agent": CommandAdapter(
        agent_id="cursor-agent",
        display_name="Cursor Agent",
        runtime_type="task",
        binary_candidates=["cursor.cmd", "cursor.exe", "cursor"],
        summon_command=["cursor.cmd"],
        gateway_run_command=["cursor.cmd"],
        version_command=["cursor.cmd", "--version"],
        verified=False,
    ),
    "crush": CommandAdapter(
        agent_id="crush",
        display_name="Crush",
        runtime_type="task",
        binary_candidates=["crush.cmd", "crush.exe", "crush"],
        summon_command=["crush.cmd"],
        gateway_run_command=["crush.cmd"],
        version_command=["crush.cmd", "--version"],
        verified=False,
    ),
    "crimson-odyssey": CommandAdapter(
        agent_id="crimson-odyssey",
        display_name="Crimson Odyssey",
        runtime_type="task",
        binary_candidates=["crimson.cmd", "crimson.exe", "crimson"],
        summon_command=["crimson.cmd"],
        gateway_run_command=["crimson.cmd"],
        version_command=["crimson.cmd", "--version"],
        verified=False,
    ),
    "kimi-code": CommandAdapter(
        agent_id="kimi-code",
        display_name="Kimi Code",
        runtime_type="task",
        binary_candidates=["kimi.cmd", "kimi.exe", "kimi"],
        summon_command=["kimi.cmd"],
        gateway_run_command=["kimi.cmd"],
        version_command=["kimi.cmd", "--version"],
        verified=False,
    ),
    "kilo-code": CommandAdapter(
        agent_id="kilo-code",
        display_name="Kilo Code",
        runtime_type="task",
        binary_candidates=["kilo.cmd", "kilo.exe", "kilo"],
        summon_command=["kilo.cmd"],
        gateway_run_command=["kilo.cmd"],
        version_command=["kilo.cmd", "--version"],
        verified=False,
    ),
    "pi": CommandAdapter(
        agent_id="pi",
        display_name="Pi",
        runtime_type="task",
        binary_candidates=["pi.cmd", "pi.exe", "pi"],
        summon_command=["pi.cmd"],
        gateway_run_command=["pi.cmd"],
        version_command=["pi.cmd", "--version"],
        verified=False,
    ),
    "grok-build": CommandAdapter(
        agent_id="grok-build",
        display_name="Grok Build",
        runtime_type="task",
        binary_candidates=["grok.cmd", "grok.exe", "grok"],
        summon_command=["grok.cmd"],
        gateway_run_command=["grok.cmd"],
        version_command=["grok.cmd", "--version"],
        verified=False,
    ),
    "command-code": CommandAdapter(
        agent_id="command-code",
        display_name="Command Code",
        runtime_type="task",
        binary_candidates=["cmdc.cmd", "command-code.cmd", "cmdc", "command-code"],
        summon_command=["cmdc.cmd"],
        gateway_run_command=["cmdc.cmd"],
        version_command=["cmdc.cmd", "--version"],
        verified=True,
    ),
}


def get_adapter(agent_id: str) -> Optional[CommandAdapter]:
    """Retrieve command adapter for a given agent_id."""
    return ADAPTERS.get(agent_id)


def list_adapters() -> list[dict]:
    """Return all agent adapters as a list of dicts."""
    return [a.to_dict() for a in ADAPTERS.values()]


def resolve_binary(agent_id: str, workdir: Optional[str] = None) -> Optional[str]:
    """Find first valid binary path for agent_id among its binary candidates."""
    adapter = get_adapter(agent_id)
    if not adapter:
        return None

    # Check candidates in current workdir or runtime root first
    if workdir:
        for candidate in adapter.binary_candidates:
            p = os.path.join(workdir, candidate)
            if os.path.isfile(p):
                return os.path.abspath(p)

    # Search in PATH
    for candidate in adapter.binary_candidates:
        w = shutil.which(candidate)
        if w:
            return w

    return None
