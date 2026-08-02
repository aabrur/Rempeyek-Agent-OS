"""Atomic JSON/text writes with revisions, built on FileLock (io.py)."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .io import FileLock


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def atomic_write_json(path: Path, data: Any, revisions: bool = False, max_revisions: int = 5) -> None:
    if revisions and path.exists():
        rev_dir = path.parent / ".revisions"
        rev_dir.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
        shutil.copy2(path, rev_dir / f"{path.stem}.{stamp}{path.suffix}")
        revs = sorted(rev_dir.glob(f"{path.stem}.*{path.suffix}"))
        for old in revs[:-max_revisions]:
            old.unlink(missing_ok=True)
    atomic_write_text(path, json.dumps(data, indent=2, ensure_ascii=False))


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def locked_update_json(path: Path, mutate, default: Any = None, revisions: bool = True) -> Any:
    """Read-mutate-write a JSON registry under a cross-process lock."""
    lock_path = str(path) + ".lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with FileLock.acquire(lock_path):
        data = read_json(path, default=default)
        data = mutate(data)
        atomic_write_json(path, data, revisions=revisions)
        return data
