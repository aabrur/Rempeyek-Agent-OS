"""Unit tests for Process Manager module."""

from __future__ import annotations

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

SRC_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if SRC_PATH not in sys.path:
    sys.path.insert(0, SRC_PATH)

from rempeyek.process import ProcessManager, _is_pid_running, kill_process_tree


class TestProcessManager(unittest.TestCase):
    """Test suite for Rempeyek Process Manager."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="rempeyek-proc-test-")
        self.table_path = Path(self.tmp_dir) / "process-table.json"
        self.pm = ProcessManager(table_path=self.table_path)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_spawn_and_stop_process(self):
        # Spawn a python process as a managed process test
        res = self.pm.spawn_process("antigravity", action_type="gateway_run", extra_args=["--help"])
        self.assertTrue(res.get("success"), msg=f"Spawn failed: {res}")
        proc = res.get("process", {})
        pid = proc.get("pid")
        self.assertIsNotNone(pid)
        self.assertGreater(pid, 0)
        self.assertEqual(proc.get("runtime_state"), "running")

        # Check status
        status = self.pm.get_process_status("antigravity")
        self.assertIn(status.get("runtime_state"), ("running", "stopped"))

        # Stop process
        stop_res = self.pm.stop_process("antigravity")
        self.assertTrue(stop_res.get("success"))
        self.assertEqual(stop_res.get("runtime_state"), "stopped")

    def test_prevent_duplicate_gateway_run(self):
        res1 = self.pm.spawn_process("antigravity", action_type="gateway_run", extra_args=["--help"])
        if res1.get("success"):
            # Attempting second spawn for same action while running should be blocked
            res2 = self.pm.spawn_process("antigravity", action_type="gateway_run")
            self.assertFalse(res2.get("success"))
            self.assertIn("already active", res2.get("error", ""))
            self.pm.stop_process("antigravity")

    def test_get_logs_captures_output(self):
        res = self.pm.spawn_process("antigravity", action_type="gateway_run", extra_args=["--help"])
        if res.get("success"):
            time.sleep(0.5)
            logs = self.pm.get_logs("antigravity", lines=20)
            self.assertIsInstance(logs.get("stdout"), str)
            self.assertIsInstance(logs.get("stderr"), str)
            self.pm.stop_process("antigravity")

    def test_stale_pid_cleanup(self):
        # Add a fake process record with a dead PID
        fake_pid = 999999
        self.pm._table["fake-999999"] = {
            "agent_id": "fake",
            "pid": fake_pid,
            "child_pids": [],
            "command": "fake",
            "args": [],
            "cwd": self.tmp_dir,
            "action_type": "gateway_run",
            "start_time": "2026-08-02T10:00:00Z",
            "exit_code": None,
            "runtime_state": "running",
            "stdout_path": "",
            "stderr_path": "",
        }
        self.pm._save_table()

        self.pm.cleanup_stale()
        updated = self.pm._table["fake-999999"]
        self.assertEqual(updated["runtime_state"], "failed")

    def test_spawn_nonexistent_binary_returns_unavailable(self):
        # Temporarily mock adapter with invalid candidate
        from rempeyek.adapters import CommandAdapter, ADAPTERS
        ADAPTERS["fake-agent"] = CommandAdapter(
            agent_id="fake-agent",
            display_name="Fake Agent",
            runtime_type="task",
            binary_candidates=["nonexistent_binary_xyz_12345.exe"],
            summon_command=["nonexistent_binary_xyz_12345.exe"],
            gateway_run_command=["nonexistent_binary_xyz_12345.exe"],
            version_command=["nonexistent_binary_xyz_12345.exe"],
            verified=False
        )
        try:
            res = self.pm.spawn_process("fake-agent", action_type="gateway_run")
            self.assertFalse(res.get("success"))
            self.assertEqual(res.get("runtime_state"), "unavailable")
        finally:
            ADAPTERS.pop("fake-agent", None)


if __name__ == "__main__":
    unittest.main()
