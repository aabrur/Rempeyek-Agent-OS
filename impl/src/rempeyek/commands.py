"""Command router implementing the common command contract.

Commands: /obsidian /obsidian-vault /shared-memory /graphify /skills

Bridges the contract onto the consolidated module APIs:
- vault/family/projects/paths (structured registries, Node identities)
- memory (shared index + promotion), graphify (graph index), skills (warehouse sync)
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from . import paths, vault, family, projects
from . import memory as mem
from . import graphify as gr
from . import skills as sk
from .atomicio import now_iso


def _resp(command: str, operation: str, result, warnings=None, evidence=None, success=True) -> dict:
    return {"success": success, "command": command, "operation": operation,
            "result": result, "warnings": warnings or [], "evidence": evidence or [],
            "completedAt": now_iso()}


def route(request: dict) -> dict:
    cmd = request.get("command", "")
    op = request.get("operation", "status")
    args = request.get("arguments", {}) or {}
    try:
        handler = {
            "/obsidian": _obsidian,
            "/obsidian-vault": _obsidian_vault,
            "/shared-memory": _shared_memory,
            "/graphify": _graphify,
            "/skills": _skills,
        }.get(cmd)
        if handler is None:
            return _resp(cmd, op, {"error": f"unknown command {cmd}"}, success=False)
        return handler(op, args, request)
    except (ValueError, KeyError, FileNotFoundError, PermissionError) as exc:
        return _resp(cmd, op, {"error": f"{type(exc).__name__}: {exc}"}, success=False)


def _obsidian(op: str, args: dict, req: dict) -> dict:
    h = vault.health()
    obsidian_exe = shutil.which("obsidian") or _find_obsidian()
    opened = False
    if op == "open" and obsidian_exe and h["exists"]:
        try:
            subprocess.Popen([obsidian_exe], close_fds=True)
            opened = True
        except OSError:
            pass
    return _resp("/obsidian", op, {
        "vault": str(paths.vault_root()), "health": h,
        "obsidian_installed": bool(obsidian_exe), "opened": opened,
    }, evidence=[str(paths.vault_root())])


def _find_obsidian() -> str | None:
    for c in [Path.home() / "AppData/Local/Obsidian/Obsidian.exe",
              Path.home() / "AppData/Local/Programs/Obsidian/Obsidian.exe"]:
        if c.exists():
            return str(c)
    return None


def _obsidian_vault(op: str, args: dict, req: dict) -> dict:
    if op in ("init", "repair"):
        return _resp("/obsidian-vault", op, vault.init_vault())  # non-destructive only
    if op in ("status", "health"):
        return _resp("/obsidian-vault", op, vault.health())
    if op == "register-project":
        r = projects.register(args["project_id"], args.get("name", args["project_id"]),
                              args["path"])
        return _resp("/obsidian-vault", op, r)
    if op == "list-projects":
        return _resp("/obsidian-vault", op, projects.list_projects())
    return _resp("/obsidian-vault", op, {"error": f"unsupported operation {op}"}, success=False)


def _shared_memory(op: str, args: dict, req: dict) -> dict:
    if op == "status":
        idx = mem.load_shared_index()
        by_status: dict = {}
        for m in idx.get("memories", []):
            by_status[m.get("status", "?")] = by_status.get(m.get("status", "?"), 0) + 1
        return _resp("/shared-memory", op, {"total": len(idx.get("memories", [])),
                                            "by_status": by_status})
    if op == "read":
        return _resp("/shared-memory", op, mem.query_shared_memory(query=args.get("query", "")))
    if op == "write":
        from .security import redact
        record = {"title": args["title"], "content": redact(args["content"]),
                  "type": args.get("type", "fact"),
                  "project_id": req.get("projectId") or "",
                  "confidence": args.get("confidence", "inferred")}
        r = mem.promote_memory(record, req.get("nodeId") or "unknown")
        return _resp("/shared-memory", op, r, success=bool(r.get("success", True)))
    if op == "promote":
        r = mem.accept_memory(args["memory_id"], req.get("nodeId") or "unknown")
        return _resp("/shared-memory", op, r, success=bool(r.get("success", True)))
    if op == "conflicts":
        return _resp("/shared-memory", op, mem.detect_memory_conflicts())
    if op == "consolidate":
        return _resp("/shared-memory", op, mem.consolidate_memories())
    return _resp("/shared-memory", op, {"error": f"unsupported operation {op}"}, success=False)


def _graphify(op: str, args: dict, req: dict) -> dict:
    if op == "init":
        return _resp("/graphify", op, gr.init_graphify_vault())
    if op == "status":
        idx = gr.load_graph_index()
        return _resp("/graphify", op, {"nodes": len(idx.get("nodes", [])),
                                       "edges": len(idx.get("edges", [])),
                                       "index": gr.graph_index_path()})
    if op == "project":
        proj = projects.get(args["project_id"])
        if proj is None:
            return _resp("/graphify", op, {"error": "project not registered"}, success=False)
        r = gr.index_project_files(proj["project_id"], proj["source_path"])
        return _resp("/graphify", op, r, success=bool(r.get("success", True)))
    if op == "query":
        return _resp("/graphify", op, gr.query_graph_nodes(query=args.get("query", "")))
    return _resp("/graphify", op, {"error": f"unsupported operation {op}"}, success=False)


def _skills(op: str, args: dict, req: dict) -> dict:
    if op == "status":
        reg = sk.load_skills_registry()
        return _resp("/skills", op, {"count": len(reg.get("skills", []))})
    if op == "discover":
        found = sk.discover_skills()
        return _resp("/skills", op, {"discovered": len(found),
                                     "skills": [s["skill_id"] for s in found]})
    if op == "validate":
        results = [{"skill_id": s["skill_id"], "valid": v, "reason": r}
                   for s in sk.discover_skills()
                   for v, r in [sk.validate_skill(s)]]
        return _resp("/skills", op, results)
    if op == "sync":
        node_id = args.get("node_id") or req.get("nodeId")
        r = sk.sync_skills(node_id)
        return _resp("/skills", op, r, success=bool(r.get("success", True)))
    if op == "conflicts":
        return _resp("/skills", op, sk.detect_conflicts())
    if op == "rollback":
        r = sk.rollback_skills(args["node_id"])
        return _resp("/skills", op, r, success=bool(r.get("success", True)))
    return _resp("/skills", op, {"error": f"unsupported operation {op}"}, success=False)
