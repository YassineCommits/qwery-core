from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict

from ...domain.ports import LlmService as LlmServiceProtocol


@dataclass(slots=True)
class LlmResponse:
    content: str
    finish_reason: str
    usage: Dict[str, Any]


@dataclass(slots=True)
class LlmStreamChunk:
    content: str
    finish_reason: str | None = None


# Re-export the protocol for implementations
LlmService = LlmServiceProtocol


__all__ = ["LlmResponse", "LlmService", "LlmStreamChunk"]

