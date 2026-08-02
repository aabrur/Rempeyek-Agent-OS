"""Unit tests for Command Adapters module."""

from __future__ import annotations

import os
import sys
import unittest

SRC_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if SRC_PATH not in sys.path:
    sys.path.insert(0, SRC_PATH)

from rempeyek.adapters import (
    ADAPTERS, get_adapter, list_adapters, resolve_binary, CommandAdapter
)


class TestCommandAdapters(unittest.TestCase):
    """Test suite for Command Adapter registry and resolution."""

    def test_all_21_adapters_registered(self):
        self.assertEqual(len(ADAPTERS), 21)
        expected_ids = {
            "hermes", "openclaw", "antigravity", "cline", "codex", "claude-code",
            "github-copilot-cli", "opencode", "qwen-code", "aider", "goose",
            "openhands", "mistral-vibe", "cursor-agent", "crush", "crimson-odyssey",
            "kimi-code", "kilo-code", "pi", "grok-build", "command-code"
        }
        self.assertEqual(set(ADAPTERS.keys()), expected_ids)

    def test_get_adapter_valid_agent(self):
        hermes = get_adapter("hermes")
        self.assertIsNotNone(hermes)
        self.assertEqual(hermes.runtime_type, "service")
        self.assertEqual(hermes.display_name, "Hermes")

    def test_antigravity_task_adapter(self):
        agy = get_adapter("antigravity")
        self.assertIsNotNone(agy)
        self.assertEqual(agy.runtime_type, "task")
        self.assertEqual(agy.summon_command, ["agy.cmd"])
        self.assertTrue(agy.verified)

    def test_grok_build_adapter(self):
        grok = get_adapter("grok-build")
        self.assertIsNotNone(grok)
        self.assertEqual(grok.agent_id, "grok-build")
        self.assertEqual(grok.summon_command, ["grok.cmd"])

    def test_command_code_adapter_no_cmd_conflict(self):
        cmdc = get_adapter("command-code")
        self.assertIsNotNone(cmdc)
        self.assertEqual(cmdc.agent_id, "command-code")
        self.assertEqual(cmdc.summon_command, ["cmdc.cmd"])
        self.assertNotIn("cmd.exe", cmdc.binary_candidates)
        self.assertTrue(cmdc.verified)

    def test_resolve_binary(self):
        bin_path = resolve_binary("antigravity")
        self.assertIsNotNone(bin_path)
        self.assertTrue(os.path.exists(bin_path))

    def test_list_adapters_returns_dicts(self):
        adapters_list = list_adapters()
        self.assertEqual(len(adapters_list), 21)
        self.assertIn("agent_id", adapters_list[0])
        self.assertIn("runtime_type", adapters_list[0])


if __name__ == "__main__":
    unittest.main()
