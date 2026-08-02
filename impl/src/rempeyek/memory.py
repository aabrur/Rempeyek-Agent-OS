"""
Rempeyek Agent OS - Shared Memory Architecture.

Implements layered memory (session, private, project, shared, durable decisions)
with promotion workflow and conflict detection.
"""

from __future__ import annotations

import json
import os
import logging
from datetime import datetime, timezone
from typing import Optional

from .runtime import vault_root, agents_root
from .models import make_memory_id

logger = logging.getLogger(__name__)


# ── Memory Paths ─────────────────────────────────────────────────────

def shared_memory_dir() -> str:
    return os.path.join(vault_root(), "Memory", "Shared")


def decisions_dir() -> str:
    return os.path.join(vault_root(), "Memory", "Decisions")


def lessons_dir() -> str:
    return os.path.join(vault_root(), "Memory", "Lessons")


def node_memory_dir(node_id: str) -> str:
    return os.path.join(agents_root(), node_id, "memory")


def shared_index_path() -> str:
    return os.path.join(shared_memory_dir(), "index.json")


# ── Load / Save Index ────────────────────────────────────────────────

def load_shared_index() -> dict:
    path = shared_index_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    idx = {"schema_version": 1, "memories": [], "updated_at": ""}
    save_shared_index(idx)
    return idx


def save_shared_index(index: dict) -> None:
    path = shared_index_path()
    tmp = path + ".tmp"
    index["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


# ── Memory Operations ────────────────────────────────────────────────

def write_private_memory(node_id: str, memory: dict) -> str:
    """Write a memory record to a node private memory."""
    mem_dir = node_memory_dir(node_id)
    os.makedirs(mem_dir, exist_ok=True)
    mem_id = memory.get("memory_id", make_memory_id())
    memory["memory_id"] = mem_id
    path = os.path.join(mem_dir, f"{mem_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)
    return mem_id


def promote_memory(memory: dict, node_id: str) -> dict:
    """Promote a memory from private/candidate to shared."""
    memory["status"] = "candidate"
    memory["memory_id"] = memory.get("memory_id", make_memory_id())
    memory["created_by"] = node_id
    memory["created_at"] = datetime.now(timezone.utc).isoformat()
    memory["updated_at"] = memory["created_at"]

    index = load_shared_index()
    existing = next((m for m in index["memories"]
                     if m.get("memory_id") == memory["memory_id"]), None)
    if existing:
        return {"success": False, "error": "Memory already exists", "memory_id": memory["memory_id"]}

    index["memories"].append(memory)
    save_shared_index(index)

    # Write individual file
    mem_path = os.path.join(shared_memory_dir(), f"{memory['memory_id']}.json")
    with open(mem_path, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)

    logger.info("Memory promoted: %s by %s", memory["memory_id"], node_id)
    return {"success": True, "memory_id": memory["memory_id"], "status": "candidate"}


def accept_memory(memory_id: str, reviewer: str) -> dict:
    """Accept a candidate memory into active shared memory."""
    index = load_shared_index()
    mem = next((m for m in index["memories"] if m.get("memory_id") == memory_id), None)
    if not mem:
        return {"success": False, "error": f"Memory not found: {memory_id}"}
    mem["status"] = "active"
    mem["reviewed_by"] = reviewer
    mem["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_shared_index(index)
    return {"success": True, "memory_id": memory_id, "status": "active"}


def query_shared_memory(query: str = "", memory_type: str = "",
                         project_id: str = "", limit: int = 20) -> list[dict]:
    """Query shared memory with optional filters."""
    index = load_shared_index()
    results = index.get("memories", [])

    if memory_type:
        results = [m for m in results if m.get("type") == memory_type]
    if project_id:
        results = [m for m in results if m.get("project_id") == project_id]
    if query:
        q = query.lower()
        results = [m for m in results
                   if q in m.get("title", "").lower()
                   or q in m.get("content", "").lower()]

    return sorted(results, key=lambda m: m.get("created_at", ""), reverse=True)[:limit]


def detect_memory_conflicts() -> list[dict]:
    """Detect conflicting memories (same topic, different content)."""
    index = load_shared_index()
    conflicts = []
    seen_topics = {}
    for mem in index.get("memories", []):
        title = mem.get("title", "").lower().strip()
        if title in seen_topics:
            other = seen_topics[title]
            if mem.get("content") != other.get("content"):
                conflicts.append({
                    "memory_id": mem["memory_id"],
                    "title": mem["title"],
                    "conflicts_with": other["memory_id"],
                    "created_by": mem.get("created_by", ""),
                    "other_author": other.get("created_by", ""),
                })
        seen_topics[title] = mem
    return conflicts


def consolidate_memories() -> dict:
    """Consolidate: archive superseded memories, flag conflicts."""
    index = load_shared_index()
    stats = {"total": len(index["memories"]), "active": 0,
             "superseded": 0, "candidate": 0, "conflicted": 0}
    for mem in index["memories"]:
        status = mem.get("status", "")
        if status == "active":
            stats["active"] += 1
        elif status == "superseded":
            stats["superseded"] += 1
        elif status == "candidate":
            stats["candidate"] += 1
        elif status == "conflicted":
            stats["conflicted"] += 1
    save_shared_index(index)
    return stats
