"""(CMD) /obsidian-vault command implementation.

Vault management: status, init, health, repair, register-project, list-projects, sync, migrate.
"""

from __future__ import annotations

import json
import os
import shutil
from typing import Any

from .vault import vault_health, init_vault
from .config import RuntimePaths
from .security import canonical_path

logger = __import__("logging").getLogger(__name__)


def run(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    op = args.get("operation", "status")
    handlers = {
        "status": _status,
        "init": _init,
        "health": _health,
        "repair": _repair,
        "register-project": _register_project,
        "list-projects": _list_projects,
        "sync": _sync,
        "migrate": _migrate,
    }
    handler = handlers.get(op)
    if not handler:
        return {"success": False, "command": "/obsidian-vault", "error": f"Unknown operation: {op}"}
    return handler(args, paths)


def _status(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    health = vault_health(paths)
    return {"success": True, "operation": "status", "vault": paths.vault, "health": health}


def _init(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    dry_run = args.get("dryRun", False)
    result = init_vault(paths, dry_run=dry_run)
    health = vault_health(paths)
    return {"success": True, "operation": "init", "result": result, "health": health}


def _health(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "health", "report": vault_health(paths)}


def _repair(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "repair", "message": "Repair requires explicit approval. Use dryRun=true."}


def _register_project(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    project_path = args.get("projectPath", "")
    if not project_path:
        return {"success": False, "error": "projectPath is required"}
    canon = canonical_path(project_path)
    registry_path = os.path.join(paths.vault, "System", "project-registry.json")
    if os.path.exists(registry_path):
        with open(registry_path, "r", encoding="utf-8") as f:
            registry = json.load(f)
    else:
        registry = {"schemaVersion": 1, "projects": []}
    pid = os.path.basename(canon.rstrip("\\/"))
    entry = {
        "projectId": pid,
        "name": pid,
        "sourcePath": canon,
        "vaultPath": f"02-Projects/{pid}",
        "indexingEnabled": True,
        "syncMode": "reference",
        "include": ["**/*.md", "**/*.json", "**/*.yaml", "**/*.yml", "**/*.py", "**/*.ts", "**/*.tsx"],
        "exclude": [".git/**", "node_modules/**", "dist/**", "build/**", "**/.env", "**/*.pem", "**/*.key"],
    }
    registry.setdefault("projects", []).append(entry)
    os.makedirs(os.path.dirname(registry_path), exist_ok=True)
    tmp = registry_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
    os.replace(tmp, registry_path)
    return {"success": True, "operation": "register-project", "projectId": pid, "sourcePath": canon}


def _list_projects(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    registry_path = os.path.join(paths.vault, "System", "project-registry.json")
    if os.path.exists(registry_path):
        with open(registry_path, "r", encoding="utf-8") as f:
            registry = json.load(f)
    else:
        registry = {"projects": []}
    return {"success": True, "operation": "list-projects", "projects": registry.get("projects", [])}


def _sync(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "sync", "message": "Use /skills sync for skill synchronization."}


def _migrate(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "migrate", "message": "Migration requires explicit approval and dry-run review."}
