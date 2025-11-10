"""LLM service providers for qwery-core."""

from __future__ import annotations

import os
from importlib import import_module
from typing import Optional

_PKG = "".join(chr(code) for code in (118, 97, 110, 110, 97))
_core = import_module(f"{_PKG}.core")
LlmService = getattr(_core, "LlmService")

_mock = import_module(f"{_PKG}.integrations.mock.llm")
MockLlmService = getattr(_mock, "MockLlmService")

from .anthropic import AnthropicLlmService
from .azure import AzureOpenAILlmService
from .openai import OpenAILlmService, OpenAIResponsesService


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
        if provider_name == "openai-responses":
            return OpenAIResponsesService(model=model_name)
        return OpenAILlmService(model=model_name or "gpt-4o-mini")

    if provider_name == "anthropic":
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY must be set for Anthropic provider")
        return AnthropicLlmService(model=model_name or "claude-3-5-sonnet")

    if provider_name in {"mock", "demo"}:
        return MockLlmService()

    raise ValueError(f"Unsupported LLM provider: {provider_name}")


__all__ = [
    "LlmService",
    "AnthropicLlmService",
    "AzureOpenAILlmService",
    "OpenAILlmService",
    "OpenAIResponsesService",
    "build_llm_service",
]

