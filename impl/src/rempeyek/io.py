"""(SECURITY) File lock manager using Windows-safe mknod equivalent.

Uses mkdir as an atomic directory-based file lock on Windows to avoid
relying on OS file locking semantics. Supports timeout and stale detection.
"""

from __future__ import annotations

import os
import time
import threading
from dataclasses import dataclass, field
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class LockResult:
    acquired: bool
    lock_path: str = ""
    owner: str = ""
    message: str = ""

    def __enter__(self):
        if not self.acquired:
            raise RuntimeError(f"Lock not acquired: {self.message}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        FileLock.release(self.lock_path)
        return False


class FileLock:
    """Cross-platform file lock using directory atomicity on Windows."""

    DEFAULT_TIMEOUT = 30.0
    STALE_THRESHOLD = 300.0  # 5 minutes

    _local = threading.local()

    @classmethod
    def acquire(cls, lock_path: str, owner: str = "", timeout: float = DEFAULT_TIMEOUT) -> LockResult:
        """Acquire a file lock.

        On Windows we create a marker directory atomically via mkdir.
        mkdir is atomic on NTFS even across processes, making it a safe lock.

        Returns a LockResult that can be used as a context manager.
        """
        start = time.monotonic()
        pid = os.getpid()
        owner_id = owner or f"pid-{pid}"

        while True:
            try:
                os.mkdir(lock_path)
                logger.debug("Acquired lock: %s (owner=%s)", lock_path, owner_id)
                return LockResult(
                    acquired=True,
                    lock_path=lock_path,
                    owner=owner_id,
                    message="",
                )
            except FileExistsError:
                # Check staleness
                try:
                    mtime = os.path.getmtime(lock_path)
                    if time.monotonic() - mtime > cls.STALE_THRESHOLD:
                        logger.warning("Stale lock detected: %s (mtime=%.1fs)", lock_path, time.monotonic() - mtime)
                        cls.release(lock_path)
                        continue
                except FileNotFoundError:
                    continue

                if time.monotonic() - start >= timeout:
                    return LockResult(
                        acquired=False,
                        lock_path=lock_path,
                        owner=owner_id,
                        message=f"Timeout after {timeout}s waiting for {lock_path}",
                    )
                time.sleep(0.05)
            except OSError as exc:
                return LockResult(
                    acquired=False,
                    lock_path=lock_path,
                    owner=owner_id,
                    message=f"OS error acquiring lock: {exc}",
                )

    @classmethod
    def release(cls, lock_path: str) -> None:
        """Release a file lock by removing the marker directory."""
        try:
            os.rmdir(lock_path)
            logger.debug("Released lock: %s", lock_path)
        except FileNotFoundError:
            pass
        except OSError as exc:
            logger.warning("Could not release lock %s: %s", lock_path, exc)

    @classmethod
    def is_locked(cls, lock_path: str) -> bool:
        """Check if a lock is currently held."""
        return os.path.isdir(lock_path)
