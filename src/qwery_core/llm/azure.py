"""Azure OpenAI LLM service provider."""

from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, Optional

from openai import AzureOpenAI

from .base import LlmResponse, LlmService, LlmStreamChunk


class AzureOpenAILlmService(LlmService):
    """Azure OpenAI deployment backed LLM service."""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        azure_endpoint: Optional[str] = None,
        api_version: Optional[str] = None,
        **extra_client_kwargs,
    ) -> None:
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

    async def send_request(self, request: Dict[str, Any]) -> LlmResponse:
        messages = self._build_messages(request)
        response = await asyncio.to_thread(
            self._client.chat.completions.create,
            model=self.model,
            messages=messages,
        )
        return self._convert_response(response)

    async def stream_request(self, request: Dict[str, Any]):
        messages = self._build_messages(request)
        completion = await asyncio.to_thread(
            self._client.chat.completions.create,
            model=self.model,
            messages=messages,
            stream=True,
        )
        full_text = []
        finish_reason = None
        for chunk in completion:
            delta = getattr(chunk.choices[0].delta, "content", None)
            if delta:
                full_text.append(delta)
                yield LlmStreamChunk(content=delta, finish_reason=None)
            finish_reason = chunk.choices[0].finish_reason
        yield LlmStreamChunk(content="", finish_reason=finish_reason or "stop")

    async def validate_tools(self, tools: list[Dict[str, Any]]) -> list[str]:
        return []

    def _build_messages(self, request: Dict[str, Any]) -> list[Dict[str, str]]:
        if "messages" in request and isinstance(request["messages"], list):
            return request["messages"]
        prompt = request.get("prompt") or request.get("input")
        if isinstance(prompt, str):
            return [{"role": "user", "content": prompt}]
        raise ValueError("Azure OpenAI request must include 'messages' or 'prompt'")

    def _convert_response(self, response: Any) -> LlmResponse:
        choice = response.choices[0]
        message = choice.message
        text = message.content or ""
        usage = getattr(response, "usage", None) or {}
        usage_dict = {
            "prompt_tokens": getattr(usage, "prompt_tokens", 0),
            "completion_tokens": getattr(usage, "completion_tokens", 0),
            "total_tokens": getattr(usage, "total_tokens", 0),
        }
        return LlmResponse(content=text, finish_reason=choice.finish_reason or "stop", usage=usage_dict)


__all__ = ["AzureOpenAILlmService"]

