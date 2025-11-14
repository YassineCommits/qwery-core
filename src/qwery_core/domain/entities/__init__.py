from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional


@dataclass(slots=True)
class AgentConfig:
    stream_responses: bool = True
    include_thinking_indicators: bool = False


@dataclass(slots=True)
class User:
    id: str
    group_memberships: list[str]


class RequestContext:
    def __init__(
        self,
        headers: Optional[Dict[str, str]] = None,
        cookies: Optional[Dict[str, str]] = None,
    ) -> None:
        self._headers = {key.lower(): value for key, value in (headers or {}).items()}
        self._cookies = cookies or {}

    def get_header(self, name: str) -> Optional[str]:
        return self._headers.get(name.lower())

    def get_cookie(self, name: str) -> Optional[str]:
        return self._cookies.get(name)


@dataclass(slots=True)
class Agent:
    llm_service: Any
    tool_registry: Any
    user_resolver: Any
    agent_memory: Any
    config: AgentConfig
    working_directory: str


class AgentMemory:
    """Minimal agent memory placeholder."""

    def __init__(self) -> None:
        self._events: list[Dict[str, Any]] = []

    def add_event(self, event: Dict[str, Any]) -> None:
        self._events.append(event)

    def get_events(self) -> list[Dict[str, Any]]:
        return list(self._events)


class DemoAgentMemory(AgentMemory):
    """In-memory demo implementation."""


__all__ = [
    "Agent",
    "AgentConfig",
    "AgentMemory",
    "DemoAgentMemory",
    "RequestContext",
    "User",
]

