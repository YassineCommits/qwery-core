"""Qwery Core package."""

# Backward compatibility: re-export protocol from new location
from .domain.protocols import *  # noqa: F403, F401

# Lazy import for create_agent to avoid loading heavy dependencies
def __getattr__(name: str):
    if name == "create_agent":
        from .application.services import create_agent
        return create_agent
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__ = ["create_agent"]
