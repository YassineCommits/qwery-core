"""Backward compatibility shim for protocol imports.

This module re-exports everything from domain.protocols to maintain
backward compatibility with existing code.
"""

from __future__ import annotations

from .domain.protocols import *  # noqa: F403, F401
