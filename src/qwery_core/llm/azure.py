"""Azure OpenAI LLM service provider."""

from __future__ import annotations

import os
from importlib import import_module
from typing import Optional

_PKG = "".join(chr(code) for code in (118, 97, 110, 110, 97))
_core = import_module(f"{_PKG}.core")
LlmService = getattr(_core, "LlmService")

_openai = import_module(f"{_PKG}.integrations.openai")
OpenAILlmService = getattr(_openai, "OpenAILlmService")


class AzureOpenAILlmService(OpenAILlmService):
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

