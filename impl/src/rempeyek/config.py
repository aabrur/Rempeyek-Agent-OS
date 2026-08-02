"""
Rempeyek Agent OS - Config management.

Creates and manages default configuration files for the system.
"""

from __future__ import annotations

import json
import os
import logging
from dataclasses import dataclass, field
from typing import Any, FrozenSet, Optional

from .runtime import config_root

logger = logging.getLogger(__name__)


@dataclass
class RuntimePaths:
    """Canonical runtime paths for Rempeyek Agent OS."""
    runtime_root: str = ""
    vault: str = ""
    skill_warehouse: str = ""
    agents_root: str = ""
    graphify_root: str = ""
    config_root: str = ""
    logs_root: str = ""
    quarantine_root: str = ""

    def __post_init__(self) -> None:
        if not self.runtime_root:
            self.runtime_root = os.environ.get("REMPEYEK_RUNTIME_ROOT", os.path.join(os.environ.get("LOCALAPPDATA", ""), "Rempeyek-Agent-OS"))
        base = self.runtime_root
        self.vault = os.path.join(base, "Vault")
        self.skill_warehouse = os.path.join(os.environ.get("USERPROFILE", ""), ".skills")
        self.agents_root = os.path.join(base, "Agents")
        self.graphify_root = os.path.join(self.vault, ".graphify")
        self.config_root = os.path.join(base, "Config")
        self.logs_root = os.path.join(base, "Logs")
        self.quarantine_root = os.path.join(base, "Quarantine")


@dataclass
class AccessPolicy:
    allowed_roots: list[str] = field(default_factory=list)
    denied_roots: list[str] = field(default_factory=list)
    allowed_extensions: FrozenSet[str] = field(default_factory=frozenset)
    denied_extensions: FrozenSet[str] = field(default_factory=frozenset)
    max_file_size: int = 50 * 1024 * 1024
    follow_symlinks: bool = False
    allow_network_paths: bool = False
    allow_hidden_files: bool = True
    require_approval_for: list[str] = field(default_factory=list)
    redaction_patterns: list[str] = field(default_factory=list)

    def check(self, path: str) -> tuple[bool, str]:
        from .security import is_allowed_by_policy, enforce_max_file_size, validate_extension
        allowed, reason = is_allowed_by_policy(path, allowed_roots=self.allowed_roots, denied_roots=self.denied_roots)
        if not allowed:
            return False, reason
        try:
            enforce_max_file_size(path, self.max_file_size)
            validate_extension(path, self.allowed_extensions, self.denied_extensions)
        except ValueError as exc:
            return False, str(exc)
        return True, "OK"


DEFAULT_ACCESS_POLICY = {
    "policy_version": 1,
    "default_behavior": "deny_unless_allowed",
    "allowed_roots": [],
    "denied_roots": [
        "{$USERPROFILE}\\.ssh",
        "{$USERPROFILE}\\.gnupg",
        "{$APPDATA}\\Microsoft\\Credentials",
        "{$LOCALAPPDATA}\\Google\\Chrome\\User Data",
        "{$LOCALAPPDATA}\\Microsoft\\Edge\\User Data",
        "{$LOCALAPPDATA}\\BraveSoftware\\Brave-Browser\\User Data",
    ],
    "allowed_extensions": [
        ".md", ".txt", ".json", ".yaml", ".yml", ".js", ".mjs",
        ".cjs", ".ts", ".tsx", ".jsx", ".py", ".pyw", ".rb", ".rs",
        ".go", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp",
        ".sh", ".bat", ".ps1", ".toml", ".cfg", ".ini", ".conf",
        ".css", ".scss", ".html", ".htm", ".svg", ".xml", ".csv",
        ".log", ".env.example",
    ],
    "denied_extensions": [
        ".pem", ".key", ".p12", ".pfx", ".crt", ".der", ".p7b",
        ".keystore", ".jks", ".kdbx", ".dmp", ".minidump",
        ".exe", ".dll", ".so", ".dylib", ".bin",
    ],
    "max_file_size_bytes": 52428800,
    "follow_symlinks": False,
    "allow_network_paths": False,
    "allow_hidden_files": False,
    "require_approval_for": [
        ".ssh", ".gnupg", "credentials", "secrets", ".env",
        "wallet", "keystore", "keyfile", "token",
    ],
    "redaction_patterns": [
        "sk_live_", "sk_test_", "pk_live_", "pk_test_",
        "-----BEGIN.*PRIVATE KEY-----",
        "0x[a-fA-F0-9]{40,}",
    ],
    "created_at": "",
    "updated_at": "",
}

DEFAULT_RUNTIME_CONFIG = {
    "config_version": 1,
    "agency_name": "Rempeyek Agent OS",
    "max_concurrent_sessions": 5,
    "max_file_size_mb": 50,
    "max_files_per_batch": 500,
    "max_graph_update_batch": 1000,
    "max_watcher_count": 20,
    "session_timeout_minutes": 120,
    "checkpoint_warning_minutes": 30,
    "skill_sync_enabled": True,
    "graphify_auto_index": False,
    "obsidian_auto_sync": False,
    "log_level": "INFO",
    "created_at": "",
    "updated_at": "",
}

DEFAULT_SYNC_POLICY = {
    "policy_version": 1,
    "sync_enabled": True,
    "auto_discover_skills": True,
    "validate_manifests": True,
    "calculate_checksums": True,
    "detect_version_changes": True,
    "conflict_resolution": "vault_wins",
    "require_approval_for_conflicts": True,
    "rollback_enabled": True,
    "max_rollback_versions": 5,
    "created_at": "",
    "updated_at": "",
}

DEFAULT_GRAPHIFY_CONFIG = {
    "config_version": 1,
    "enabled": True,
    "vault_path": "",
    "auto_index_projects": False,
    "incremental_updates": True,
    "max_nodes_per_batch": 1000,
    "community_detection": True,
    "export_html": True,
    "created_at": "",
    "updated_at": "",
}

DEFAULT_MEMORY_POLICY = {
    "policy_version": 1,
    "max_session_memory_items": 100,
    "max_private_memory_items": 500,
    "max_shared_memory_items": 2000,
    "auto_promote_from_private": False,
    "require_review_for_promotion": True,
    "conflict_handling": "create_conflict_record",
    "max_memory_age_days": 365,
    "created_at": "",
    "updated_at": "",
}

DEFAULT_SKILLS_POLICY = {
    "policy_version": 1,
    "sync_enabled": True,
    "warehouse_path": "",
    "validate_manifests": True,
    "require_approval_for_executable": True,
    "allow_rollback": True,
    "max_sync_retries": 3,
    "created_at": "",
    "updated_at": "",
}


def _write_config(filename: str, default: dict) -> bool:
    """Write a default config file if it doesn't exist. Returns True if written."""
    path = os.path.join(config_root(), filename)
    if os.path.isfile(path):
        return False
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    default["created_at"] = now
    default["updated_at"] = now
    os.makedirs(config_root(), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(default, f, indent=2, ensure_ascii=False)
    logger.info("Created default config: %s", path)
    return True


def ensure_default_configs() -> list[str]:
    """Create all missing default config files. Returns created filenames."""
    created = []
    configs = [
        ("access-policy.json", DEFAULT_ACCESS_POLICY),
        ("runtime.json", DEFAULT_RUNTIME_CONFIG),
        ("sync-policy.json", DEFAULT_SYNC_POLICY),
        ("graphify.json", DEFAULT_GRAPHIFY_CONFIG),
        ("memory-policy.json", DEFAULT_MEMORY_POLICY),
        ("skills-policy.json", DEFAULT_SKILLS_POLICY),
    ]
    for filename, default in configs:
        if _write_config(filename, default):
            created.append(filename)
    return created


def load_config(filename: str) -> dict:
    """Load a config file, returning empty dict on failure."""
    path = os.path.join(config_root(), filename)
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        logger.warning("Failed to load config: %s", path)
        return {}
