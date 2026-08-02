"""(CORE) Session lifecycle, record keeping, and completion.

Ensures every agent activity follows Phase A / Phase B / Phase C.
Marks abandoned sessions as interrupted on recovery.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

from .io import FileLock
from .config import RuntimePaths

logger = __import__("logging").getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SessionManager:
    """Manages agent activity lifecycle within Vault/Sessions."""

    def __init__(self, paths: RuntimePaths, node_id: str) -> None:
        self.paths = paths
        self.node_id = node_id
        self.active_dir = os.path.join(paths.vault, "Sessions", "Active")
        self.completed_dir = os.path.join(paths.vault, "Sessions", "Completed")
        self.failed_dir = os.path.join(paths.vault, "Sessions", "Failed")
        for d in [self.active_dir, self.completed_dir, self.failed_dir]:
            os.makedirs(d, exist_ok=True)

    def start(self, session_id: str, task_summary: str, project_id: str = "", skills_loaded: Optional[list[str]] = None) -> dict[str, Any]:
        """Phase A: Start a new session."""
        record = {
            "sessionId": session_id,
            "nodeId": self.node_id,
            "projectId": project_id,
            "taskSummary": task_summary,
            "startedAt": _now_iso(),
            "status": "active",
            "skillsLoaded": skills_loaded or [],
            "memorySources": [],
            "graphContext": [],
            "filesAllowed": [],
            "filesDenied": [],
            "approvalState": "not-required",
        }
        path = os.path.join(self.active_dir, f"{session_id}.json")
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(record, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
        return record

    def record_decision(self, session_id: str, decision: str, reason: str) -> None:
        path = os.path.join(self.active_dir, f"{session_id}.json")
        if not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                rec = json.load(f)
        except (json.JSONDecodeError, OSError):
            return
        rec.setdefault("decisions", []).append({
            "at": _now_iso(),
            "decision": decision,
            "reason": reason,
        })
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(rec, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)

    def record_file_change(self, session_id: str, path: str, change_type: str) -> None:
        self.record_decision(session_id, f"file-{change_type}", path)

    def complete(self, session_id: str, result: dict[str, Any]) -> dict[str, Any]:
        """Phase C: Move session from Active to Completed."""
        src = os.path.join(self.active_dir, f"{session_id}.json")
        if not os.path.exists(src):
            return {"error": "Session not found"}
        try:
            with open(src, "r", encoding="utf-8") as f:
                rec = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            return {"error": f"Failed to load session: {exc}"}
        rec["status"] = "completed"
        rec["completedAt"] = _now_iso()
        rec["result"] = result
        dst = os.path.join(self.completed_dir, f"{session_id}.json")
        tmp = dst + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(rec, f, indent=2, ensure_ascii=False)
        os.replace(tmp, dst)
        try:
            os.remove(src)
        except OSError:
            pass
        return rec

    def fail(self, session_id: str, error: str) -> dict[str, Any]:
        """Move session from Active to Failed."""
        src = os.path.join(self.active_dir, f"{session_id}.json")
        if not os.path.exists(src):
            return {"error": "Session not found"}
        with open(src, "r", encoding="utf-8") as f:
            rec = json.load(f)
        rec["status"] = "failed"
        rec["failedAt"] = _now_iso()
        rec["error"] = error
        dst = os.path.join(self.failed_dir, f"{session_id}.json")
        tmp = dst + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(rec, f, indent=2, ensure_ascii=False)
        os.replace(tmp, dst)
        try:
            os.remove(src)
        except OSError:
            pass
        return rec

    def detect_abandoned(self) -> list[dict[str, Any]]:
        """Detect sessions left in Active directory (app crashed or stopped)."""
        abandoned = []
        for fname in os.listdir(self.active_dir):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(self.active_dir, fname)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    rec = json.load(f)
                if rec.get("status") == "active":
                    abandoned.append(rec)
            except (json.JSONDecodeError, OSError):
                continue
        return abandoned
