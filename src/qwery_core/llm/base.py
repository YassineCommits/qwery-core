from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, Protocol


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
    async def send_request(self, request: Dict[str, Any]) -> LlmResponse:  # pragma: no cover - interface
        ...

    async def stream_request(
        self, request: Dict[str, Any]
    ) -> AsyncGenerator[LlmStreamChunk, None]:  # pragma: no cover - interface
        ...

    async def validate_tools(self, tools: list[Dict[str, Any]]) -> list[str]:  # pragma: no cover - interface
        ...


__all__ = ["LlmResponse", "LlmService", "LlmStreamChunk"]

