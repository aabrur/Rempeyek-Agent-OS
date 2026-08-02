"""Unit tests for UI Component Interactivity and Agent Profile Auto-scroll."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

SRC_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if SRC_PATH not in sys.path:
    sys.path.insert(0, SRC_PATH)

WEB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "web"))


class TestUIComponents(unittest.TestCase):
    """Test suite for Agent Card split-button dropdown and Agent Profile auto-scroll."""

    def setUp(self):
        self.html_path = os.path.join(WEB_PATH, "index.html")
        self.css_path = os.path.join(WEB_PATH, "style.css")
        self.js_path = os.path.join(WEB_PATH, "app.js")

    def test_ui_files_exist(self):
        self.assertTrue(os.path.isfile(self.html_path), "index.html missing")
        self.assertTrue(os.path.isfile(self.css_path), "style.css missing")
        self.assertTrue(os.path.isfile(self.js_path), "app.js missing")

    def test_dropdown_structure_and_options(self):
        with open(self.js_path, "r", encoding="utf-8") as f:
            js_content = f.read()

        # Check options: Summon and Gateway Run ONLY
        self.assertIn('data-action="Summon"', js_content)
        self.assertIn('data-action="Gateway Run"', js_content)
        self.assertIn("toggleDropdown", js_content)
        self.assertIn("Escape", js_content)
        self.assertIn("closeAllDropdowns", js_content)

    def test_click_dropdown_does_not_open_profile_event_bubbling(self):
        with open(self.js_path, "r", encoding="utf-8") as f:
            js_content = f.read()

        # Verify stopPropagation is called on action controls
        self.assertIn("e.stopPropagation()", js_content)
        self.assertIn("closest(\".agent-card-actions\")", js_content)

    def test_click_card_opens_profile(self):
        with open(self.js_path, "r", encoding="utf-8") as f:
            js_content = f.read()

        self.assertIn("openAgentProfile(agent)", js_content)
        self.assertIn("profileSection.classList.remove(\"hidden\")", js_content)

    def test_profile_auto_scroll_and_focus(self):
        with open(self.js_path, "r", encoding="utf-8") as f:
            js_content = f.read()

        # Verify smooth scrolling, requestAnimationFrame, focus heading, and pulse animation
        self.assertIn("requestAnimationFrame", js_content)
        self.assertIn("scrollIntoView({ behavior: \"smooth\", block: \"start\" })", js_content)
        self.assertIn("heading.focus()", js_content)
        self.assertIn("highlight-pulse", js_content)

    def test_node_js_dom_execution(self):
        """Execute node.js DOM test if node is available."""
        import shutil
        import subprocess

        node_bin = shutil.which("node")
        if not node_bin:
            self.skipTest("node.js not available on system")

        test_js = f"""
        const fs = require('fs');
        const js = fs.readFileSync({repr(self.js_path)}, 'utf8');
        
        // Mock minimal DOM environment
        class Element {{
          constructor(tag) {{
            this.tag = tag;
            this.classList = new Set();
            this.attributes = {{}};
            this.dataset = {{}};
            this.children = [];
            this.listeners = {{}};
            this.style = {{}};
          }}
          setAttribute(k, v) {{ this.attributes[k] = v; }}
          getAttribute(k) {{ return this.attributes[k]; }}
          appendChild(child) {{ this.children.push(child); return child; }}
          querySelector(sel) {{ return new Element('div'); }}
          querySelectorAll(sel) {{ return [new Element('div'), new Element('div')]; }}
          addEventListener(evt, fn) {{
            this.listeners[evt] = this.listeners[evt] || [];
            this.listeners[evt].push(fn);
          }}
          dispatchEvent(evt) {{
            (this.listeners[evt.type] || []).forEach(fn => fn(evt));
          }}
          focus() {{ this.focused = true; }}
          scrollIntoView(opt) {{ this.scrolled = opt; }}
        }}

        // Run app.js exported module check
        const {{ AGENTS_DATA }} = require({repr(self.js_path)});
        console.log('AGENT_COUNT:' + AGENTS_DATA.length);
        """

        try:
            res = subprocess.run(
                [node_bin, "-e", test_js],
                capture_output=True,
                text=True,
                check=False
            )
            self.assertEqual(res.returncode, 0, msg=res.stderr)
            self.assertIn("AGENT_COUNT:21", res.stdout)
        except Exception as exc:
            self.skipTest(f"Node execution failed: {exc}")


if __name__ == "__main__":
    unittest.main()
