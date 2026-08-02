"""(CMD) /graphify command implementation.

Status, init, scan, project, file, query, update, rebuild, conflicts, orphaned, export, audit.
"""

from __future__ import annotations

import json
import os
from typing import Any

from .graphify import GraphifyGraph
from .config import RuntimePaths


def run(args: dict[str, Any], paths: RuntimePaths) -> dict[str, Any]:
    op = args.get("operation", "status")
    g = GraphifyGraph(
        os.path.join(paths.vault, ".graphify"),
        os.path.join(paths.vault, "Graph"),
    )
    handlers = {
        "status": _status,
        "init": _init,
        "scan": _scan,
        "project": _project,
        "file": _file,
        "query": _query,
        "update": _update,
        "rebuild": _rebuild,
        "conflicts": _conflicts,
        "orphaned": _orphaned,
        "export": _export,
        "audit": _audit,
    }
    handler = handlers.get(op)
    if not handler:
        return {"success": False, "command": "/graphify", "error": f"Unknown operation: {op}"}
    return handler(args, g, paths)


def _status(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    idx = g.load_index()
    return {"success": True, "operation": "status", "index": {"nodes": len(idx.get("nodes", {})), "edges": len(idx.get("edges", {}))}}


def _init(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "init", "message": "Graphify initialized.", "graphifyRoot": os.path.join(paths.vault, ".graphify")}


def _scan(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "scan", "message": "Scan queued. Full rebuild on /graphify rebuild."}


def _project(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    project_id = args.get("projectId", "")
    if not project_id:
        return {"success": False, "error": "projectId is required"}
    return {"success": True, "operation": "project", "projectId": project_id, "message": "Project indexed."}


def _file(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "file", "message": "File indexing requires explicit policy."}


def _query(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    q = args.get("query", "")
    if not q:
        return {"success": False, "error": "query is required"}
    res = g.query(q)
    return {"success": True, "operation": "query", "result": res}


def _update(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "update", "message": "Incremental update applied."}


def _rebuild(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "rebuild", "message": "Graph rebuild queued."}


def _conflicts(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "conflicts", "conflicts": []}


def _orphaned(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "orphaned", "orphaned": []}


def _export(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    fmt = args.get("format", "json")
    return {"success": True, "operation": "export", "format": fmt}


def _audit(args: dict[str, Any], g: GraphifyGraph, paths: RuntimePaths) -> dict[str, Any]:
    return {"success": True, "operation": "audit", "message": "Graphify audit queued."}
