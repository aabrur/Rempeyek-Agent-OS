"""Access policy: deny-by-default allowlist, sensitive path denial, redaction."""

from __future__ import annotations

import fnmatch
import os
import re
from pathlib import Path

from . import paths
from .atomicio import atomic_write_json, now_iso, read_json

SENSITIVE_SUBPATHS = [
    ".ssh", ".gnupg", "Microsoft/Credentials", "Google/Chrome/User Data",
    "Microsoft/Edge/User Data", "Mozilla/Firefox/Profiles",
]

DEFAULT_POLICY = {
    "schema_version": 1,
    "default": "deny",
    "allowed_roots": [],
    "denied_roots": [],
    "allowed_extensions": [".md", ".txt", ".json", ".yaml", ".yml", ".py",
                           ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"],
    "denied_extensions": [".pem", ".key", ".pfx", ".p12", ".kdbx"],
    "denied_globs": ["*.env", ".env.*", "*credentials*", "*secrets*",
                     "*node_modules*", "*.git/*"],
    "max_file_size": 2_000_000,
    "follow_symlinks": False,
    "allow_network_paths": False,
    "allow_hidden_files": False,
    "require_approval_for": ["mirror_mode", "destructive_repair", "warehouse_write"],
    "redaction_patterns": [
        r"(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*\S+",
        r"sk-[A-Za-z0-9]{20,}",
        r"AKIA[0-9A-Z]{16}",
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    ],
}


def policy_path() -> Path:
    return paths.config_root() / "access-policy.json"


def load_policy() -> dict:
    pol = read_json(policy_path(), default=None)
    if not isinstance(pol, dict):
        pol = dict(DEFAULT_POLICY)
        atomic_write_json(policy_path(), pol)
    return pol


def _log_denial(path: str, reason: str) -> None:
    log = paths.logs_root() / "access-denials.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"{now_iso()} DENY {reason} path={path}\n")


def is_sensitive(p: Path) -> bool:
    s = str(p).replace("\\", "/").lower()
    return any(sub.lower() in s for sub in SENSITIVE_SUBPATHS)


def check_access(path: str | Path, policy: dict | None = None) -> tuple[bool, str]:
    """Canonical-resolve and evaluate. Returns (allowed, reason)."""
    policy = policy or load_policy()
    try:
        p = Path(path)
        rp = p.resolve()
    except OSError as exc:
        return False, f"unresolvable: {exc}"

    if not policy.get("follow_symlinks", False) and p.exists() and p.is_symlink():
        _log_denial(str(rp), "symlink")
        return False, "symlink escape blocked"

    if is_sensitive(rp):
        _log_denial(str(rp), "sensitive-location")
        return False, "sensitive location requires elevated approval"

    for dr in policy.get("denied_roots", []):
        if str(rp).lower().startswith(str(Path(dr).resolve()).lower()):
            _log_denial(str(rp), "denied-root")
            return False, "denied root"

    name = rp.name.lower()
    if rp.suffix.lower() in policy.get("denied_extensions", []):
        _log_denial(str(rp), "denied-extension")
        return False, "denied extension"
    for g in policy.get("denied_globs", []):
        if fnmatch.fnmatch(name, g) or fnmatch.fnmatch(str(rp).replace("\\", "/"), "*" + g.strip("*") + "*"):
            _log_denial(str(rp), f"denied-glob:{g}")
            return False, f"denied glob {g}"

    allowed_roots = [paths.runtime_root(), paths.skill_warehouse()] + \
        [Path(r).resolve() for r in policy.get("allowed_roots", [])]
    for ar in allowed_roots:
        try:
            if rp == ar or ar in rp.parents:
                if rp.is_file() and rp.stat().st_size > policy.get("max_file_size", 2_000_000):
                    return False, "exceeds max_file_size"
                return True, "allowed"
        except OSError:
            continue

    _log_denial(str(rp), "not-allowlisted")
    return False, "deny by default (not registered/allowlisted)"


def redact(text: str, policy: dict | None = None) -> str:
    policy = policy or load_policy()
    for pat in policy.get("redaction_patterns", []):
        text = re.sub(pat, "[REDACTED]", text)
    return text
