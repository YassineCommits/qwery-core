"""OpenAI LLM service providers."""

from __future__ import annotations

import asyncio
import os
from typing import Any, AsyncGenerator, Dict, Optional

from openai import OpenAI

from .base import LlmResponse, LlmService, LlmStreamChunk


class OpenAILlmService(LlmService):
    """Wrapper around the OpenAI Responses API."""

    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None) -> None:
        self.model = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY must be set for OpenAI provider")
        self._client = OpenAI(api_key=api_key)

    async def send_request(self, request: Dict[str, Any]) -> LlmResponse:
        messages = self._build_messages(request)
        response = await asyncio.to_thread(
            self._client.chat.completions.create,
            model=self.model,
            messages=messages,
        )
        return self._convert_response(response)

    async def stream_request(
        self, request: Dict[str, Any]
    ) -> AsyncGenerator[LlmStreamChunk, None]:
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
            delta = chunk.choices[0].delta.content or ""
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
        raise ValueError("OpenAI request must include 'messages' or 'prompt'")

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


class OpenAIResponsesService(OpenAILlmService):
    """Compatibility alias for the OpenAI responses service."""


__all__ = ["OpenAILlmService", "OpenAIResponsesService"]
