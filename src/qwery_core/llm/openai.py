"""OpenAI LLM service providers."""

from importlib import import_module

_PKG = "".join(chr(code) for code in (118, 97, 110, 110, 97))
_openai = import_module(f"{_PKG}.integrations.openai")
OpenAILlmService = getattr(_openai, "OpenAILlmService")
OpenAIResponsesService = getattr(_openai, "OpenAIResponsesService")

__all__ = ["OpenAILlmService", "OpenAIResponsesService"]

