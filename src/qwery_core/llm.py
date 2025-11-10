from __future__ import annotations

import os
from typing import Optional

from vanna.core import LlmService

from vanna.integrations.anthropic import AnthropicLlmService
from vanna.integrations.openai import (
    OpenAILlmService as VannaOpenAILlmService,
    OpenAIResponsesService,
)
from vanna.integrations.mock.llm import MockLlmService


class AzureOpenAILlmService(VannaOpenAILlmService):
    """Azure OpenAI deployment backed LLM service."""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        azure_endpoint: Optional[str] = None,
        api_version: Optional[str] = None,
        **extra_client_kwargs,
    ) -> None:
        from openai import AzureOpenAI

        self.model = model or os.environ.get("AZURE_DEPLOYMENT_ID", "gpt-5-mini")
        api_key = api_key or os.environ.get("AZURE_API_KEY")
        azure_endpoint = azure_endpoint or os.environ.get("AZURE_ENDPOINT")
        api_version = api_version or os.environ.get("AZURE_API_VERSION")

        if not api_key:
            raise RuntimeError("AZURE_API_KEY must be set for Azure OpenAI provider")
        if not azure_endpoint:
            raise RuntimeError("AZURE_ENDPOINT must be set for Azure OpenAI provider")
        if not api_version:
            raise RuntimeError("AZURE_API_VERSION must be set for Azure OpenAI provider")

        client_kwargs = {
            **extra_client_kwargs,
            "api_key": api_key,
            "azure_endpoint": azure_endpoint.rstrip("/"),
            "api_version": api_version,
        }
        self._client = AzureOpenAI(**client_kwargs)


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
        return VannaOpenAILlmService(model=model_name or "gpt-4o-mini")

    if provider_name == "anthropic":
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY must be set for Anthropic provider")
        return AnthropicLlmService(model=model_name or "claude-3-5-sonnet")

    if provider_name in {"mock", "demo"}:
        return MockLlmService()

    raise ValueError(f"Unsupported LLM provider: {provider_name}")

