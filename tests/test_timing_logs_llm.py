"""Unit tests for LLM timing logs."""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest

from qwery_core.infrastructure.llm import MockLlmService


def test_llm_mock_service_logs(caplog):
    """Test that MockLlmService works (no timing logs, but verifies structure)."""
    service = MockLlmService("test response")
    
    with caplog.at_level(logging.INFO):
        import asyncio
        result = asyncio.run(service.send("test prompt", []))
    
    assert result.content == "test response"


@pytest.mark.skipif(
    not hasattr(pytest, "importorskip"),
    reason="OpenAI tests require API key"
)
def test_llm_openai_send_start_log(caplog):
    """Test [LLM_OPENAI_SEND_START] log is emitted."""
    pytest.importorskip("openai")
    
    # This test would require actual OpenAI API key
    # Skipping for now, but structure is here
    pytest.skip("Requires OpenAI API key")


@pytest.mark.skipif(
    not hasattr(pytest, "importorskip"),
    reason="Anthropic tests require API key"
)
def test_llm_anthropic_send_start_log(caplog):
    """Test [LLM_ANTHROPIC_SEND_START] log is emitted."""
    pytest.importorskip("anthropic")
    
    # This test would require actual Anthropic API key
    # Skipping for now, but structure is here
    pytest.skip("Requires Anthropic API key")


@pytest.mark.skipif(
    not hasattr(pytest, "importorskip"),
    reason="Azure tests require API key"
)
def test_llm_azure_send_start_log(caplog):
    """Test [LLM_AZURE_SEND_START] log is emitted."""
    pytest.importorskip("openai")
    
    # This test would require actual Azure API key
    # Skipping for now, but structure is here
    pytest.skip("Requires Azure API key")

