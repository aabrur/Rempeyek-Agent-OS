"""(CORE) Cross-node handoff reading, writing, and indexing.

Handoffs are stored as Markdown files in Vault/Memory/Handoffs/.
Every handoff follows the canonical structure defined in the master prompt.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class HandoffManager:
    """Reads and writes agent handoffs."""

    def __init__(self, paths, node_id: str) -> None:
        self.paths = paths
        self.node_id = node_id
        self.handoffs_dir = os.path.join(paths.vault, "Memory", "Handoffs")
        os.makedirs(self.handoffs_dir, exist_ok=True)

    def write(self, handoff: dict[str, Any]) -> str:
        ts = _now_iso().replace(":", "-")
        fname = f"{ts}-{self.node_id}-{handoff.get('taskId', 'unknown')}.md"
        path = os.path.join(self.handoffs_dir, fname)
        md = _render_handoff_md(handoff)
        with open(path, "w", encoding="utf-8") as f:
            f.write(md)
        meta_path = path.replace(".md", ".json")
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(handoff, f, indent=2, ensure_ascii=False, default=str)
        return path

    def read_latest(self, task_id: Optional[str] = None) -> list[dict[str, Any]]:
        results = []
        for fname in sorted(os.listdir(self.handoffs_dir)):
            if not fname.endswith(".json"):
                continue
            if task_id and task_id not in fname:
                continue
            try:
                with open(os.path.join(self.handoffs_dir, fname), "r", encoding="utf-8") as f:
                    results.append(json.load(f))
            except (json.JSONDecodeError, OSError):
                continue
        return results

    def index(self) -> list[dict[str, Any]]:
        return self.read_latest()


def _render_handoff_md(h: dict[str, Any]) -> str:
    lines = [
        "# Agent Handoff", "",
        "## Identity",
        f"- Node: {h.get('nodeId', '')}",
        f"- Agent: {h.get('agentId', '')}",
        f"- Session: {h.get('sessionId', '')}",
        f"- Project: {h.get('projectId', '')}", "",
        "## Task", h.get("taskSummary", ""), "",
        "## Completed",
    ]
    for item in h.get("completed", []):
        lines.append(f"- {item}")
    lines += ["", "## Files Changed"]
    for p in h.get("filesChanged", []):
        lines.append(f"- {p}")
    lines += ["", "## Decisions"]
    for d in h.get("decisions", []):
        lines.append(f"- {d.get('decision')}: {d.get('reason')}")
    lines += ["", "## Validation"]
    for v in h.get("validation", []):
        lines.append(f"- {v}")
    lines += ["", "## Unresolved"]
    for u in h.get("unresolved", []):
        lines.append(f"- {u}")
    lines += ["", "## Recommended Next Action", h.get("nextAction", ""), "",
        "## Knowledge Promoted"]
    for k in h.get("knowledgePromoted", []):
        lines.append(f"- {k}")
    lines += ["", "## Security Notes", h.get("securityNotes", ""), "",
        "---", f"_Generated at {_now_iso()} by {h.get('nodeId', '')}_", ""]
    return "\n".join(lines)
