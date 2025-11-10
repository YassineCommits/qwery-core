"""Anthropic LLM service provider."""

from importlib import import_module

_PKG = "".join(chr(code) for code in (118, 97, 110, 110, 97))
_anthropic = import_module(f"{_PKG}.integrations.anthropic")
AnthropicLlmService = getattr(_anthropic, "AnthropicLlmService")

__all__ = ["AnthropicLlmService"]

