"""AI family registry: deterministic, persistent Node identities."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from . import paths
from .atomicio import atomic_write_text, locked_update_json, now_iso, read_json


def registry_path() -> Path:
    return paths.vault_root() / "System" / "AI-Family" / "family-registry.json"


def _empty() -> dict:
    return {"schema_version": 1, "next_node_number": 1, "nodes": []}


def _coerce(data: Any) -> dict:
    if not isinstance(data, dict) or "nodes" not in data:
        return _empty()
    data.setdefault("schema_version", 1)
    data.setdefault("next_node_number", 1 + max(
        [int(n["node_id"].split("-")[1]) for n in data["nodes"] if n.get("node_id", "").startswith("Node-")],
        default=0,
    ))
    return data


def load_registry() -> dict:
    return _coerce(read_json(registry_path(), default=None))


def find_node(agent_id: str, reg: Optional[dict] = None) -> Optional[dict]:
    reg = reg or load_registry()
    for n in reg["nodes"]:
        if n.get("agent_id") == agent_id:
            return n
    return None


def register_agent(agent_id: str, display_name: str, provider: str = "other",
                   role: str = "general", capabilities: Optional[list] = None) -> dict:
    """Idempotent: returns the existing node or creates the next Node-N."""
    result: dict = {}

    def mutate(data):
        reg = _coerce(data)
        for n in reg["nodes"]:
            if n["agent_id"] == agent_id:
                n["last_seen_at"] = now_iso()
                result.update(n)
                return reg
        node_id = f"Node-{reg['next_node_number']}"
        reg["next_node_number"] += 1
        node = {
            "node_id": node_id,
            "agent_id": agent_id,
            "display_name": display_name,
            "provider": provider,
            "role": role,
            "capabilities": capabilities or [],
            "status": "active",
            "created_at": now_iso(),
            "last_seen_at": now_iso(),
            "skills_manifest": f"Vault/Skills/Assignments/{node_id}.json",
            "memory_scope": ["shared", "project", "private"],
            "trust_level": "standard",
            "schema_version": 1,
        }
        reg["nodes"].append(node)
        result.update(node)
        return reg

    locked_update_json(registry_path(), mutate, default=_empty())
    _ensure_node_dirs(result["node_id"], result)
    render_markdown()
    return result


def touch_last_seen(node_id: str) -> None:
    def mutate(data):
        reg = _coerce(data)
        for n in reg["nodes"]:
            if n["node_id"] == node_id:
                n["last_seen_at"] = now_iso()
        return reg
    locked_update_json(registry_path(), mutate, default=_empty())


def _ensure_node_dirs(node_id: str, node: dict) -> None:
    base = paths.agents_root() / node_id
    for d in paths.NODE_DIRS:
        (base / d).mkdir(parents=True, exist_ok=True)
    ident = base / "identity.json"
    if not ident.exists():
        from .atomicio import atomic_write_json
        atomic_write_json(ident, node)
    cfg = base / "config.json"
    if not cfg.exists():
        from .atomicio import atomic_write_json
        atomic_write_json(cfg, {"node_id": node_id, "schema_version": 1})


def render_markdown() -> Path:
    reg = load_registry()
    lines = ["# AI Family", "", f"Registry schema v{reg['schema_version']} — {len(reg['nodes'])} nodes", "",
             "| Node | Agent | Provider | Role | Status | Last Seen |",
             "|------|-------|----------|------|--------|-----------|"]
    for n in reg["nodes"]:
        lines.append(f"| [[{n['node_id']}]] | {n['display_name']} | {n['provider']} | "
                     f"{n['role']} | {n['status']} | {n['last_seen_at']} |")
    md = paths.vault_root() / "System" / "AI-Family" / "AI-Family.md"
    atomic_write_text(md, "\n".join(lines) + "\n")
    return md
