from __future__ import annotations

import os

from ...domain.ports import FileSystem


class LocalFileSystem:
    """Simple local file system implementation."""

    def __init__(self, root_path: str) -> None:
        self.root_path = os.path.abspath(root_path)
        os.makedirs(self.root_path, exist_ok=True)

    def resolve_path(self, relative_path: str) -> str:
        full_path = os.path.abspath(os.path.join(self.root_path, relative_path))
        if not full_path.startswith(self.root_path):
            raise ValueError("Attempted path traversal outside of working directory")
        return full_path


__all__ = ["LocalFileSystem"]

