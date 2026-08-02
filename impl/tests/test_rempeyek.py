"""Comprehensive test suite for Rempeyek Agent OS unified AI family system."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from typing import Any


def _setup_test_root():
    """Create a temporary runtime root and set REMPEYEK_ROOT."""
    root = tempfile.mkdtemp(prefix="rempeyek-test-")
    os.environ["REMPEYEK_ROOT"] = root
    return root


def _teardown_test_root(root):
    shutil.rmtree(root, ignore_errors=True)
    os.environ.pop("REMPEYEK_ROOT", None)


class TestRuntimePaths(unittest.TestCase):
    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek import runtime, paths
        self.runtime = runtime
        self.paths = paths

    def test_runtime_root_returns_rempeyek_path(self):
        root = str(self.runtime.runtime_root()).lower()
        self.assertTrue(root.endswith("\\rempeyek-agent-os") or root.endswith("/rempeyek-agent-os"))

    def test_vault_root_under_runtime(self):
        vault = str(self.paths.vault_root())
        runtime = str(self.runtime.runtime_root())
        self.assertTrue(vault.lower().startswith(runtime.lower()))

    def test_agents_root_under_runtime(self):
        agents = str(self.paths.agents_root())
        runtime = str(self.runtime.runtime_root())
        self.assertTrue(agents.lower().startswith(runtime.lower()))

    def test_skill_warehouse_under_home(self):
        wh = str(self.paths.skill_warehouse()).lower()
        self.assertTrue(wh.endswith("\\.skills") or wh.endswith("/.skills"))

    def test_ensure_directories_creates_vault(self):
        created = self.runtime.ensure_directories()
        vault_path = str(self.runtime.vault_root()).lower()
        self.assertTrue(os.path.isdir(vault_path), msg=f"Vault dir missing: {vault_path}")


class TestSecurity(unittest.TestCase):
    """Path security, redaction, protected paths, extension enforcement."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek.security import canonical_path, is_protected_path, validate_extension, redact as _redact
        from rempeyek.access import is_sensitive
        self.canonical = canonical_path
        self.is_protected = is_protected_path
        self.validate_ext = validate_extension
        self.redact = _redact
        self.is_sensitive = is_sensitive

    def test_canonical_path_resolves_to_absolute(self):
        result = self.canonical(".")
        self.assertTrue(os.path.isabs(result))

    def test_canonical_path_blocks_traversal(self):
        with self.assertRaises(ValueError):
            self.canonical("..\\..\\Windows\\System32")

    def test_is_protected_path_detects_ssh(self):
        profile = os.environ.get("USERPROFILE", "")
        path = os.path.join(profile, ".ssh", "id_rsa")
        self.assertTrue(self.is_protected(path))

    def test_validate_extension_allows_md(self):
        self.validate_ext("/x/note.md", frozenset({"md", "json"}), frozenset())

    def test_validate_extension_denies_pem(self):
        with self.assertRaises(ValueError):
            self.validate_ext("/x/key.pem", frozenset({"md"}), frozenset({"pem"}))

    def test_redact_apikey(self):
        text = "apiKey=sk-live-ABCDEFGHIJKLMNOP"
        res = self.redact(text)
        self.assertIn("[REDACTED]", res)

    def test_redact_password(self):
        text = "password='SuperSecret123'"
        res = self.redact(text)
        self.assertIn("[REDACTED]", res)

    def test_redact_ethereum_address(self):
        text = "wallet=0x742d35Cc6634C0532925a3b844Bc9e7595f12345"
        res = self.redact(text)
        self.assertIn("[REDACTED]", res)

    def test_is_sensitive_detects_ssh_path(self):
        profile = os.environ.get("USERPROFILE", "")
        ssh = os.path.join(profile, ".ssh")
        if os.path.isdir(ssh):
            self.assertTrue(self.is_sensitive(ssh))


class TestAccessPolicy(unittest.TestCase):
    """Access policy enforcement."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek.access import load_policy, check_access, is_sensitive
        self.load_policy = load_policy
        self.check_access = check_access
        self.is_sensitive = is_sensitive

    def test_load_policy_returns_dict(self):
        policy = self.load_policy()
        self.assertIsInstance(policy, dict)

    def test_protected_path_denied(self):
        profile = os.environ.get("USERPROFILE", "")
        ssh = os.path.join(profile, ".ssh")
        policy = self.load_policy()
        ok, reason = self.check_access(ssh, policy)
        self.assertFalse(ok)


class TestFamilyRegistry(unittest.TestCase):
    """AI family registry persistence, node registration, determinism."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek.runtime import load_or_create_family_registry, save_family_registry, register_node
        from rempeyek.family import load_registry, register_agent
        self.root = _setup_test_root()
        self.load_registry = load_registry
        self.register_agent = register_agent
        self.register_node = register_node
        self.save_family_registry = save_family_registry

    def tearDown(self):
        _teardown_test_root(self.root)

    def test_register_node_persists(self):
        reg = self.load_registry()
        self.assertIn("nodes", reg)

    def test_register_agent_creates_node(self):
        reg = self.register_agent(agent_id="test-agent", display_name="TestAgent", provider="other", role="test")
        self.assertIn("node_id", reg)

    def test_register_agent_idempotent(self):
        n1 = self.register_agent(agent_id="dup-agent", display_name="First", provider="other")
        n2 = self.register_agent(agent_id="dup-agent", display_name="Second", provider="other")
        self.assertEqual(n1["node_id"], n2["node_id"])

    def test_node_persists_across_loads(self):
        self.register_agent(agent_id="persist-agent", display_name="Persist", provider="other")
        reg = self.load_registry()
        found = next((n for n in reg["nodes"] if n["agent_id"] == "persist-agent"), None)
        self.assertIsNotNone(found)

    def test_builtin_21_agents_registry(self):
        cfg_path = os.path.join(os.path.dirname(__file__), "..", "..", "agents.config.json")
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        agents = cfg.get("agents", [])
        self.assertEqual(len(agents), 21)
        
        agent_ids = [a["id"] for a in agents]
        self.assertEqual(len(agent_ids), len(set(agent_ids)))
        self.assertNotIn("gemini-cli", agent_ids)
        self.assertIn("antigravity", agent_ids)
        
        grok = next(a for a in agents if a["id"] == "grok-build")
        self.assertEqual(grok["name"], "Grok Build")
        self.assertEqual(grok["gateway"]["trigger"], "grok")
        self.assertTrue(grok["gateway"]["home"].endswith(".grok"))

        cmdc = next(a for a in agents if a["id"] == "command-code")
        self.assertEqual(cmdc["name"], "Command Code")
        self.assertEqual(cmdc["gateway"]["trigger"], "cmdc")
        self.assertNotEqual(cmdc["gateway"]["trigger"], "cmd")
        self.assertTrue(cmdc["gateway"]["home"].endswith(".commandcode"))

        from rempeyek.runtime import migrate_from_agents_config
        reg = migrate_from_agents_config(cfg_path)
        self.assertEqual(len(reg["nodes"]), 21)


class TestVaultInit(unittest.TestCase):
    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek import vault, runtime
        self.vault = vault
        self.runtime = runtime
        self.root = _setup_test_root()
        self._patch_runtime(self.root)

    def _patch_runtime(self, root):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        from pathlib import Path
        self._orig = {}
        mapping = {
            'runtime_root': root,
            'vault_root': os.path.join(root, "Vault"),
            'agents_root': os.path.join(root, "Agents"),
            'config_root': os.path.join(root, "Config"),
            'logs_root': os.path.join(root, "Logs"),
            'quarantine_root': os.path.join(root, "Quarantine"),
        }
        for name, value in mapping.items():
            self._orig[name] = getattr(rt, name)
            setattr(rt, name, lambda v=value: v)
        self._orig_paths_vault = p.vault_root
        p.vault_root = lambda: Path(root) / "Vault"

    def tearDown(self):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        for name, func in self._orig.items():
            setattr(rt, name, func)
        p.vault_root = self._orig_paths_vault
        _teardown_test_root(self.root)

    def test_init_creates_required_dirs(self):
        result = self.vault.init_vault()
        self.assertIn("created", result)
        from rempeyek.paths import VAULT_DIRS
        for d in VAULT_DIRS[:5]:
            p = os.path.join(self.runtime.vault_root(), d)
            self.assertTrue(os.path.isdir(p), msg=f"Missing: {p}")

    def test_init_is_idempotent(self):
        self.vault.init_vault()
        result2 = self.vault.init_vault()
        self.assertIn("created", result2)

    def test_health_reports_ok_after_init(self):
        self.vault.init_vault()
        report = self.vault.health()
        self.assertTrue(report.get("healthy"))

    def test_existing_user_content_preserved(self):
        proj_dir = os.path.join(self.runtime.vault_root(), "02-Projects", "myproject")
        os.makedirs(proj_dir, exist_ok=True)
        existing = os.path.join(proj_dir, "existing.md")
        with open(existing, "w") as f:
            f.write("# existing")
        self.vault.init_vault()
        self.assertTrue(os.path.exists(existing))


class TestSessionLifecycle(unittest.TestCase):
    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek import sessions
        self.sessions = sessions
        self.root = _setup_test_root()
        self._patch_runtime(self.root)

    def _patch_runtime(self, root):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        from pathlib import Path
        self._orig = {}
        mapping = {
            'runtime_root': root,
            'vault_root': os.path.join(root, "Vault"),
            'agents_root': os.path.join(root, "Agents"),
        }
        for name, value in mapping.items():
            self._orig[name] = getattr(rt, name)
            setattr(rt, name, lambda v=value: v)
        self._orig_paths_vault = p.vault_root
        p.vault_root = lambda: Path(root) / "Vault"

    def tearDown(self):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        for name, func in self._orig.items():
            setattr(rt, name, func)
        p.vault_root = self._orig_paths_vault
        _teardown_test_root(self.root)

    def test_start_session_creates_active_file(self):
        rec = self.sessions.start_session("Node-1", "agent-1", "Test task", "proj-1")
        self.assertEqual(rec["status"], "active")
        active_dir = self.sessions.active_sessions_dir()
        os.makedirs(active_dir, exist_ok=True)
        files = [f for f in os.listdir(active_dir) if f.endswith(".json")]
        self.assertGreaterEqual(len(files), 1)

    def test_complete_session_moves_to_completed(self):
        rec = self.sessions.start_session("Node-1", "agent-1", "Task", "")
        sid = rec["session_id"]
        os.makedirs(self.sessions.completed_sessions_dir(), exist_ok=True)
        result = self.sessions.complete_session(sid, {"result": "done"})
        self.assertEqual(result["status"], "completed")
        completed = self.sessions.completed_sessions_dir()
        files = [f for f in os.listdir(completed) if f.endswith(".json") and f.startswith(sid)]
        self.assertEqual(len(files), 1)

    def test_fail_session_moves_to_failed(self):
        rec = self.sessions.start_session("Node-1", "agent-1", "Task", "")
        sid = rec["session_id"]
        os.makedirs(self.sessions.failed_sessions_dir(), exist_ok=True)
        result = self.sessions.fail_session(sid, "boom")
        self.assertEqual(result["status"], "failed")

    def test_abandoned_session_detection(self):
        self.sessions.start_session("Node-1", "agent-1", "Left open", "")
        abandoned = self.sessions.detect_interrupted_sessions()
        self.assertGreaterEqual(len(abandoned), 1)


class TestGraphify(unittest.TestCase):
    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek import graphify
        self.graphify = graphify
        self.root = _setup_test_root()
        self._patch_runtime(self.root)

    def _patch_runtime(self, root):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        from pathlib import Path
        self._orig = {}
        mapping = {
            'runtime_root': root,
            'vault_root': os.path.join(root, "Vault"),
            'agents_root': os.path.join(root, "Agents"),
        }
        for name, value in mapping.items():
            self._orig[name] = getattr(rt, name)
            setattr(rt, name, lambda v=value: v)
        self._orig_paths_vault = p.vault_root
        p.vault_root = lambda: Path(root) / "Vault"

    def tearDown(self):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        for name, func in self._orig.items():
            setattr(rt, name, func)
        p.vault_root = self._orig_paths_vault
        _teardown_test_root(self.root)

    def test_add_node_creates_provenance(self):
        node = {"id": "node-1", "name": "Arch.md", "type": "Document", "sourcePath": "C:\\x\\y.md", "sourceHash": "abc123", "confidence": "verified"}
        result = self.graphify.add_graph_node(node)
        self.assertIsNotNone(result)
        idx = self.graphify.load_graph_index()
        node_names = [n.get("name") for n in idx.get("nodes", [])]
        self.assertIn("Arch.md", node_names)

    def test_add_edge_links_nodes(self):
        node_a = {"id": "a", "name": "A", "type": "Document", "sourcePath": "C:\\a", "sourceHash": "1", "confidence": "verified"}
        node_b = {"id": "b", "name": "B", "type": "Document", "sourcePath": "C:\\b", "sourceHash": "2", "confidence": "verified"}
        self.graphify.add_graph_node(node_a)
        self.graphify.add_graph_node(node_b)
        edge = {"from": "a", "to": "b", "type": "DOCUMENT_REFERENCES", "confidence": "verified"}
        result = self.graphify.add_graph_edge(edge)
        self.assertIsNotNone(result)

    def test_query_finds_matches(self):
        self.graphify.add_graph_node({"id": "n1", "name": "Architecture", "type": "Document", "sourcePath": "C:\\a", "sourceHash": "1", "confidence": "verified"})
        self.graphify.add_graph_node({"id": "n2", "name": "Decision", "type": "Decision", "sourcePath": "C:\\b", "sourceHash": "2", "confidence": "verified"})
        idx = self.graphify.load_graph_index()
        matches = [n for n in idx.get("nodes", []) if "arch" in n.get("name", "").lower()]
        self.assertEqual(len(matches), 1)


class TestBootstrap(unittest.TestCase):
    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek import vault, runtime, family
        self.vault = vault
        self.runtime = runtime
        self.family = family
        self.root = _setup_test_root()
        self._patch_runtime(self.root)

    def _patch_runtime(self, root):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        from pathlib import Path
        self._orig = {}
        mapping = {
            'runtime_root': root,
            'vault_root': os.path.join(root, "Vault"),
            'agents_root': os.path.join(root, "Agents"),
            'config_root': os.path.join(root, "Config"),
            'logs_root': os.path.join(root, "Logs"),
            'quarantine_root': os.path.join(root, "Quarantine"),
        }
        for name, value in mapping.items():
            self._orig[name] = getattr(rt, name)
            setattr(rt, name, lambda v=value: v)
        self._orig_paths_vault = p.vault_root
        p.vault_root = lambda: Path(root) / "Vault"

    def tearDown(self):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        for name, func in self._orig.items():
            setattr(rt, name, func)
        p.vault_root = self._orig_paths_vault
        _teardown_test_root(self.root)

    def test_bootstrap_produces_healthy_vault(self):
        self.runtime.ensure_directories()
        self.vault.init_vault()
        report = self.vault.health()
        self.assertTrue(report.get("healthy"))

    def test_bootstrap_is_idempotent(self):
        self.runtime.ensure_directories()
        self.vault.init_vault()
        self.vault.init_vault()
        report = self.vault.health()
        self.assertTrue(report.get("healthy"))

    def test_bootstrap_registers_agents_from_config(self):
        import json
        cfg = {
            "agency": "REMPEYEK",
            "workdir": "C:\\Users\\abrur",
            "agents": [
                {"id": "a1", "name": "Agent One", "role": "r", "node": "Node-1", "lane": "A1", "enabled": True, "gateway": {"home": "C:\\a1", "workdir": "X", "trigger": "a1"}},
            ],
        }
        cfg_path = os.path.join(self.root, "agents.config.json")
        with open(cfg_path, "w") as f:
            json.dump(cfg, f)
        reg = self.runtime.migrate_from_agents_config(cfg_path)
        nodes = [n for n in reg.get("nodes", []) if n.get("agent_id") == "a1"]
        self.assertEqual(len(nodes), 1)


class TestSharedMemory(unittest.TestCase):
    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek import memory
        self.memory = memory
        self.root = _setup_test_root()
        self._patch_runtime(self.root)

    def _patch_runtime(self, root):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        from pathlib import Path
        self._orig = {}
        mapping = {
            'runtime_root': root,
            'vault_root': os.path.join(root, "Vault"),
            'agents_root': os.path.join(root, "Agents"),
        }
        for name, value in mapping.items():
            self._orig[name] = getattr(rt, name)
            setattr(rt, name, lambda v=value: v)
        self._orig_paths_vault = p.vault_root
        p.vault_root = lambda: Path(root) / "Vault"

    def tearDown(self):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        for name, func in self._orig.items():
            setattr(rt, name, func)
        p.vault_root = self._orig_paths_vault
        _teardown_test_root(self.root)

    def test_write_private_memory(self):
        mem_id = self.memory.write_private_memory("Node-1", {"title": "Test", "content": "body"})
        self.assertIsNotNone(mem_id)

    def test_promote_memory_to_shared(self):
        mem = {"title": "Promote me", "content": "body", "status": "candidate"}
        result = self.memory.promote_memory(mem, "Node-1")
        self.assertIn("success", result)

    def test_shared_index_load_save(self):
        idx = self.memory.load_shared_index()
        self.assertIn("memories", idx)
        self.memory.save_shared_index(idx)
        idx2 = self.memory.load_shared_index()
        self.assertEqual(idx.get("schema_version"), idx2.get("schema_version"))


class TestHandoff(unittest.TestCase):
    """Cross-node handoff creation and retrieval."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek import sessions
        self.sessions = sessions
        self.root = _setup_test_root()

    def tearDown(self):
        _teardown_test_root(self.root)

    def test_create_handoff_creates_md_and_json(self):
        rec = self.sessions.create_handoff(
            from_node="Node-1",
            session_id="s-1",
            project_id="proj",
            task_summary="Do work",
            completed_work=["step 1"],
            files_changed=["/x/y"],
            recommended_next="Continue",
        )
        handoffs_dir = self.sessions.handoffs_dir()
        files = [f for f in os.listdir(handoffs_dir) if f.endswith(".md") or f.endswith(".json")]
        self.assertGreaterEqual(len(files), 1)


class TestSkillsSync(unittest.TestCase):
    """Skill discovery, checksum, validation."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek import skills
        self.skills = skills
        self.root = _setup_test_root()

    def tearDown(self):
        _teardown_test_root(self.root)

    def test_compute_checksum(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("hello")
            f.flush()
            checksum = self.skills.compute_file_checksum(f.name)
        os.unlink(f.name)
        self.assertIsInstance(checksum, str)
        self.assertEqual(len(checksum), 64)

    def test_discover_skills_empty_warehouse(self):
        result = self.skills.discover_skills("/nonexistent/path")
        self.assertEqual(result, [])

    def test_validate_skill_returns_tuple(self):
        skill = {"skill_id": "x", "name": "x", "validation_status": "pending", "trust_status": "unverified", "checksum": "abc"}
        ok, msg = self.skills.validate_skill(skill)
        self.assertIsInstance(ok, bool)
        self.assertIsInstance(msg, str)


class TestRedaction(unittest.TestCase):
    """Secret redaction in logs and text."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek.security import redact as _redact
        self.redact = _redact

    def test_redact_apikey(self):
        text = "apiKey=sk-live-ABCDEFGHIJKLMNOP"
        res = self.redact(text)
        self.assertIn("[REDACTED]", res)

    def test_redact_password(self):
        text = "password='SuperSecret123'"
        res = self.redact(text)
        self.assertIn("[REDACTED]", res)

    def test_redact_ethereum_address(self):
        text = "wallet=0x742d35Cc6634C0532925a3b844Bc9e7595f12345"
        res = self.redact(text)
        self.assertIn("[REDACTED]", res)


class TestProjectRegistry(unittest.TestCase):
    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek.runtime import load_or_create_project_registry, save_project_registry, register_project
        from rempeyek import vault
        self.root = _setup_test_root()
        self.vault = vault
        self.register_project = register_project
        self.load_projects = load_or_create_project_registry
        self._patch_runtime(self.root)

    def _patch_runtime(self, root):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        from pathlib import Path
        self._orig = {}
        mapping = {
            'runtime_root': root,
            'vault_root': os.path.join(root, "Vault"),
            'agents_root': os.path.join(root, "Agents"),
            'config_root': os.path.join(root, "Config"),
            'logs_root': os.path.join(root, "Logs"),
            'quarantine_root': os.path.join(root, "Quarantine"),
        }
        for name, value in mapping.items():
            self._orig[name] = getattr(rt, name)
            setattr(rt, name, lambda v=value: v)
        self._orig_paths_vault = p.vault_root
        p.vault_root = lambda: Path(root) / "Vault"

    def tearDown(self):
        import rempeyek.runtime as rt
        import rempeyek.paths as p
        for name, func in self._orig.items():
            setattr(rt, name, func)
        p.vault_root = self._orig_paths_vault
        _teardown_test_root(self.root)

    def test_register_project(self):
        self.vault.init_vault()
        rec = self.register_project("testproj", "Test Project", self.root)
        self.assertEqual(rec["project_id"], "testproj")

    def test_project_is_idempotent(self):
        self.vault.init_vault()
        r1 = self.register_project("proj-x", "X", self.root)
        r2 = self.register_project("proj-x", "X updated", self.root)
        self.assertEqual(r1["project_id"], r2["project_id"])

    def test_list_projects(self):
        self.vault.init_vault()
        self.register_project("proj-list", "List", self.root)
        reg = self.load_projects()
        ids = [p["project_id"] for p in reg.get("projects", [])]
        self.assertIn("proj-list", ids)


class TestIO(unittest.TestCase):
    """FileLock and atomic I/O."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek.io import FileLock
        self.FileLock = FileLock
        self.root = _setup_test_root()

    def tearDown(self):
        _teardown_test_root(self.root)

    def test_file_lock_acquire_release(self):
        lock_path = os.path.join(self.root, ".test.lock")
        res = self.FileLock.acquire(lock_path, owner="test", timeout=2)
        self.assertTrue(res.acquired)
        self.FileLock.release(lock_path)
        self.assertFalse(self.FileLock.is_locked(lock_path))

    def test_file_lock_context_manager(self):
        lock_path = os.path.join(self.root, ".test2.lock")
        with self.FileLock.acquire(lock_path, owner="test", timeout=2):
            self.assertTrue(self.FileLock.is_locked(lock_path))
        self.assertFalse(self.FileLock.is_locked(lock_path))

    def test_atomic_write_json(self):
        import tempfile
        from rempeyek.atomicio import atomic_write_json, read_json
        from pathlib import Path
        p = Path(self.root) / "data.json"
        atomic_write_json(p, {"key": "value"})
        self.assertTrue(p.exists())
        data = read_json(p)
        self.assertEqual(data["key"], "value")


class TestModels(unittest.TestCase):
    """Pydantic-style model dict creation."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
        from rempeyek.models import create_session_dict, create_handoff_dict, make_memory_id
        self.create_session = create_session_dict
        self.create_handoff = create_handoff_dict
        self.make_memory_id = make_memory_id
        self.root = _setup_test_root()

    def tearDown(self):
        _teardown_test_root(self.root)

    def test_create_session_dict(self):
        sess = self.create_session("Node-1", "agent-1", "task", "proj")
        self.assertIn("session_id", sess)
        self.assertEqual(sess["node_id"], "Node-1")
        self.assertEqual(sess["status"], "active")

    def test_make_memory_id_generates_unique(self):
        ids = {self.make_memory_id() for _ in range(10)}
        self.assertEqual(len(ids), 10)


if __name__ == "__main__":
    unittest.main()
