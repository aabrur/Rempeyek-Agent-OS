"""
Rempeyek Agent OS — Data models, schemas, and validation.

Pydantic-based models for registries, sessions, handoffs, memory,
skills, graph nodes/edges, and commands.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Optional
from pathlib import Path

from .runtime import vault_root

# ── JSON Schema Definitions ──────────────────────────────────────────

SESSION_SCHEMA = {
    "$schema": "https://json-schema.org/draft-07/schema#",
    "title": "Session",
    "type": "object",
    "required": ["session_id", "node_id", "agent_id", "started_at", "status"],
    "properties": {
        "session_id": {"type": "string"},
        "node_id": {"type": "string"},
        "agent_id": {"type": "string"},
        "task_id": {"type": "string"},
        "task_summary": {"type": "string"},
        "project_id": {"type": "string"},
        "started_at": {"type": "string", "format": "date-time"},
        "completed_at": {"type": "string", "format": "date-time"},
        "status": {"enum": ["active", "completed", "failed", "interrupted"]},
        "skills_loaded": {"type": "array", "items": {"type": "string"}},
        "memory_sources": {"type": "array", "items": {"type": "string"}},
        "graph_context": {"type": "string"},
        "files_allowed": {"type": "array", "items": {"type": "string"}},
        "files_denied": {"type": "array", "items": {"type": "string"}},
        "approval_state": {"type": "string"},
    },
}

HANDOFF_SCHEMA = {
    "$schema": "https://json-schema.org/draft-07/schema#",
    "title": "Handoff",
    "type": "object",
    "required": ["handoff_id", "from_node", "session_id", "completed_at"],
    "properties": {
        "handoff_id": {"type": "string"},
        "from_node": {"type": "string"},
        "to_node": {"type": "string"},
        "session_id": {"type": "string"},
        "project_id": {"type": "string"},
        "task_summary": {"type": "string"},
        "completed_work": {"type": "array", "items": {"type": "string"}},
        "files_changed": {"type": "array", "items": {"type": "string"}},
        "decisions": {"type": "array", "items": {"type": "object"}},
        "validation": {"type": "array", "items": {"type": "string"}},
        "unresolved": {"type": "array", "items": {"type": "string"}},
        "recommended_next": {"type": "string"},
        "knowledge_promoted": {"type": "array", "items": {"type": "string"}},
        "security_notes": {"type": "string"},
        "completed_at": {"type": "string", "format": "date-time"},
    },
}

MEMORY_SCHEMA = {
    "$schema": "https://json-schema.org/draft-07/schema#",
    "title": "Memory",
    "type": "object",
    "required": ["memory_id", "title", "type", "status", "created_by", "content"],
    "properties": {
        "memory_id": {"type": "string"},
        "title": {"type": "string"},
        "type": {"enum": ["decision", "lesson", "preference", "entity",
                           "procedure", "handoff", "fact"]},
        "status": {"enum": ["candidate", "reviewed", "accepted", "active",
                             "superseded", "conflicted"]},
        "created_by": {"type": "string"},
        "reviewed_by": {"type": "string"},
        "source_sessions": {"type": "array", "items": {"type": "string"}},
        "source_files": {"type": "array", "items": {"type": "string"}},
        "project_id": {"type": "string"},
        "created_at": {"type": "string", "format": "date-time"},
        "updated_at": {"type": "string", "format": "date-time"},
        "expires_at": {"type": "string", "format": "date-time"},
        "supersedes": {"type": "string"},
        "conflicts_with": {"type": "array", "items": {"type": "string"}},
        "confidence": {"enum": ["verified", "inferred", "uncertain"]},
        "content": {"type": "string"},
    },
}

AGENT_SCHEMA = {
    "$schema": "https://json-schema.org/draft-07/schema#",
    "title": "Agent",
    "type": "object",
    "required": ["node_id", "agent_id", "display_name", "provider", "status"],
    "properties": {
        "node_id": {"type": "string"},
        "agent_id": {"type": "string"},
        "display_name": {"type": "string"},
        "provider": {"type": "string"},
        "role": {"type": "string"},
        "capabilities": {"type": "array", "items": {"type": "string"}},
        "status": {"enum": ["active", "inactive", "degraded", "quarantined"]},
        "created_at": {"type": "string", "format": "date-time"},
        "last_seen_at": {"type": "string", "format": "date-time"},
        "trust_level": {"type": "string"},
    },
}

SKILL_SCHEMA = {
    "$schema": "https://json-schema.org/draft-07/schema#",
    "title": "Skill",
    "type": "object",
    "required": ["skill_id", "name", "version", "source_path"],
    "properties": {
        "skill_id": {"type": "string"},
        "name": {"type": "string"},
        "version": {"type": "string"},
        "source_path": {"type": "string"},
        "checksum": {"type": "string"},
        "manifest_path": {"type": "string"},
        "capabilities": {"type": "array", "items": {"type": "string"}},
        "assigned_nodes": {"type": "array", "items": {"type": "string"}},
        "trust_status": {"type": "string"},
        "validation_status": {"type": "string"},
        "last_synced_at": {"type": "string", "format": "date-time"},
        "conflicts": {"type": "array", "items": {"type": "string"}},
    },
}

GRAPH_NODE_SCHEMA = {
    "$schema": "https://json-schema.org/draft-07/schema#",
    "title": "GraphNode",
    "type": "object",
    "required": ["id", "type", "name"],
    "properties": {
        "id": {"type": "string"},
        "type": {"type": "string"},
        "name": {"type": "string"},
        "sourcePath": {"type": "string"},
        "sourceHash": {"type": "string"},
        "createdAt": {"type": "string"},
        "updatedAt": {"type": "string"},
        "indexedAt": {"type": "string"},
        "accessScope": {"type": "string"},
        "confidence": {"enum": ["verified", "inferred", "uncertain"]},
    },
}

GRAPH_EDGE_SCHEMA = {
    "$schema": "https://json-schema.org/draft-07/schema#",
    "title": "GraphEdge",
    "type": "object",
    "required": ["from", "to", "type"],
    "properties": {
        "from": {"type": "string"},
        "to": {"type": "string"},
        "type": {"type": "string"},
        "source": {"type": "string"},
        "createdAt": {"type": "string"},
        "confidence": {"enum": ["verified", "inferred", "uncertain"]},
    },
}


def save_schema(name: str, schema: dict) -> str:
    """Save a JSON schema to the vault schemas directory. Returns the path."""
    schemas_dir = os.path.join(vault_root(), "System", "Schemas")
    os.makedirs(schemas_dir, exist_ok=True)
    path = os.path.join(schemas_dir, f"{name}.schema.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2, ensure_ascii=False)
    return path


def ensure_all_schemas() -> list[str]:
    """Write all schemas to disk. Returns list of created file paths."""
    schemas = [
        ("session", SESSION_SCHEMA),
        ("handoff", HANDOFF_SCHEMA),
        ("memory", MEMORY_SCHEMA),
        ("agent", AGENT_SCHEMA),
        ("skill", SKILL_SCHEMA),
        ("graph-node", GRAPH_NODE_SCHEMA),
        ("graph-edge", GRAPH_EDGE_SCHEMA),
    ]
    created = []
    for name, schema in schemas:
        path = save_schema(name, schema)
        created.append(path)
    return created


# ── Session ──────────────────────────────────────────────────────────

def make_session_id() -> str:
    import uuid
    return f"session-{uuid.uuid4().hex[:12]}"


def make_handoff_id() -> str:
    import uuid
    return f"handoff-{uuid.uuid4().hex[:12]}"


def make_memory_id() -> str:
    import uuid
    return f"mem-{uuid.uuid4().hex[:12]}"


def create_session_dict(node_id: str, agent_id: str, task_summary: str = "",
                         project_id: str = "") -> dict:
    return {
        "session_id": make_session_id(),
        "node_id": node_id,
        "agent_id": agent_id,
        "task_id": "",
        "task_summary": task_summary,
        "project_id": project_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": "",
        "status": "active",
        "skills_loaded": [],
        "memory_sources": [],
        "graph_context": "",
        "files_allowed": [],
        "files_denied": [],
        "approval_state": "none",
    }


def create_handoff_dict(from_node: str, session_id: str, project_id: str = "",
                         task_summary: str = "") -> dict:
    return {
        "handoff_id": make_handoff_id(),
        "from_node": from_node,
        "to_node": "",
        "session_id": session_id,
        "project_id": project_id,
        "task_summary": task_summary,
        "completed_work": [],
        "files_changed": [],
        "decisions": [],
        "validation": [],
        "unresolved": [],
        "recommended_next": "",
        "knowledge_promoted": [],
        "security_notes": "",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
