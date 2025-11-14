"""Anthropic LLM service provider."""

from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, Optional

from anthropic import Anthropic

from .base import LlmResponse, LlmService, LlmStreamChunk


class AnthropicLlmService(LlmService):
    """Wrapper around Anthropic's Messages API."""

    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None) -> None:
        self.model = model or os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet")
        api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY must be set for Anthropic provider")
        self._client = Anthropic(api_key=api_key)

    async def send_request(self, request: Dict[str, Any]) -> LlmResponse:
        messages = request.get("messages")
        if not isinstance(messages, list):
            raise ValueError("Anthropic requests must provide 'messages'")
        response = await asyncio.to_thread(
            self._client.messages.create,
            model=self.model,
            max_tokens=request.get("max_tokens", 1024),
            messages=messages,
        )
        text = " ".join(block.text for block in response.content if hasattr(block, "text"))
        usage = getattr(response, "usage", None) or {}
        usage_dict = {
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
            "total_tokens": (usage.get("input_tokens", 0) + usage.get("output_tokens", 0)),
        }
        return LlmResponse(content=text, finish_reason=response.stop_reason or "stop", usage=usage_dict)

    async def stream_request(self, request: Dict[str, Any]):
        result = await self.send_request(request)
        yield LlmStreamChunk(content=result.content, finish_reason=result.finish_reason)

    async def validate_tools(self, tools: list[Dict[str, Any]]) -> list[str]:
        return []


__all__ = ["AnthropicLlmService"]
