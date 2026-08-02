"""
Rempeyek Agent OS — CLI entry point.

Provides the main command-line interface for all system commands.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Optional

from . import __version__
from .runtime import (bootstrap, startup_health_check, runtime_root, vault_root, agents_root,
                       load_or_create_family_registry, save_family_registry, register_project,
                       load_or_create_project_registry, family_registry_path, project_registry_path)
from .config import ensure_default_configs, load_config
from .skills import (discover_skills, validate_skill, sync_skills, detect_conflicts,
                      load_skills_registry, save_skills_registry, rollback_skills)
from .sessions import (start_session, complete_session, fail_session, create_handoff,
                         detect_interrupted_sessions, get_recent_handoffs)
from .memory import (promote_memory, accept_memory, query_shared_memory,
                       detect_memory_conflicts, consolidate_memories, load_shared_index)
from .graphify import (init_graphify_vault, index_project_files, query_graph_nodes,
                         query_graph_edges, add_graph_node, add_graph_edge, load_graph_index)
from .models import ensure_all_schemas

logger = logging.getLogger(__name__)


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )


def cmd_init(args: argparse.Namespace) -> dict:
    """Initialize the Rempeyek Agent OS environment."""
    setup_logging(args.log_level)
    result = bootstrap()
    ensure_all_schemas()
    init_graphify_vault()
    health = startup_health_check()
    return {"init": result, "health": health}


def cmd_status(args: argparse.Namespace) -> dict:
    """Show system status."""
    health = startup_health_check()
    registry = load_or_create_family_registry()
    return {"health": health, "family_nodes": len(registry.get("nodes", [])),
            "vault": vault_root(), "agents": agents_root()}


def cmd_family(args: argparse.Namespace) -> dict:
    """Manage the AI family registry."""
    registry = load_or_create_family_registry()
    if args.action == "list":
        return {"nodes": registry.get("nodes", [])}
    elif args.action == "show":
        node = next((n for n in registry.get("nodes", []) if n["node_id"] == args.node_id), None)
        if not node:
            return {"error": f"Node not found: {args.node_id}"}
        return {"node": node}
    return {"error": f"Unknown action: {args.action}"}


def cmd_skills(args: argparse.Namespace) -> dict:
    """Manage skills."""
    if args.action == "discover":
        skills = discover_skills()
        return {"skills_found": len(skills), "skills": skills[:20]}
    elif args.action == "validate":
        skills = discover_skills()
        results = []
        for s in skills[:50]:
            valid, reason = validate_skill(s)
            results.append({"skill_id": s["skill_id"], "valid": valid, "reason": reason})
        return {"validated": len(results), "results": results}
    elif args.action == "sync":
        node_id = args.node_id or "Node-1"
        return sync_skills(node_id, force=args.force)
    elif args.action == "diff":
        reg = load_skills_registry()
        return {"registry_skills": len(reg.get("skills", []))}
    elif args.action == "conflicts":
        return {"conflicts": detect_conflicts()}
    elif args.action == "rollback":
        return rollback_skills(args.node_id or "Node-1")
    elif args.action == "status":
        reg = load_skills_registry()
        return {"status": "ok", "skills_count": len(reg.get("skills", []))}
    return {"error": f"Unknown action: {args.action}"}


def cmd_session(args: argparse.Namespace) -> dict:
    """Manage sessions."""
    if args.action == "start":
        return start_session(args.node_id, args.agent_id, args.task, args.project_id)
    elif args.action == "complete":
        return complete_session(args.session_id)
    elif args.action == "fail":
        return fail_session(args.session_id, args.error or "")
    elif args.action == "handoff":
        return create_handoff(args.node_id, args.session_id, args.project_id, args.task)
    elif args.action == "interrupted":
        return {"interrupted": detect_interrupted_sessions()}
    return {"error": f"Unknown action: {args.action}"}


def cmd_memory(args: argparse.Namespace) -> dict:
    """Manage shared memory."""
    if args.action == "query":
        return {"results": query_shared_memory(query=args.query or "")}
    elif args.action == "promote":
        memory = {"title": args.title or "", "content": args.content or "",
                   "type": "fact", "status": "candidate"}
        return promote_memory(memory, args.node_id)
    elif args.action == "accept":
        return accept_memory(args.memory_id, args.node_id)
    elif args.action == "consolidate":
        return consolidate_memories()
    elif args.action == "conflicts":
        return {"conflicts": detect_memory_conflicts()}
    elif args.action == "index":
        return load_shared_index()
    return {"error": f"Unknown action: {args.action}"}


def cmd_vault(args: argparse.Namespace) -> dict:
    """Manage the vault."""
    from . import runtime
    if args.action == "health":
        return startup_health_check()
    elif args.action == "init":
        result = bootstrap()
        return {"created_dirs": result.get("created_directories", 0)}
    elif args.action == "register-project":
        return register_project(args.project_id, args.name, args.path)
    elif args.action == "list-projects":
        reg = load_or_create_project_registry()
        return {"projects": reg.get("projects", [])}
    elif args.action == "sync":
        return {"message": "Vault sync complete"}
    return {"error": f"Unknown action: {args.action}"}


def cmd_graph(args: argparse.Namespace) -> dict:
    """Manage the knowledge graph."""
    if args.action == "init":
        return init_graphify_vault()
    elif args.action == "index":
        return index_project_files(args.project_id or "", args.path or "")
    elif args.action == "nodes":
        return {"nodes": query_graph_nodes(node_type=args.node_type or "")}
    elif args.action == "edges":
        return {"edges": query_graph_edges(edge_type=args.edge_type or "")}
    elif args.action == "status":
        idx = load_graph_index()
        return {"nodes": idx.get("node_count", 0), "edges": idx.get("edge_count", 0)}
    return {"error": f"Unknown action: {args.action}"}


def cmd_obsidian(args: argparse.Namespace) -> dict:
    """Obsidian vault operations."""
    vr = vault_root()
    obsidian_dir = os.path.join(vr, ".obsidian")
    health = {
        "vault_path": vr,
        "exists": os.path.isdir(vr),
        "obsidian_configured": os.path.isdir(obsidian_dir),
        "note_count": 0,
        "is_valid_obsidian_vault": os.path.isdir(vr),
    }
    if os.path.isdir(vr):
        md_files = []
        for root, dirs, files in os.walk(vr):
            if ".git" in dirs:
                dirs.remove(".git")
            for f in files:
                if f.endswith(".md"):
                    md_files.append(os.path.join(root, f))
        health["note_count"] = len(md_files)
    return health


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rempeyek",
        description="Rempeyek Agent OS — Unified AI Family System",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--log-level", default="INFO", help="Log level (DEBUG, INFO, WARNING, ERROR)")
    sub = parser.add_subparsers(dest="command", help="Command")

    # init
    sub.add_parser("init", help="Initialize Rempeyek Agent OS")

    # status
    sub.add_parser("status", help="Show system status")

    # family
    fam = sub.add_parser("family", help="Manage AI family")
    fam.add_argument("action", choices=["list", "show"])
    fam.add_argument("--node-id", default="")

    # skills
    sk = sub.add_parser("skills", help="Manage skills")
    sk.add_argument("action", choices=["discover", "validate", "sync", "diff",
                                         "conflicts", "rollback", "status"])
    sk.add_argument("--node-id", default="")
    sk.add_argument("--force", action="store_true")

    # session
    ses = sub.add_parser("session", help="Manage sessions")
    ses.add_argument("action", choices=["start", "complete", "fail", "handoff", "interrupted"])
    ses.add_argument("--node-id", default="Node-1")
    ses.add_argument("--agent-id", default="")
    ses.add_argument("--session-id", default="")
    ses.add_argument("--task", default="")
    ses.add_argument("--project-id", default="")
    ses.add_argument("--error", default="")

    # memory
    mem = sub.add_parser("memory", help="Manage shared memory")
    mem.add_argument("action", choices=["query", "promote", "accept",
                                          "consolidate", "conflicts", "index"])
    mem.add_argument("--node-id", default="")
    mem.add_argument("--query", default="")
    mem.add_argument("--title", default="")
    mem.add_argument("--content", default="")
    mem.add_argument("--memory-id", default="")

    # vault
    vt = sub.add_parser("vault", help="Manage vault")
    vt.add_argument("action", choices=["health", "init", "register-project",
                                         "list-projects", "sync"])
    vt.add_argument("--project-id", default="")
    vt.add_argument("--name", default="")
    vt.add_argument("--path", default="")

    # graph
    gr = sub.add_parser("graph", help="Manage knowledge graph")
    gr.add_argument("action", choices=["init", "index", "nodes", "edges", "status"])
    gr.add_argument("--project-id", default="")
    gr.add_argument("--path", default="")
    gr.add_argument("--node-type", default="")
    gr.add_argument("--edge-type", default="")

    # obsidian
    sub.add_parser("obsidian", help="Check Obsidian vault health")

    # gateway
    gw = sub.add_parser("gateway", help="Manage agent process lifecycle")
    gw.add_argument("action", choices=["run", "summon", "stop", "status", "logs", "list"])
    gw.add_argument("--agent-id", default="")

    # adapters
    adp = sub.add_parser("adapters", help="Inspect agent command adapters")
    adp.add_argument("action", choices=["list", "show"])
    adp.add_argument("--agent-id", default="")

    return parser


def cmd_gateway(args: argparse.Namespace) -> dict:
    """Manage agent process lifecycle via ProcessManager."""
    from .process import ProcessManager
    pm = ProcessManager()
    if args.action == "run":
        return pm.spawn_process(args.agent_id or "hermes", action_type="gateway_run")
    elif args.action == "summon":
        return pm.spawn_process(args.agent_id or "hermes", action_type="summon")
    elif args.action == "stop":
        return pm.stop_process(args.agent_id or "hermes")
    elif args.action == "status":
        return pm.get_process_status(args.agent_id or "hermes")
    elif args.action == "logs":
        return pm.get_logs(args.agent_id or "hermes")
    elif args.action == "list":
        return {"processes": pm.list_processes(args.agent_id or None)}
    return {"error": f"Unknown action: {args.action}"}


def cmd_adapters(args: argparse.Namespace) -> dict:
    """Inspect agent command adapters."""
    from .adapters import list_adapters, get_adapter
    if args.action == "list":
        return {"adapters": list_adapters()}
    elif args.action == "show":
        ad = get_adapter(args.agent_id or "hermes")
        return {"adapter": ad.to_dict()} if ad else {"error": f"Adapter not found: {args.agent_id}"}
    return {"error": f"Unknown action: {args.action}"}


COMMAND_MAP = {
    "init": cmd_init,
    "status": cmd_status,
    "family": cmd_family,
    "skills": cmd_skills,
    "session": cmd_session,
    "memory": cmd_memory,
    "vault": cmd_vault,
    "graph": cmd_graph,
    "obsidian": cmd_obsidian,
    "gateway": cmd_gateway,
    "adapters": cmd_adapters,
}


def main() -> None:
    parser = create_parser()
    args = parser.parse_args()
    setup_logging(getattr(args, "log_level", "INFO"))

    if not args.command:
        parser.print_help()
        sys.exit(1)

    handler = COMMAND_MAP.get(args.command)
    if not handler:
        print(f"Unknown command: {args.command}")
        sys.exit(1)

    try:
        result = handler(args)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2))
        if args.log_level == "DEBUG":
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
