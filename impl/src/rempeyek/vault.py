"""Vault initialization, health, and non-destructive normalization."""

from __future__ import annotations

from pathlib import Path

from . import paths
from .atomicio import atomic_write_text, now_iso


def init_vault() -> dict:
    """Create missing Vault directories. Never deletes or overwrites."""
    created = []
    v = paths.vault_root()
    for d in paths.VAULT_DIRS:
        p = v / d
        if not p.exists():
            p.mkdir(parents=True, exist_ok=True)
            created.append(str(p.relative_to(v)))
    for d in (paths.agents_root(), paths.config_root(), paths.logs_root(), paths.quarantine_root()):
        d.mkdir(parents=True, exist_ok=True)
    _ensure_nav_notes(v)
    return {"vault": str(v), "created": created, "at": now_iso()}


def _ensure_nav_notes(v: Path) -> None:
    notes = {
        "Home.md": "# Rempeyek Vault Home\n\n- [[AI-Family]]\n- [[Shared-Memory-Index]]\n- [[Graph-Index]]\n- [[Session-Index]]\n- [[Skill-Index]]\n- [[Projects-Index]]\n",
        "Memory/Shared-Memory-Index.md": "# Shared Memory Index\n\nValidated cross-agent knowledge lives in Memory/Shared.\n",
        "Graph/Graph-Index.md": "# Graph Index\n\nHuman-readable graph reports. Machine data in .graphify.\n",
        "Sessions/Session-Index.md": "# Session Index\n\nActive / Completed / Failed sessions.\n",
        "Skills/Skill-Index.md": "# Skill Index\n\nRegistry and per-node assignments.\n",
        "02-Projects/Projects-Index.md": "# Projects Index\n\nRegistered projects (see System/project-registry.json).\n",
    }
    for rel, content in notes.items():
        p = v / rel
        if not p.exists():
            atomic_write_text(p, content)


def health() -> dict:
    v = paths.vault_root()
    missing = [d for d in paths.VAULT_DIRS if not (v / d).exists()]
    obsidian = (v / ".obsidian").exists()
    reg = v / "System" / "AI-Family" / "family-registry.json"
    return {
        "vault": str(v),
        "exists": v.exists(),
        "missing_dirs": missing,
        "obsidian_config": obsidian,
        "family_registry": reg.exists() and reg.stat().st_size > 2,
        "healthy": v.exists() and not missing,
        "checked_at": now_iso(),
    }
