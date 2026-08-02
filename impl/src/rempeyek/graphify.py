"""
Rempeyek Agent OS — Graphify integration and data model.

Provides graph node/edge management for the knowledge graph,
project indexing, and query support.
"""

from __future__ import annotations

import hashlib
import json
import os
import logging
from datetime import datetime, timezone
from typing import Optional

from .runtime import vault_root, graphify_vault_path

logger = logging.getLogger(__name__)


GRAPH_NODE_TYPES = [
    "Agent", "NodeIdentity", "Project", "Document", "Directory",
    "Task", "Session", "Decision", "Handoff", "Skill", "Capability",
    "Memory", "Entity", "Person", "Organization", "Repository",
    "Command", "Evidence", "Issue", "Risk", "Test", "Artifact",
]

GRAPH_EDGE_TYPES = [
    "AGENT_HAS_IDENTITY", "AGENT_USES_SKILL", "AGENT_WORKED_ON",
    "AGENT_CREATED", "AGENT_MODIFIED", "AGENT_HANDOFF_TO",
    "PROJECT_CONTAINS", "DOCUMENT_BELONGS_TO", "DOCUMENT_REFERENCES",
    "TASK_PART_OF", "SESSION_EXECUTES", "DECISION_AFFECTS",
    "MEMORY_DERIVED_FROM", "MEMORY_RELATED_TO", "SKILL_SUPPORTS",
    "EVIDENCE_SUPPORTS", "ISSUE_BLOCKS", "TEST_VALIDATES",
    "ARTIFACT_PRODUCED_BY", "ENTITY_MENTIONED_IN", "SUPERSEDES",
    "CONFLICTS_WITH", "DEPENDS_ON",
]


def graph_index_path() -> str:
    return os.path.join(vault_root(), "Graph", "Indexes", "graph-index.json")


def graph_nodes_dir() -> str:
    return os.path.join(vault_root(), "Graph", "Nodes")


def graph_edges_dir() -> str:
    return os.path.join(vault_root(), "Graph", "Edges")


# ── Graph Index ──────────────────────────────────────────────────────

def load_graph_index() -> dict:
    path = graph_index_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    idx = {"schema_version": 1, "nodes": [], "edges": [],
           "node_count": 0, "edge_count": 0,
           "created_at": datetime.now(timezone.utc).isoformat(),
           "updated_at": datetime.now(timezone.utc).isoformat()}
    save_graph_index(idx)
    return idx


def save_graph_index(index: dict) -> None:
    path = graph_index_path()
    tmp = path + ".tmp"
    index["updated_at"] = datetime.now(timezone.utc).isoformat()
    index["node_count"] = len(index.get("nodes", []))
    index["edge_count"] = len(index.get("edges", []))
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


# ── Graphify Paths ──────────────────────────────────────────────────

def graphify_graph_path() -> str:
    return os.path.join(graphify_vault_path(), "graph.json")


def graphify_report_path() -> str:
    return os.path.join(vault_root(), "Graph", "Reports", "GRAPH_REPORT.md")


# ── Node Operations ─────────────────────────────────────────────────

def add_graph_node(node: dict) -> bool:
    """Add a node to the graph index. Returns True if new, False if updated."""
    index = load_graph_index()
    existing = next((n for n in index["nodes"] if n.get("id") == node.get("id")), None)
    node["indexedAt"] = datetime.now(timezone.utc).isoformat()

    if existing:
        existing.update(node)
        save_graph_index(index)
        return False
    else:
        index["nodes"].append(node)
        save_graph_index(index)
        return True


def get_graph_node(node_id: str) -> Optional[dict]:
    index = load_graph_index()
    return next((n for n in index["nodes"] if n.get("id") == node_id), None)


def query_graph_nodes(node_type: str = "", query: str = "", limit: int = 50) -> list[dict]:
    index = load_graph_index()
    results = index.get("nodes", [])
    if node_type:
        results = [n for n in results if n.get("type") == node_type]
    if query:
        q = query.lower()
        results = [n for n in results
                   if q in n.get("name", "").lower()
                   or q in n.get("id", "").lower()]
    return results[:limit]


# ── Edge Operations ─────────────────────────────────────────────────

def add_graph_edge(edge: dict) -> bool:
    """Add an edge to the graph index."""
    index = load_graph_index()
    edge_key = f"{edge.get('from')}->{edge.get('to')}|{edge.get('type')}"
    edge["createdAt"] = edge.get("createdAt", datetime.now(timezone.utc).isoformat())

    existing = next((e for e in index["edges"]
                     if f"{e.get('from')}->{e.get('to')}|{e.get('type')}" == edge_key), None)
    if existing:
        existing.update(edge)
        save_graph_index(index)
        return False
    else:
        index["edges"].append(edge)
        save_graph_index(index)
        return True


def query_graph_edges(edge_type: str = "", from_id: str = "",
                       to_id: str = "", limit: int = 100) -> list[dict]:
    index = load_graph_index()
    results = index.get("edges", [])
    if edge_type:
        results = [e for e in results if e.get("type") == edge_type]
    if from_id:
        results = [e for e in results if e.get("from") == from_id]
    if to_id:
        results = [e for e in results if e.get("to") == to_id]
    return results[:limit]


# ── Document Indexing ───────────────────────────────────────────────

def hash_file(path: str) -> str:
    """SHA-256 hash of a file."""
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ""


def index_project_files(project_id: str, source_path: str,
                         include_patterns: list[str] = None,
                         exclude_patterns: list[str] = None) -> dict:
    """Index files from a project directory into the graph."""
    import fnmatch
    from .runtime import load_or_create_project_registry

    registry = load_or_create_project_registry()
    proj = next((p for p in registry.get("projects", [])
                 if p["project_id"] == project_id), None)
    if not proj:
        return {"success": False, "error": f"Project not registered: {project_id}"}

    inc = proj.get("include", ["**/*.md"])
    exc = proj.get("exclude", [".git/**", "node_modules/**"])

    indexed = 0
    skipped = 0
    errors = []

    for root, dirs, files in os.walk(source_path):
        # Filter excluded directories
        dirs[:] = [d for d in dirs if not any(fnmatch.fnmatch(os.path.join(root, d), p)
                                                for p in exc)]

        for fname in files:
            fpath = os.path.join(root, fname)

            # Check exclude patterns
            rel = os.path.relpath(fpath, source_path)
            if any(fnmatch.fnmatch(rel, p) for p in exc):
                skipped += 1
                continue

            # Check include patterns (match against relative path and basename)
            rel_norm = rel.replace(os.sep, "/")
            if inc and not any(
                fnmatch.fnmatch(rel_norm, p) or fnmatch.fnmatch(fname, p)
                or fnmatch.fnmatch(fname, p.split("/")[-1])
                for p in inc
            ):
                skipped += 1
                continue

            try:
                fhash = hash_file(fpath)
                node_id = f"document:{fhash[:16]}:{project_id}:{rel.replace(os.sep, '/')}"
                node = {
                    "id": node_id,
                    "type": "Document",
                    "name": fname,
                    "sourcePath": fpath,
                    "sourceHash": fhash,
                    "projectId": project_id,
                    "indexedAt": datetime.now(timezone.utc).isoformat(),
                    "accessScope": "project",
                    "confidence": "verified",
                }
                is_new = add_graph_node(node)
                if is_new:
                    indexed += 1

                # Edge to project
                edge = {
                    "from": f"project:{project_id}",
                    "to": node_id,
                    "type": "PROJECT_CONTAINS",
                    "confidence": "verified",
                }
                add_graph_edge(edge)

            except Exception as walk_err:
                errors.append(str(walk_err))
                skipped += 1

    return {"success": True, "indexed": indexed, "skipped": skipped,
             "errors": len(errors), "total": indexed + skipped}


# ── Graphify init ───────────────────────────────────────────────────

def init_graphify_vault() -> dict:
    """Initialize the Graphify data directory within the vault."""
    gv = graphify_vault_path()
    os.makedirs(gv, exist_ok=True)
    # Create placeholder graph files
    for fname in ["graph.json", "manifest.json"]:
        path = os.path.join(gv, fname)
        if not os.path.isfile(path):
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"nodes": [], "edges": [],
                           "created_at": datetime.now(timezone.utc).isoformat()},
                          f, indent=2)
    return {"path": gv, "initialized": True}
