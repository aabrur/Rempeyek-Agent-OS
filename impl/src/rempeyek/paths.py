"""Canonical Windows-safe runtime path resolution for Rempeyek Agent OS.

No hardcoded usernames. Home / LocalAppData resolved dynamically.
Overridable via REMPEYEK_ROOT env var (used by tests).
"""

from __future__ import annotations

import os
from pathlib import Path


def _local_appdata() -> Path:
    lad = os.environ.get("LOCALAPPDATA")
    if lad:
        return Path(lad)
    return Path.home() / "AppData" / "Local"


def runtime_root() -> Path:
    override = os.environ.get("REMPEYEK_ROOT")
    if override:
        return Path(override).resolve()
    return (_local_appdata() / "Rempeyek-Agent-OS").resolve()


def vault_root() -> Path:
    return runtime_root() / "Vault"


def agents_root() -> Path:
    return runtime_root() / "Agents"


def config_root() -> Path:
    return runtime_root() / "Config"


def logs_root() -> Path:
    return runtime_root() / "Logs"


def quarantine_root() -> Path:
    return runtime_root() / "Quarantine"


def skill_warehouse() -> Path:
    override = os.environ.get("REMPEYEK_SKILL_WAREHOUSE")
    if override:
        return Path(override).resolve()
    return (Path.home() / ".skills").resolve()


def graphify_root() -> Path:
    return vault_root() / ".graphify"


VAULT_DIRS = [
    "00-Inbox", "01-Daily", "02-Projects", "03-Areas", "04-Resources",
    "05-Archives", "Agents", "Memory/Shared", "Memory/Decisions",
    "Memory/Lessons", "Memory/Preferences", "Memory/Entities",
    "Memory/Procedures", "Memory/Handoffs", "Graph/Nodes", "Graph/Edges",
    "Graph/Indexes", "Graph/Reports", "Sessions/Active", "Sessions/Completed",
    "Sessions/Failed", "Skills/Registry", "Skills/Assignments",
    "Skills/Reports", "System/AI-Family", "System/Commands", "System/Schemas",
    "System/Policies", "System/Migrations", "Attachments", "Imports",
    "Quarantine", ".graphify",
]

NODE_DIRS = ["skills", "memory", "cache", "sessions", "logs", "checkpoints"]


def resolve_under(base: Path, relative: str) -> Path:
    """Canonical-resolve `relative` under `base`; raise on traversal escape."""
    base_r = base.resolve()
    target = (base_r / relative).resolve()
    if base_r != target and base_r not in target.parents:
        raise PermissionError(f"Path escape blocked: {relative!r} resolves outside {base_r}")
    return target
