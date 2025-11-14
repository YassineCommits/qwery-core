from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, Iterable, Protocol, Sequence, Tuple


@dataclass(slots=True)
class LlmResponse:
    content: str
    finish_reason: str
    usage: Dict[str, Any]


@dataclass(slots=True)
class LlmStreamChunk:
    content: str
    finish_reason: str | None = None


class LlmService(Protocol):
    """Port for LLM service implementations."""

    async def send_request(self, request: Dict[str, Any]) -> LlmResponse:  # pragma: no cover - interface
        ...

    async def stream_request(
        self, request: Dict[str, Any]
    ) -> AsyncGenerator[LlmStreamChunk, None]:  # pragma: no cover - interface
        ...

    async def validate_tools(self, tools: list[Dict[str, Any]]) -> list[str]:  # pragma: no cover - interface
        ...


class SqlRunner(Protocol):
    """Port for SQL database runners."""

    def run(self, query: str, params: Iterable[Any] | None = None) -> Any:  # pragma: no cover - interface
        # Returns QueryResult from infrastructure.database
        ...


class FileSystem(Protocol):
    """Port for file system operations."""

    def resolve_path(self, relative_path: str) -> str:  # pragma: no cover - interface
        ...


class UserResolver(Protocol):
    """Port for user resolution."""

    async def resolve_user(self, request_context: Any) -> Any:  # pragma: no cover - interface
        ...


class ToolRegistry(Protocol):
    """Port for tool registry."""

    def register_local_tool(self, tool: Any, access_groups: Iterable[str]) -> None:  # pragma: no cover - interface
        ...

    async def get_tool(self, name: str) -> Any:  # pragma: no cover - interface
        ...

    def list_tools(self) -> list[str]:  # pragma: no cover - interface
        ...


__all__ = [
    "FileSystem",
    "LlmResponse",
    "LlmService",
    "LlmStreamChunk",
    "QueryResult",
    "SqlRunner",
    "ToolRegistry",
    "UserResolver",
]

