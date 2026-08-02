"""Process Manager for Rempeyek Agent OS.

Manages process lifecycle (spawn, track, stop, logs, status) for agent processes spawned by Rempeyek.
Strictly isolates Rempeyek's managed process tree and prevents killing external agent processes.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .adapters import get_adapter, resolve_binary, CommandAdapter
from .atomicio import atomic_write_json, read_json, now_iso
from .runtime import logs_root, agents_root, vault_root


VALID_RUNTIME_STATES = {
    "idle", "starting", "running", "waiting", "stopping", "stopped", "failed", "unavailable"
}


def _process_table_path() -> Path:
    return Path(vault_root()) / "System" / "process-table.json"


def _is_pid_running(pid: int) -> bool:
    """Check whether a process with the given PID is currently active."""
    if pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            # Use tasklist to check if PID exists on Windows
            res = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                check=False
            )
            return str(pid) in res.stdout
        except OSError:
            return False
    else:
        try:
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False


def _get_child_pids(parent_pid: int) -> list[int]:
    """Retrieve child PIDs of a parent process on Windows or POSIX."""
    if parent_pid <= 0:
        return []
    children: list[int] = []
    if sys.platform == "win32":
        try:
            cmd = ["wmic", "process", "where", f"ParentProcessId={parent_pid}", "get", "ProcessId"]
            res = subprocess.run(cmd, capture_output=True, text=True, check=False)
            for line in res.stdout.splitlines():
                line = line.strip()
                if line.isdigit() and int(line) != parent_pid:
                    children.append(int(line))
        except OSError:
            pass
    return children


def kill_process_tree(pid: int) -> bool:
    """Kill a process and all its child processes (Rempeyek managed process tree)."""
    if pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            # taskkill /F /T kills process tree reliably on Windows
            res = subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True,
                text=True,
                check=False
            )
            return res.returncode == 0 or not _is_pid_running(pid)
        except OSError:
            return False
    else:
        try:
            os.kill(pid, signal.SIGTERM)
            return True
        except (OSError, ProcessLookupError):
            return False


class ProcessManager:
    """Process Manager for tracking and controlling Rempeyek spawned agent processes."""

    def __init__(self, table_path: Optional[Path] = None):
        self.table_path = table_path or _process_table_path()
        self._table: dict[str, dict[str, Any]] = {}
        self._load_table()

    def _load_table(self) -> None:
        if self.table_path.exists():
            data = read_json(self.table_path, default=None)
            if isinstance(data, dict) and "processes" in data:
                self._table = data["processes"]

    def _save_table(self) -> None:
        self.table_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema_version": 1,
            "updated_at": now_iso(),
            "processes": self._table
        }
        atomic_write_json(self.table_path, payload)

    def cleanup_stale(self) -> None:
        """Scan process table and update states of dead/stale PIDs."""
        changed = False
        for key, proc in self._table.items():
            state = proc.get("runtime_state", "idle")
            pid = proc.get("pid")
            if state in ("running", "starting", "waiting") and pid:
                if not _is_pid_running(pid):
                    proc["runtime_state"] = "stopped" if proc.get("exit_code") == 0 else "failed"
                    if proc.get("exit_code") is None:
                        proc["exit_code"] = -1
                    changed = True
        if changed:
            self._save_table()

    def list_processes(self, agent_id: Optional[str] = None) -> list[dict]:
        """List all managed processes, optionally filtered by agent_id."""
        self.cleanup_stale()
        procs = list(self._table.values())
        if agent_id:
            procs = [p for p in procs if p.get("agent_id") == agent_id]
        return procs

    def get_process_status(self, agent_id_or_pid: str | int) -> dict:
        """Get current status of a managed process."""
        self.cleanup_stale()
        proc = None
        if isinstance(agent_id_or_pid, int) or str(agent_id_or_pid).isdigit():
            target_pid = int(agent_id_or_pid)
            proc = next((p for p in self._table.values() if p.get("pid") == target_pid), None)
        else:
            agent_id = str(agent_id_or_pid)
            # Pick latest process for this agent
            agent_procs = [p for p in self._table.values() if p.get("agent_id") == agent_id]
            if agent_procs:
                proc = sorted(agent_procs, key=lambda x: x.get("start_time", ""), reverse=True)[0]

        if not proc:
            adapter = get_adapter(str(agent_id_or_pid))
            binary = resolve_binary(str(agent_id_or_pid)) if adapter else None
            return {
                "agent_id": str(agent_id_or_pid),
                "pid": None,
                "child_pids": [],
                "command": adapter.summon_command[0] if adapter else "",
                "args": [],
                "cwd": "",
                "action_type": "none",
                "start_time": "",
                "exit_code": None,
                "runtime_state": "idle" if binary else "unavailable",
                "stdout_path": "",
                "stderr_path": "",
                "verified": adapter.verified if adapter else False,
            }

        # Check native status if available and verified
        adapter = get_adapter(proc["agent_id"])
        native_status_output = None
        if adapter and adapter.runtime_type == "service" and adapter.verified and adapter.native_status:
            try:
                res = subprocess.run(adapter.native_status, capture_output=True, text=True, check=False, timeout=5)
                native_status_output = res.stdout.strip()
            except (OSError, subprocess.TimeoutExpired):
                pass

        proc_copy = dict(proc)
        if native_status_output:
            proc_copy["native_status_output"] = native_status_output
        return proc_copy

    def spawn_process(
        self,
        agent_id: str,
        action_type: str = "gateway_run",
        extra_args: Optional[list[str]] = None,
        cwd: Optional[str] = None
    ) -> dict:
        """Spawn an agent process under Rempeyek management."""
        self.cleanup_stale()

        adapter = get_adapter(agent_id)
        if not adapter:
            return {
                "success": False,
                "error": f"Unknown agent_id: {agent_id}",
                "runtime_state": "failed"
            }

        # Check duplicate gateway run / process execution
        active = [
            p for p in self._table.values()
            if p.get("agent_id") == agent_id and p.get("action_type") == action_type
            and p.get("runtime_state") in ("starting", "running")
        ]
        if active:
            return {
                "success": False,
                "error": f"Process already active for agent {agent_id} ({action_type}) with PID {active[0].get('pid')}",
                "process": active[0],
                "runtime_state": active[0].get("runtime_state")
            }

        # Determine working directory
        workdir = cwd or os.path.join(os.environ.get("LOCALAPPDATA", ""), "Rempeyek-Agent-OS")

        # Resolve binary path
        executable = resolve_binary(agent_id, workdir=workdir)
        if not executable:
            record = {
                "agent_id": agent_id,
                "pid": None,
                "child_pids": [],
                "command": adapter.summon_command[0],
                "args": extra_args or [],
                "cwd": workdir,
                "action_type": action_type,
                "start_time": now_iso(),
                "exit_code": None,
                "runtime_state": "unavailable",
                "stdout_path": "",
                "stderr_path": "",
                "error": f"Binary candidate for {agent_id} not found on system."
            }
            return {"success": False, "process": record, "runtime_state": "unavailable"}

        # Build command array (separate executable and arguments, no raw string concatenation)
        if action_type == "summon":
            cmd_args = [executable] + list(adapter.summon_command[1:])
        else:
            cmd_args = [executable] + list(adapter.gateway_run_command[1:])

        if extra_args:
            cmd_args.extend(extra_args)

        # Log directory setup
        log_dir = Path(logs_root()) / agent_id
        log_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        stdout_path = str(log_dir / f"{action_type}_{ts}_stdout.log")
        stderr_path = str(log_dir / f"{action_type}_{ts}_stderr.log")

        try:
            out_f = open(stdout_path, "w", encoding="utf-8")
            err_f = open(stderr_path, "w", encoding="utf-8")

            # Spawn subprocess
            creationflags = 0
            if sys.platform == "win32":
                creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

            proc = subprocess.Popen(
                cmd_args,
                cwd=workdir,
                stdout=out_f,
                stderr=err_f,
                creationflags=creationflags
            )

            record_id = f"{agent_id}-{proc.pid}"
            record = {
                "agent_id": agent_id,
                "pid": proc.pid,
                "child_pids": [],
                "command": cmd_args[0],
                "args": cmd_args[1:],
                "cwd": workdir,
                "action_type": action_type,
                "start_time": now_iso(),
                "exit_code": None,
                "runtime_state": "running",
                "stdout_path": stdout_path,
                "stderr_path": stderr_path,
            }
            self._table[record_id] = record
            self._save_table()

            out_f.close()
            err_f.close()

            return {
                "success": True,
                "process": record,
                "runtime_state": "running"
            }

        except Exception as exc:
            record = {
                "agent_id": agent_id,
                "pid": None,
                "child_pids": [],
                "command": cmd_args[0] if cmd_args else "",
                "args": cmd_args[1:] if len(cmd_args) > 1 else [],
                "cwd": workdir,
                "action_type": action_type,
                "start_time": now_iso(),
                "exit_code": -1,
                "runtime_state": "failed",
                "stdout_path": stdout_path,
                "stderr_path": stderr_path,
                "error": str(exc)
            }
            return {
                "success": False,
                "process": record,
                "runtime_state": "failed",
                "error": str(exc)
            }

    def stop_process(self, agent_id_or_pid: str | int) -> dict:
        """Stop a Rempeyek managed process tree."""
        self.cleanup_stale()

        proc_key = None
        proc = None

        if isinstance(agent_id_or_pid, int) or str(agent_id_or_pid).isdigit():
            target_pid = int(agent_id_or_pid)
            for k, v in self._table.items():
                if v.get("pid") == target_pid:
                    proc_key = k
                    proc = v
                    break
        else:
            agent_id = str(agent_id_or_pid)
            agent_procs = [
                (k, v) for k, v in self._table.items()
                if v.get("agent_id") == agent_id and v.get("runtime_state") in ("running", "starting", "waiting")
            ]
            if agent_procs:
                proc_key, proc = sorted(agent_procs, key=lambda x: x[1].get("start_time", ""), reverse=True)[0]

        if not proc or not proc.get("pid"):
            return {
                "success": True,
                "message": f"No active managed process found for {agent_id_or_pid}",
                "runtime_state": "stopped"
            }

        pid = proc["pid"]
        proc["runtime_state"] = "stopping"
        self._save_table()

        # Check native stop if service agent with verified native_stop
        adapter = get_adapter(proc["agent_id"])
        if adapter and adapter.runtime_type == "service" and adapter.verified and adapter.native_stop:
            try:
                subprocess.run(adapter.native_stop, capture_output=True, text=True, check=False, timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                pass

        # Kill managed process tree to ensure no orphan processes
        killed = kill_process_tree(pid)
        proc["runtime_state"] = "stopped" if killed else "failed"
        proc["exit_code"] = 0 if killed else -1
        self._save_table()

        return {
            "success": killed,
            "agent_id": proc["agent_id"],
            "pid": pid,
            "runtime_state": proc["runtime_state"]
        }

    def get_logs(self, agent_id_or_pid: str | int, lines: int = 50) -> dict:
        """Read captured stdout and stderr for a managed process."""
        proc_status = self.get_process_status(agent_id_or_pid)
        stdout_path = proc_status.get("stdout_path", "")
        stderr_path = proc_status.get("stderr_path", "")

        stdout_content = ""
        stderr_content = ""

        if stdout_path and os.path.isfile(stdout_path):
            try:
                with open(stdout_path, "r", encoding="utf-8", errors="replace") as f:
                    all_lines = f.readlines()
                    stdout_content = "".join(all_lines[-lines:])
            except OSError:
                pass

        if stderr_path and os.path.isfile(stderr_path):
            try:
                with open(stderr_path, "r", encoding="utf-8", errors="replace") as f:
                    all_lines = f.readlines()
                    stderr_content = "".join(all_lines[-lines:])
            except OSError:
                pass

        return {
            "agent_id": proc_status.get("agent_id"),
            "pid": proc_status.get("pid"),
            "stdout": stdout_content,
            "stderr": stderr_content,
            "stdout_path": stdout_path,
            "stderr_path": stderr_path
        }
