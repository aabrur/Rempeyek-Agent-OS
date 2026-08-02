"""Project registry with allowlist enforcement."""

from __future__ import annotations

from pathlib import Path

from . import paths, access
from .atomicio import locked_update_json, read_json, now_iso


def registry_path() -> Path:
    return paths.vault_root() / "System" / "project-registry.json"


def _default() -> dict:
    return {"schema_version": 1, "projects": []}


DEFAULT_INCLUDE = ["**/*.md", "**/*.txt", "**/*.json", "**/*.yaml", "**/*.yml",
                   "**/*.js", "**/*.mjs", "**/*.cjs", "**/*.ts", "**/*.tsx",
                   "**/*.jsx", "**/*.py"]
DEFAULT_EXCLUDE = [".git/**", "node_modules/**", "dist/**", "build/**",
                   "coverage/**", ".env", ".env.*", "**/*.pem", "**/*.key",
                   "**/credentials*", "**/secrets*"]


def register(project_id: str, name: str, source_path: str,
             sync_mode: str = "reference") -> dict:
    rp = Path(source_path).resolve()
    if access.is_sensitive(rp):
        raise PermissionError(f"Refusing to register sensitive path: {rp}")
    if not rp.exists():
        raise FileNotFoundError(str(rp))
    rec = {
        "project_id": project_id, "name": name, "source_path": str(rp),
        "vault_path": f"Vault\\02-Projects\\{project_id}",
        "indexing_enabled": True, "sync_mode": sync_mode,
        "include": DEFAULT_INCLUDE, "exclude": DEFAULT_EXCLUDE,
        "registered_at": now_iso(),
    }

    def mutate(data):
        reg = data if isinstance(data, dict) and "projects" in data else _default()
        reg["projects"] = [p for p in reg["projects"] if p["project_id"] != project_id]
        reg["projects"].append(rec)
        return reg
    locked_update_json(registry_path(), mutate, default=_default())

    # allowlist the project root
    pol = access.load_policy()
    if str(rp) not in pol.get("allowed_roots", []):
        pol.setdefault("allowed_roots", []).append(str(rp))
        from .atomicio import atomic_write_json
        atomic_write_json(access.policy_path(), pol, revisions=True)

    pdir = paths.vault_root() / "02-Projects" / project_id / "Memory"
    pdir.mkdir(parents=True, exist_ok=True)
    return rec


def get(project_id: str) -> dict | None:
    reg = read_json(registry_path(), default=_default())
    for p in reg.get("projects", []):
        if p["project_id"] == project_id:
            return p
    return None


def list_projects() -> list[dict]:
    return read_json(registry_path(), default=_default()).get("projects", [])
