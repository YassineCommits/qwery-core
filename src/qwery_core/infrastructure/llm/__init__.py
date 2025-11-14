from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, Optional

from .anthropic import AnthropicLlmService
from .azure import AzureOpenAILlmService
from .base import LlmResponse, LlmService, LlmStreamChunk
from ...domain.ports import LlmResponse as LlmResponsePort, LlmStreamChunk as LlmStreamChunkPort
from .openai import OpenAIResponsesService, OpenAILlmService


@dataclass(slots=True)
class MockLlmUsage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


@dataclass(slots=True)
class MockLlmResponse:
    content: str
    finish_reason: str
    usage: Dict[str, Any]


class MockLlmService(LlmService):
    """Simple LLM stub for tests."""

    def __init__(self, response_content: str = "Hello! This is a mock response.") -> None:
        self.response_content = response_content
        self.call_count = 0

    async def send_request(self, request: Dict[str, Any]) -> LlmResponse:
        self.call_count += 1
        return LlmResponse(
            content=f"{self.response_content} (Request #{self.call_count})",
            finish_reason="stop",
            usage={
                "prompt_tokens": 50,
                "completion_tokens": 20,
                "total_tokens": 70,
            },
        )

    async def stream_request(
        self, request: Dict[str, Any]
    ) -> AsyncGenerator[LlmStreamChunk, None]:
        self.call_count += 1
        words = f"{self.response_content} (Streamed #{self.call_count})".split()
        for i, word in enumerate(words):
            chunk = word + (" " if i < len(words) - 1 else "")
            yield LlmStreamChunk(
                content=chunk,
                finish_reason="stop" if i == len(words) - 1 else None,
            )

    async def validate_tools(self, tools: list[Dict[str, Any]]) -> list[str]:
        return []


def build_llm_service(
    *,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> LlmService:
    """Build an LLM service from environment configuration."""

    provider_name = provider or os.environ.get("QWERY_LLM_PROVIDER")

    if not provider_name:
        if os.environ.get("AZURE_API_KEY"):
            provider_name = "azure"
        else:
            provider_name = "openai"

    provider_name = provider_name.lower()
    model_name = model or os.environ.get("QWERY_LLM_MODEL")

    if provider_name in {"azure", "azure-openai"}:
        return AzureOpenAILlmService(model=model_name)

    if provider_name in {"openai", "openai-responses"}:
        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY must be set for OpenAI provider")
        return OpenAIResponsesService(model=model_name or "gpt-4o-mini")

    if provider_name == "anthropic":
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY must be set for Anthropic provider")
        return AnthropicLlmService(model=model_name or "claude-3-5-sonnet")

    if provider_name in {"mock", "demo"}:
        return MockLlmService()

    raise ValueError(f"Unsupported LLM provider: {provider_name}")


__all__ = [
    "LlmResponse",
    "LlmService",
    "LlmStreamChunk",
    "MockLlmService",
    "MockLlmUsage",
    "AnthropicLlmService",
    "AzureOpenAILlmService",
    "OpenAILlmService",
    "OpenAIResponsesService",
    "build_llm_service",
]
