"""
Rempeyek Agent OS — Skills synchronization engine.

Discovers, validates, and synchronizes skills from the central skill warehouse
to agent-specific skill directories with capability matching and rollback support.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import logging
from datetime import datetime, timezone
from typing import Optional

from .runtime import skills_warehouse, agents_root, vault_root, config_root
from .config import load_config

logger = logging.getLogger(__name__)


def compute_file_checksum(path: str) -> str:
    """Compute SHA-256 checksum of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def discover_skills(warehouse: Optional[str] = None) -> list[dict]:
    """Discover all valid skills in the warehouse directory."""
    if warehouse is None:
        warehouse = skills_warehouse()
    if not os.path.isdir(warehouse):
        logger.warning("Skill warehouse not found: %s", warehouse)
        return []

    skills = []
    for entry in os.listdir(warehouse):
        entry_path = os.path.join(warehouse, entry)
        if not os.path.isdir(entry_path):
            continue
        # Skip dot-directories and hidden entries
        if entry.startswith(".") or entry.startswith("_"):
            continue

        manifest = None
        for mfile in ["manifest.json", "skill.json", "package.json", "DESCRIPTION.md"]:
            mp = os.path.join(entry_path, mfile)
            if os.path.isfile(mp):
                try:
                    with open(mp, "r", encoding="utf-8") as f:
                        manifest = json.load(f)
                    break
                except (json.JSONDecodeError, OSError):
                    pass

        skill = {
            "skill_id": entry.lower().replace(" ", "-").replace("_", "-"),
            "name": entry,
            "version": manifest.get("version", "0.0.0") if manifest else "0.0.0",
            "source_path": entry_path,
            "checksum": "",
            "manifest_path": mp if manifest else "",
            "capabilities": manifest.get("capabilities", []) if manifest else [],
            "assigned_nodes": [],
            "trust_status": "unverified",
            "validation_status": "pending",
            "last_synced_at": "",
            "conflicts": [],
        }

        # Compute checksum of manifest or directory
        if skill["manifest_path"]:
            skill["checksum"] = compute_file_checksum(skill["manifest_path"])
        else:
            skill["checksum"] = compute_file_checksum(entry_path) if os.path.isfile(entry_path) else ""

        skills.append(skill)

    return skills


def validate_skill(skill: dict) -> tuple[bool, str]:
    """Validate a skill manifest and content. Returns (valid, reason)."""
    name = skill.get("name", "")
    if not name:
        return False, "Skill has no name"

    # Check for unsafe patterns
    source = skill.get("source_path", "")
    if source:
        # Look for dangerous scripts/commands
        for root, dirs, files in os.walk(source):
            for f in files:
                fpath = os.path.join(root, f)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as fh:
                        content = fh.read(4096)
                    unsafe = ["rm -rf /", "rm -rf ~", "format ", "del /f /s",
                              "rd /s /q", "shutdown", "stop-computer",
                              "remove-item -recurse", "clear-content",
                              "curl http", "| bash", "invoke-expression"]
                    if any(u in content.lower() for u in unsafe):
                        return False, f"Unsafe content detected in {f}"
                except Exception:
                    pass

    return True, "Valid"


def load_skills_registry() -> dict:
    """Load the skills registry from vault."""
    path = os.path.join(vault_root(), "Skills", "Registry", "skills-registry.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    reg = {"schema_version": 1, "skills": [], "updated_at": ""}
    save_skills_registry(reg)
    return reg


def save_skills_registry(registry: dict) -> None:
    """Save the skills registry atomically."""
    path = os.path.join(vault_root(), "Skills", "Registry", "skills-registry.json")
    tmp = path + ".tmp"
    registry["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def sync_skills(node_id: str, force: bool = False) -> dict:
    """Synchronize skills for a specific node based on capability matching."""
    warehouse = skills_warehouse()
    if not os.path.isdir(warehouse):
        return {"success": False, "error": f"Warehouse not found: {warehouse}"}

    # Load family registry for node capabilities
    from .runtime import load_or_create_family_registry
    registry = load_or_create_family_registry()
    node = next((n for n in registry.get("nodes", []) if n["node_id"] == node_id), None)
    if not node:
        return {"success": False, "error": f"Node not found: {node_id}"}

    node_caps = set(node.get("capabilities", []))
    skills_reg = load_skills_registry()

    # Discover warehouse skills
    all_skills = discover_skills(warehouse)
    synced = []
    skipped = []
    errors = []

    for skill in all_skills:
        caps = set(skill.get("capabilities", []))

        # If node has no specific capabilities, match broadly
        if node_caps and caps and not node_caps.intersection(caps):
            skipped.append({"skill_id": skill["skill_id"], "reason": "capability mismatch"})
            continue

        # Validate
        valid, reason = validate_skill(skill)
        if not valid:
            errors.append({"skill_id": skill["skill_id"], "reason": reason})
            continue

        skill["validation_status"] = "valid"
        skill["trust_status"] = "standard"
        skill["assigned_nodes"] = list(set(skill["assigned_nodes"] + [node_id]))
        skill["last_synced_at"] = datetime.now(timezone.utc).isoformat()

        # Sync to node skill directory
        node_skill_dir = os.path.join(agents_root(), node_id, "skills", skill["skill_id"])
        os.makedirs(node_skill_dir, exist_ok=True)

        if skill["source_path"] and os.path.isdir(skill["source_path"]):
            # Copy skill files (not the whole warehouse)
            for item in os.listdir(skill["source_path"]):
                if item.startswith("."):
                    continue
                s = os.path.join(skill["source_path"], item)
                d = os.path.join(node_skill_dir, item)
                if os.path.isfile(s):
                    shutil.copy2(s, d)
                elif os.path.isdir(s) and not os.path.isdir(d):
                    shutil.copytree(s, d, dirs_exist_ok=True)

        # Write skill descriptor
        desc_path = os.path.join(node_skill_dir, ".skill.json")
        with open(desc_path, "w", encoding="utf-8") as f:
            json.dump(skill, f, indent=2, ensure_ascii=False)

        # Update or add to registry
        existing = next((s for s in skills_reg["skills"]
                         if s["skill_id"] == skill["skill_id"]), None)
        if existing:
            existing.update(skill)
        else:
            skills_reg["skills"].append(skill)

        synced.append(skill["skill_id"])

    save_skills_registry(skills_reg)

    # Save assignment record
    assignment_path = os.path.join(vault_root(), "Skills", "Assignments", f"{node_id}.json")
    os.makedirs(os.path.dirname(assignment_path), exist_ok=True)
    assignment = {
        "node_id": node_id,
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "skills_synced": synced,
        "skills_skipped": skipped,
        "skills_errors": errors,
    }
    with open(assignment_path, "w", encoding="utf-8") as f:
        json.dump(assignment, f, indent=2, ensure_ascii=False)

    return {
        "success": True,
        "node_id": node_id,
        "synced": len(synced),
        "skipped": len(skipped),
        "errors": len(errors),
        "skill_ids": synced,
    }


def detect_conflicts() -> list[dict]:
    """Detect naming or capability conflicts across skills."""
    skills_reg = load_skills_registry()
    conflicts = []
    seen_names = {}
    for skill in skills_reg.get("skills", []):
        name = skill.get("name", "").lower()
        if name in seen_names:
            conflicts.append({
                "skill_id": skill["skill_id"],
                "name": skill["name"],
                "conflicts_with": seen_names[name],
                "reason": "Duplicate skill name",
            })
        seen_names[name] = skill["skill_id"]
    return conflicts


def rollback_skills(node_id: str, version: Optional[str] = None) -> dict:
    """Rollback skills for a node to a previous version."""
    from .runtime import agents_root
    node_skills_dir = os.path.join(agents_root(), node_id, "skills")
    if not os.path.isdir(node_skills_dir):
        return {"success": False, "error": f"No skills directory for {node_id}"}

    # Check for backup
    backup_dir = os.path.join(agents_root(), node_id, "skills_backup")
    if not os.path.isdir(backup_dir):
        return {"success": False, "error": f"No backup to rollback for {node_id}"}

    # Remove current
    shutil.rmtree(node_skills_dir)
    # Restore backup
    shutil.copytree(backup_dir, node_skills_dir, dirs_exist_ok=True)
    shutil.rmtree(backup_dir)

    return {"success": True, "node_id": node_id, "action": "rollback_complete"}
