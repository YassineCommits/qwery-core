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


class UserResolver:
    async def resolve_user(self, request_context: RequestContext) -> User:
        raise NotImplementedError


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: Dict[str, Any] = {}

    def register_local_tool(self, tool: Any, access_groups: Iterable[str]) -> None:
        name = getattr(tool, "name", tool.__class__.__name__)
        self._tools[name] = tool

    async def get_tool(self, name: str) -> Any:
        return self._tools.get(name)

    def list_tools(self) -> list[str]:
        return list(self._tools.keys())


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


@dataclass(slots=True)
class Agent:
    llm_service: Any
    tool_registry: ToolRegistry
    user_resolver: UserResolver
    agent_memory: AgentMemory
    config: AgentConfig
    working_directory: str


class LocalFileSystem:
    """Simple local file system helper."""

    def __init__(self, root_path: str) -> None:
        self.root_path = os.path.abspath(root_path)
        os.makedirs(self.root_path, exist_ok=True)

    def resolve_path(self, relative_path: str) -> str:
        full_path = os.path.abspath(os.path.join(self.root_path, relative_path))
        if not full_path.startswith(self.root_path):
            raise ValueError("Attempted path traversal outside of working directory")
        return full_path


__all__ = [
    "Agent",
    "AgentConfig",
    "AgentMemory",
    "DemoAgentMemory",
    "LocalFileSystem",
    "RequestContext",
    "ToolRegistry",
    "User",
    "UserResolver",
]


