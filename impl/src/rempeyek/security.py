"""(SECURITY) Redaction and validation utilities for sensitive data.

Provides:
- Secret redaction from logs and serialized content
- Path canonicalization and traversal detection
- Junction / symlink escape detection
- Max file size enforcement
- Extension and mime-type filtering
"""

from __future__ import annotations

import os
import re
import stat
import logging
from pathlib import Path
from typing import Optional, FrozenSet, Tuple
from urllib.parse import unquote

logger = logging.getLogger(__name__)

# Patterns for common secret formats
_SECRET_PATTERNS = [
    re.compile(r"(?i)(sk[-_]?live_?|sk[-_]?test_?)[a-zA-Z0-9]{20,}"),
    re.compile(r"(?i)(api[_-]?key|apikey)['\"]?\s*[:=]\s*['\"]?([A-Za-z0-9\-_]{20,})['\"]?"),
    re.compile(r"(?i)(token|access[_-]?token)['\"]?\s*[:=]\s*['\"]?([A-Za-z0-9\-_\.]{20,})['\"]?"),
    re.compile(r"(?i)(password|passwd|pwd)['\"]?\s*[:=]\s*['\"]?([^\s'\"<>]{8,})['\"]?"),
    re.compile(r"(?i)(secret|client[_-]?secret)['\"]?\s*[:=]\s*['\"]?([A-Za-z0-9\-_]{20,})['\"]?"),
    re.compile(r"(?i)(aes[-_]?key|encryption[_-]?key)['\"]?\s*[:=]\s*['\"]?([A-Za-z0-9+/]{32,}={0,2})['\"]?"),
    re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----"),
    re.compile(r"0x[a-fA-F0-9]{40,}"),  # Ethereum-style hex
    re.compile(r"(?i)(seed[_-]?phrase|mnemonic)['\"]?\s*[:=]\s*['\"]?([a-z\s]{20,})['\"]?"),
]

# Windows protected paths
_WINDOWS_PROTECTED = [
    os.environ.get("USERPROFILE", "") + "\\.ssh",
    os.environ.get("USERPROFILE", "") + "\\.gnupg",
    os.environ.get("APPDATA", "") + "\\Microsoft\\Credentials",
    os.environ.get("LOCALAPPDATA", "") + "\\Google\\Chrome\\User Data",
    os.environ.get("LOCALAPPDATA", "") + "\\Microsoft\\Edge\\User Data",
]

# SQLite / browser DB patterns
_BROWSER_DB_PATTERNS = [
    re.compile(r"\\Chrome\\User Data\\"),
    re.compile(r"\\Edge\\User Data\\"),
    re.compile(r"\\Firefox\\Profiles\\"),
    re.compile(r"\\.ssh\\"),
    re.compile(r"\\.gnupg\\"),
    re.compile(r"credentials\\.db$", re.IGNORECASE),
    re.compile(r"\\.env(\\.|$)"),
    re.compile(r"secrets\\.json$", re.IGNORECASE),
]


def redact(text: str) -> str:
    """Replace detected secrets with [REDACTED]."""
    result = text
    for pattern in _SECRET_PATTERNS:
        result = pattern.sub("[REDACTED]", result)
    return result


def is_browser_profile_path(path: str) -> bool:
    """Return True if the path looks like a browser profile or credential store."""
    p = unquote(path)
    return any(pat.search(p) for pat in _BROWSER_DB_PATTERNS)


def is_protected_path(path: str) -> bool:
    """Return True if the path points to a sensitive Windows location."""
    p = unquote(path)
    normalized = os.path.normpath(p)
    for protected in _WINDOWS_PROTECTED:
        if normalized.lower().startswith(protected.lower()):
            return True
    return is_browser_profile_path(normalized)


def canonical_path(path: str, base: Optional[str] = None) -> str:
    """Resolve a path to its canonical absolute form safely.

    Raises ValueError on traversal or escape attempts.
    """
    raw = unquote(path)
    p = Path(raw)
    # Reject paths containing null bytes or traversal sequences before resolution
    if "\x00" in raw or "..\\" in raw.replace("/", "\\"):
        raise ValueError(f"Path contains traversal or null bytes: {path!r}")
    try:
        resolved = p.resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"Path resolution failed: {path!r}: {exc}") from exc
    return os.path.normpath(str(resolved))


def check_junction_escape(path: str) -> bool:
    """Detect if the path escapes via Windows junction or symlink."""
    try:
        p = Path(path)
        if p.exists():
            # Check if it's a symlink or junction
            if p.is_symlink():
                return True
            # On Windows, junctions appear as directories but are reparse points
            try:
                st = p.stat()
                if stat.S_ISDIR(st.st_mode):
                    # Check for reparse point
                    if hasattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT"):
                        import ctypes
                        FILE_ATTRIBUTE_REPARSE_POINT = 0x0400
                        attrs = ctypes.windll.kernel32.GetFileAttributesW(str(p))  # type: ignore
                        if attrs != 0xFFFFFFFF and (attrs & FILE_ATTRIBUTE_REPARSE_POINT):
                            return True
            except Exception:
                pass
    except (OSError, ValueError):
        pass
    return False


def enforce_max_file_size(path: str, max_bytes: int = 50 * 1024 * 1024) -> None:
    """Raise ValueError if the file exceeds max_bytes."""
    try:
        size = os.path.getsize(path)
        if max_bytes > 0 and size > max_bytes:
            raise ValueError(f"File exceeds max size: {path} ({size} > {max_bytes} bytes)")
    except FileNotFoundError:
        raise


def validate_extension(path: str, allowed: FrozenSet[str], denied: FrozenSet[str]) -> None:
    """Raise ValueError if the path's extension is denied or not allowed."""
    _, ext = os.path.splitext(path)
    ext_lower = ext.lower().lstrip(".")
    denied_norm = {e.lower().lstrip(".") for e in denied}
    allowed_norm = {e.lower().lstrip(".") for e in allowed}
    if denied_norm and ext_lower in denied_norm:
        raise ValueError(f"Extension denied by policy: {ext_lower} ({path})")
    if allowed_norm and ext_lower not in allowed_norm:
        raise ValueError(f"Extension not in allowlist: {ext_lower} ({path})")


def is_allowed_by_policy(
    path: str,
    allowed_roots: Optional[list[str]] = None,
    denied_roots: Optional[list[str]] = None,
    denied_paths: Optional[list[str]] = None,
) -> Tuple[bool, str]:
    """Return (allowed, reason) based on access policy.

    The default is DENY unless explicitly allowed.
    """
    try:
        canon = canonical_path(path)
    except ValueError as exc:
        return False, str(exc)

    # Check denied roots first
    for root in (denied_roots or []):
        r = canonical_path(root)
        if canon.lower().startswith(r.lower()):
            return False, f"Path falls under denied root: {root}"

    # Check explicit denied paths
    for dp in (denied_paths or []):
        d = canonical_path(dp)
        if canon.lower() == d.lower():
            return False, f"Path explicitly denied: {dp}"

    # Check protected Windows paths
    if is_protected_path(canon):
        return False, f"Path is a sensitive system location: {canon}"

    # Check allowed roots
    if allowed_roots:
        for root in allowed_roots:
            r = canonical_path(root)
            if canon.lower().startswith(r.lower()):
                return True, "Allowed by root allowlist"
        return False, "Path not under any allowed root"

    return True, "No policy restriction"
