"""
Rempeyek Agent OS — Runtime paths, registry, and system init.

Resolves all canonical paths, manages the AI family registry,
and handles system initialization lifecycle.
"""

from __future__ import annotations

import json
import os
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _get_local_appdata() -> str:
    """Resolve LOCALAPPDATA or fallback."""
    return os.environ.get("LOCALAPPDATA", os.path.join(os.path.expanduser("~"), "AppData", "Local"))


def _get_user_home() -> str:
    """Resolve USERPROFILE."""
    return os.environ.get("USERPROFILE", os.path.expanduser("~"))


def runtime_root() -> str:
    """Return the canonical Rempeyek Agent OS runtime root.

    Overridable via REMPEYEK_ROOT (used by tests for isolation).
    """
    override = os.environ.get("REMPEYEK_ROOT")
    if override:
        return os.path.abspath(override)
    return os.path.join(_get_local_appdata(), "Rempeyek-Agent-OS")


def vault_root() -> str:
    """Return the canonical shared vault path."""
    return os.path.join(runtime_root(), "Vault")


def agents_root() -> str:
    """Return the canonical agents runtime state directory."""
    return os.path.join(runtime_root(), "Agents")


def config_root() -> str:
    """Return the canonical system configuration directory."""
    return os.path.join(runtime_root(), "Config")


def logs_root() -> str:
    """Return the canonical logs and audit directory."""
    return os.path.join(runtime_root(), "Logs")


def quarantine_root() -> str:
    """Return the quarantine directory for flagged files."""
    return os.path.join(runtime_root(), "Quarantine")


def skills_warehouse() -> str:
    """Return the canonical central skill warehouse path.

    Overridable via REMPEYEK_SKILL_WAREHOUSE (used by tests).
    """
    override = os.environ.get("REMPEYEK_SKILL_WAREHOUSE")
    if override:
        return os.path.abspath(override)
    return os.path.join(_get_user_home(), ".skills")


def graphify_vault_path() -> str:
    """Return the Graphify data path within the vault."""
    return os.path.join(vault_root(), ".graphify")


def family_registry_path() -> str:
    """Return the AI family registry JSON path."""
    return os.path.join(vault_root(), "System", "AI-Family", "family-registry.json")


def project_registry_path() -> str:
    """Return the project registry JSON path."""
    return os.path.join(vault_root(), "System", "project-registry.json")


# ── Directory Creation ───────────────────────────────────────────────

def ensure_directories() -> list[str]:
    """Create all required directories if they don't exist."""
    created = []
    dirs = [
        runtime_root(), vault_root(), agents_root(), config_root(),
        logs_root(), quarantine_root(),
        os.path.join(vault_root(), "00-Inbox"),
        os.path.join(vault_root(), "01-Daily"),
        os.path.join(vault_root(), "02-Projects"),
        os.path.join(vault_root(), "03-Areas"),
        os.path.join(vault_root(), "04-Resources"),
        os.path.join(vault_root(), "05-Archives"),
        os.path.join(vault_root(), "Agents"),
        os.path.join(vault_root(), "Memory", "Shared"),
        os.path.join(vault_root(), "Memory", "Decisions"),
        os.path.join(vault_root(), "Memory", "Lessons"),
        os.path.join(vault_root(), "Memory", "Preferences"),
        os.path.join(vault_root(), "Memory", "Entities"),
        os.path.join(vault_root(), "Memory", "Procedures"),
        os.path.join(vault_root(), "Memory", "Handoffs"),
        os.path.join(vault_root(), "Graph", "Nodes"),
        os.path.join(vault_root(), "Graph", "Edges"),
        os.path.join(vault_root(), "Graph", "Indexes"),
        os.path.join(vault_root(), "Graph", "Reports"),
        os.path.join(vault_root(), "Sessions", "Active"),
        os.path.join(vault_root(), "Sessions", "Completed"),
        os.path.join(vault_root(), "Sessions", "Failed"),
        os.path.join(vault_root(), "Skills", "Registry"),
        os.path.join(vault_root(), "Skills", "Assignments"),
        os.path.join(vault_root(), "Skills", "Reports"),
        os.path.join(vault_root(), "System", "AI-Family"),
        os.path.join(vault_root(), "System", "Commands"),
        os.path.join(vault_root(), "System", "Schemas"),
        os.path.join(vault_root(), "System", "Policies"),
        os.path.join(vault_root(), "System", "Migrations"),
        os.path.join(vault_root(), "Attachments"),
        os.path.join(vault_root(), "Imports"),
        os.path.join(vault_root(), "Quarantine"),
        graphify_vault_path(),
        os.path.join(vault_root(), ".obsidian"),
    ]
    for d in dirs:
        if not os.path.isdir(d):
            os.makedirs(d, exist_ok=True)
            created.append(d)
            logger.info("Created directory: %s", d)
    return created


# ── Backup Utility ──────────────────────────────────────────────────

def backup_file(path: str, backup_dir: Optional[str] = None) -> Optional[str]:
    """Create a timestamped backup of a file."""
    if not os.path.isfile(path):
        return None
    if backup_dir is None:
        backup_dir = os.path.join(vault_root(), "System", "Migrations")
    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = os.path.basename(path)
    backup_path = os.path.join(backup_dir, f"{ts}_{base}.bak")
    shutil.copy2(path, backup_path)
    logger.info("Backed up %s -> %s", path, backup_path)
    return backup_path


# ── AI Family Registry ─────────────────────────────────────────────

FAMILY_REGISTRY_SCHEMA_VERSION = 1

def _default_family_registry() -> dict:
    return {
        "schema_version": FAMILY_REGISTRY_SCHEMA_VERSION,
        "agency": "REMPEYEK AGENT OS",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "nodes": [],
    }


def load_or_create_family_registry() -> dict:
    path = family_registry_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Corrupted family registry: %s", exc)
            backup_file(path)
    reg = _default_family_registry()
    save_family_registry(reg)
    return reg


def save_family_registry(registry: dict) -> None:
    path = family_registry_path()
    tmp = path + ".tmp"
    registry["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def register_node(registry: dict, node_id: str, agent_id: str,
                  display_name: str, provider: str, role: str = "",
                  capabilities: Optional[list[str]] = None,
                  trust_level: str = "standard", status: str = "active") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    existing = next((n for n in registry["nodes"] if n["node_id"] == node_id), None)
    if existing:
        existing["last_seen_at"] = now
        existing["status"] = status
        return existing
    node = {
        "node_id": node_id, "agent_id": agent_id, "display_name": display_name,
        "provider": provider, "role": role or display_name,
        "capabilities": capabilities or [], "status": status,
        "created_at": now, "last_seen_at": now, "skills_manifest": "",
        "memory_scope": ["shared", "project", "private"],
        "trust_level": trust_level, "schema_version": FAMILY_REGISTRY_SCHEMA_VERSION,
    }
    registry["nodes"].append(node)
    save_family_registry(registry)
    return node


def migrate_from_agents_config(agents_config_path: str) -> dict:
    """Migrate legacy agents.config.json to family registry."""
    registry = load_or_create_family_registry()
    if registry["nodes"]:
        logger.info("Registry already has %d nodes", len(registry["nodes"]))
        return registry
    if not os.path.isfile(agents_config_path):
        return registry
    try:
        with open(agents_config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception as exc:
        logger.warning("Failed to read config: %s", exc)
        return registry
    provider_map = {
        "hermes": "hermes", "openclaw": "openclaw", "antigravity": "gemini",
        "cline": "claude", "codex": "openai", "claude-code": "claude",
        "github-copilot-cli": "github", "opencode": "opencode", "qwen-code": "qwen",
        "aider": "aider", "goose": "goose", "openhands": "openhands",
        "mistral-vibe": "mistral", "cursor-agent": "cursor", "crush": "crush",
        "crimson-odyssey": "crimson", "kimi-code": "moonshot", "kilo-code": "kilo",
        "pi": "pi", "grok-build": "xai", "command-code": "commandcode"
    }
    cap_map = {
        "hermes": ["research", "operations", "crypto"],
        "openclaw": ["strategy", "analysis", "business"],
        "antigravity": ["coding", "integration", "design"],
        "cline": ["coding", "implementation"],
        "codex": ["coding", "engineering", "audit"],
        "claude-code": ["coding", "technical"],
        "github-copilot-cli": ["coding", "cli"],
        "opencode": ["coding", "open-source"],
        "qwen-code": ["coding", "open-source"],
        "aider": ["coding", "pair-programming"],
        "goose": ["coding", "automation"],
        "openhands": ["coding", "engineering"],
        "mistral-vibe": ["coding", "terminal"],
        "cursor-agent": ["coding", "ide"],
        "crush": ["coding", "terminal"],
        "crimson-odyssey": ["coding", "specialized"],
        "kimi-code": ["coding", "terminal"],
        "kilo-code": ["coding", "debugging"],
        "pi": ["coding", "minimal"],
        "grok-build": ["coding", "build"],
        "command-code": ["coding", "terminal"]
    }
    for agent in config.get("agents", []):
        aid = agent.get("id", "")
        node_id = agent.get("node", f"Node-{len(registry['nodes'])+1}")
        register_node(registry, node_id=node_id, agent_id=aid,
                      display_name=agent.get("name", aid),
                      provider=provider_map.get(aid, "other"),
                      role=agent.get("role", ""), capabilities=cap_map.get(aid, ["coding"]),
                      status="active" if agent.get("enabled", False) else "inactive")
    save_family_registry(registry)
    logger.info("Migrated %d agents", len(config.get("agents", [])))
    return registry


# ── Project Registry ──────────────────────────────────────────────

def load_or_create_project_registry() -> dict:
    path = project_registry_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.warning("Corrupted project registry: %s", exc)
            backup_file(path)
    default = {"schema_version": 1, "projects": [],
               "created_at": datetime.now(timezone.utc).isoformat(),
               "updated_at": datetime.now(timezone.utc).isoformat()}
    save_project_registry(default)
    return default


def save_project_registry(registry: dict) -> None:
    path = project_registry_path()
    tmp = path + ".tmp"
    registry["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def register_project(project_id: str, name: str, source_path: str) -> dict:
    registry = load_or_create_project_registry()
    now = datetime.now(timezone.utc).isoformat()
    existing = next((p for p in registry["projects"] if p["project_id"] == project_id), None)
    if existing:
        existing["updated_at"] = now
        existing["name"] = name
        save_project_registry(registry)
        return existing
    project = {"project_id": project_id, "name": name,
               "source_path": os.path.normpath(source_path),
               "vault_path": f"02-Projects/{project_id}",
               "indexing_enabled": True, "sync_mode": "reference",
               "include": ["**/*.md","**/*.txt","**/*.json","**/*.yaml","**/*.yml",
                           "**/*.js","**/*.mjs","**/*.cjs","**/*.ts","**/*.tsx",
                           "**/*.jsx","**/*.py"],
               "exclude": [".git/**","node_modules/**","dist/**","build/**",
                           "coverage/**",".env",".env.*","**/*.pem","**/*.key",
                           "**/credentials*","**/secrets*"],
               "created_at": now, "updated_at": now}
    registry["projects"].append(project)
    save_project_registry(registry)
    return project


# ── System Health ─────────────────────────────────────────────────

def startup_health_check() -> dict:
    results = {"healthy": True, "checks": [], "warnings": [], "errors": []}
    rr = runtime_root()
    if not os.path.isdir(rr):
        results["healthy"] = False
        results["errors"].append(f"Runtime root not found: {rr}")
    fr = family_registry_path()
    if os.path.isfile(fr):
        try:
            with open(fr, "r", encoding="utf-8") as f:
                reg = json.load(f)
            results["checks"].append(f"Family registry: {len(reg.get('nodes',[]))} nodes")
        except Exception as e:
            results["warnings"].append(f"Family registry unreadable: {e}")
    ap = os.path.join(config_root(), "access-policy.json")
    if not os.path.isfile(ap):
        results["warnings"].append("Access policy not configured, using defaults")
    results["checks"].insert(0, f"Runtime root: {rr}")
    results["checks"].append(f"Vault: {vault_root()}")
    return results


# ── Bootstrap Entry Point ──────────────────────────────────────────

def bootstrap(agents_config_path: Optional[str] = None) -> dict:
    """Full bootstrap: create dirs, migrate agents, create configs."""
    created_dirs = ensure_directories()
    if agents_config_path is None:
        agents_config_path = os.path.join(runtime_root(), "agents.config.json")

    # Create node agent directories
    registry = load_or_create_family_registry()
    if not registry["nodes"] and os.path.isfile(agents_config_path):
        registry = migrate_from_agents_config(agents_config_path)

    for node in registry.get("nodes", []):
        node_id = node["node_id"]
        node_dir = os.path.join(agents_root(), node_id)
        for sub in ["skills", "memory", "cache", "sessions", "logs", "checkpoints"]:
            d = os.path.join(node_dir, sub)
            if not os.path.isdir(d):
                os.makedirs(d, exist_ok=True)
                created_dirs.append(d)

    # Create default configs if missing
    from .config import ensure_default_configs
    ensure_default_configs()

    health = startup_health_check()
    return {"created_directories": len(created_dirs), "health": health,
            "family_nodes": len(registry.get("nodes", []))}
