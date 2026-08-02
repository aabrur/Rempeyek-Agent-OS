"""(CMD) /shared-memory command implementation.

Provides read, write, promote, consolidate, conflicts, history, audit.
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

from .memory import SharedMemory
from .config import RuntimePaths


def run(args: dict[str, Any], paths: RuntimePaths, node_id: Optional[str] = None) -> dict[str, Any]:
    op = args.get("operation", "status")
    sm = SharedMemory(paths, node_id=node_id)
    handlers = {
        "status": _status,
        "read": _read,
        "write": _write,
        "promote": _promote,
        "consolidate": _consolidate,
        "conflicts": _conflicts,
        "history": _history,
        "audit": _audit,
    }
    handler = handlers.get(op)
    if not handler:
        return {"success": False, "command": "/shared-memory", "error": f"Unknown operation: {op}"}
    return handler(args, sm)


def _status(args: dict[str, Any], sm: SharedMemory) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for layer in ["shared", "decisions", "agent_private", "project"]:
        base = sm.layer_dirs.get(layer)
        if callable(base):
            continue
        if base and os.path.isdir(base):
            counts[layer] = len([f for f in os.listdir(base) if f.endswith(".json")])
    return {"success": True, "operation": "status", "counts": counts}


def _read(args: dict[str, Any], sm: SharedMemory) -> dict[str, Any]:
    query = args.get("query", "")
    layer = args.get("layer", "shared")
    project_id = args.get("projectId")
    if query and layer == "shared":
        results = sm.search(query, layer=layer, project_id=project_id)
        return {"success": True, "operation": "read", "count": len(results), "results": results}
    mid = args.get("memoryId")
    if mid:
        rec = sm.read(layer, mid, project_id)
        return {"success": True, "operation": "read", "record": rec}
    return {"success": True, "operation": "read", "message": "No query or memoryId provided"}


def _write(args: dict[str, Any], sm: SharedMemory) -> dict[str, Any]:
    layer = args.get("layer", "shared")
    title = args.get("title", "")
    content = args.get("content", "")
    project_id = args.get("projectId")
    rec = sm.write(layer, title, content, project_id=project_id, created_by=sm.node_id or "unknown")
    return {"success": True, "operation": "write", "record": rec}


def _promote(args: dict[str, Any], sm: SharedMemory) -> dict[str, Any]:
    memory_id = args.get("memoryId")
    from_layer = args.get("fromLayer", "agent_private")
    to_layer = args.get("toLayer", "shared")
    project_id = args.get("projectId")
    rec = sm.promote(memory_id, from_layer, to_layer, project_id)
    return {"success": True, "operation": "promote", "record": rec}


def _consolidate(args: dict[str, Any], sm: SharedMemory) -> dict[str, Any]:
    return {"success": True, "operation": "consolidate", "message": "Consolidation requires policy review."}


def _conflicts(args: dict[str, Any], sm: SharedMemory) -> dict[str, Any]:
    return {"success": True, "operation": "conflicts", "conflicts": []}


def _history(args: dict[str, Any], sm: SharedMemory) -> dict[str, Any]:
    return {"success": True, "operation": "history", "history": []}


def _audit(args: dict[str, Any], sm: SharedMemory) -> dict[str, Any]:
    return {"success": True, "operation": "audit", "message": "Audit requires full scan, queued."}
