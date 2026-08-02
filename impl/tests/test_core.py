"""Tests for Rempeyek Agent OS."""
import json, os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

class TestRuntime:
    def test_runtime_root(self):
        from rempeyek.runtime import runtime_root
        assert "Rempeyek-Agent-OS" in runtime_root()

    def test_ensure_directories(self):
        from rempeyek.runtime import ensure_directories
        import shutil
        tmp = tempfile.mkdtemp()
        old = os.environ.get("LOCALAPPDATA", "")
        os.environ["LOCALAPPDATA"] = tmp
        try:
            import importlib
            from rempeyek import runtime
            importlib.reload(runtime)
            created = runtime.ensure_directories()
            assert len(created) > 0
        finally:
            os.environ["LOCALAPPDATA"] = old
            shutil.rmtree(tmp, ignore_errors=True)

    def test_register_node(self):
        import shutil
        tmp = tempfile.mkdtemp()
        old = os.environ.get("LOCALAPPDATA", "")
        os.environ["LOCALAPPDATA"] = tmp
        try:
            import importlib
            from rempeyek import runtime
            importlib.reload(runtime)
            reg = runtime.load_or_create_family_registry()
            reg["nodes"] = []
            node = runtime.register_node(reg, "Node-T", "t", "T", "t")
            assert node["node_id"] == "Node-T"
        finally:
            os.environ["LOCALAPPDATA"] = old
            shutil.rmtree(tmp, ignore_errors=True)

class TestSecurity:
    def test_redact(self):
        from rempeyek.security import redact
        assert "[REDACTED]" in redact("api_key=1234567890abcdefghijklmnopqrstuvwxyz")

    def test_protected_path(self):
        from rempeyek.security import is_protected_path
        assert is_protected_path("C:\\Users\\test\\.ssh\\id_rsa")

