"""
Rempeyek Agent OS — Session lifecycle management.

Handles session creation, tracking, completion, interruption detection,
and handoff generation for cross-agent continuity.
"""

from __future__ import annotations

import json
import os
import logging
from datetime import datetime, timezone
from typing import Optional

from .runtime import vault_root, agents_root, runtime_root
from .models import create_session_dict, create_handoff_dict, make_handoff_id

logger = logging.getLogger(__name__)


def active_sessions_dir() -> str:
    return os.path.join(vault_root(), "Sessions", "Active")


def completed_sessions_dir() -> str:
    return os.path.join(vault_root(), "Sessions", "Completed")


def failed_sessions_dir() -> str:
    return os.path.join(vault_root(), "Sessions", "Failed")


def handoffs_dir() -> str:
    return os.path.join(vault_root(), "Memory", "Handoffs")


def start_session(node_id: str, agent_id: str, task_summary: str = "",
                   project_id: str = "") -> dict:
    """Create and save a new active session."""
    session = create_session_dict(node_id, agent_id, task_summary, project_id)
    path = os.path.join(active_sessions_dir(), f"{session['session_id']}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(session, f, indent=2, ensure_ascii=False)
    logger.info("Session started: %s (Node: %s)", session["session_id"], node_id)
    return session


def complete_session(session_id: str, result: dict = None) -> Optional[dict]:
    """Move a session from Active to Completed."""
    active_path = os.path.join(active_sessions_dir(), f"{session_id}.json")
    if not os.path.isfile(active_path):
        logger.warning("Active session not found: %s", session_id)
        return None

    with open(active_path, "r", encoding="utf-8") as f:
        session = json.load(f)

    session["status"] = "completed"
    session["completed_at"] = datetime.now(timezone.utc).isoformat()
    if result:
        session.update(result)

    completed_path = os.path.join(completed_sessions_dir(), f"{session_id}.json")
    with open(completed_path, "w", encoding="utf-8") as f:
        json.dump(session, f, indent=2, ensure_ascii=False)

    os.remove(active_path)
    logger.info("Session completed: %s", session_id)
    return session


def fail_session(session_id: str, error: str = "") -> Optional[dict]:
    """Move a session from Active to Failed."""
    active_path = os.path.join(active_sessions_dir(), f"{session_id}.json")
    if not os.path.isfile(active_path):
        logger.warning("Active session not found: %s", session_id)
        return None

    with open(active_path, "r", encoding="utf-8") as f:
        session = json.load(f)

    session["status"] = "failed"
    session["completed_at"] = datetime.now(timezone.utc).isoformat()
    session["error"] = error

    failed_path = os.path.join(failed_sessions_dir(), f"{session_id}.json")
    with open(failed_path, "w", encoding="utf-8") as f:
        json.dump(session, f, indent=2, ensure_ascii=False)

    os.remove(active_path)
    logger.info("Session failed: %s", session_id)
    return session


def create_handoff(from_node: str, session_id: str, project_id: str = "",
                    task_summary: str = "", completed_work: list = None,
                    files_changed: list = None, decisions: list = None,
                    validation: list = None, unresolved: list = None,
                    recommended_next: str = "",
                    knowledge_promoted: list = None) -> dict:
    """Create a handoff record for another agent to continue."""
    handoff = create_handoff_dict(from_node, session_id, project_id, task_summary)
    if completed_work:
        handoff["completed_work"] = completed_work
    if files_changed:
        handoff["files_changed"] = files_changed
    if decisions:
        handoff["decisions"] = decisions
    if validation:
        handoff["validation"] = validation
    if unresolved:
        handoff["unresolved"] = unresolved
    if recommended_next:
        handoff["recommended_next"] = recommended_next
    if knowledge_promoted:
        handoff["knowledge_promoted"] = knowledge_promoted

    # Write as Markdown and JSON
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    md_path = os.path.join(handoffs_dir(), f"{ts}-{from_node}-{session_id[:8]}.md")
    json_path = os.path.join(handoffs_dir(), f"{ts}-{from_node}-{session_id[:8]}.json")

    os.makedirs(handoffs_dir(), exist_ok=True)

    md_content = f"""# Agent Handoff

## Identity
- Node: {from_node}
- Session: {session_id}
- Project: {project_id}

## Task
{task_summary}

## Completed Work
{chr(10).join('- ' + w for w in (completed_work or []))}

## Files Changed
{chr(10).join('- ' + f for f in (files_changed or []))}

## Decisions
{chr(10).join('- ' + str(d) for d in (decisions or []))}

## Validation
{chr(10).join('- ' + v for v in (validation or []))}

## Unresolved
{chr(10).join('- ' + u for u in (unresolved or []))}

## Recommended Next Action
{recommended_next}

## Knowledge Promoted
{chr(10).join('- ' + k for k in (knowledge_promoted or []))}

## Completed At
{handoff["completed_at"]}
"""
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(handoff, f, indent=2, ensure_ascii=False)

    logger.info("Handoff created: %s -> %s", md_path, json_path)
    return handoff


def detect_interrupted_sessions() -> list[dict]:
    """Find sessions that were interrupted (app closed without completion)."""
    interrupted = []
    active_dir = active_sessions_dir()
    if not os.path.isdir(active_dir):
        return interrupted

    for fname in os.listdir(active_dir):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(active_dir, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                session = json.load(f)
            session["status"] = "interrupted"
            session["completed_at"] = datetime.now(timezone.utc).isoformat()
            failed_path = os.path.join(failed_sessions_dir(), fname)
            os.makedirs(failed_sessions_dir(), exist_ok=True)
            with open(failed_path, "w", encoding="utf-8") as f:
                json.dump(session, f, indent=2, ensure_ascii=False)
            os.remove(path)
            interrupted.append(session)
            logger.info("Marked interrupted session: %s", session.get("session_id", fname))
        except Exception as exc:
            logger.warning("Failed to process interrupted session %s: %s", fname, exc)

    return interrupted


def get_recent_handoffs(count: int = 5) -> list[dict]:
    """Get the most recent handoffs."""
    hdir = handoffs_dir()
    if not os.path.isdir(hdir):
        return []
    handoffs = []
    for fname in sorted(os.listdir(hdir), reverse=True):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(hdir, fname), "r", encoding="utf-8") as f:
                handoffs.append(json.load(f))
        except Exception:
            pass
        if len(handoffs) >= count:
            break
    return handoffs
