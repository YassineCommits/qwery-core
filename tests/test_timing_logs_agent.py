"""Unit tests for agent timing logs."""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock

import pytest

from qwery_core.agent import handle_prompt
from qwery_core.core import RequestContext
from qwery_core.infrastructure.llm import MockLlmService


@pytest.fixture
def mock_agent():
    """Create a mock agent."""
    from qwery_core.core import Agent, AgentConfig, AgentMemory
    from qwery_core.application.services import ToolRegistry
    
    agent = Agent(
        llm_service=MockLlmService('{"sql": "SELECT 1", "summary": "Test query"}'),
        tool_registry=ToolRegistry(),
        agent_memory=AgentMemory(),
        config=AgentConfig(),
        working_directory="/tmp/test",
    )
    return agent


@pytest.fixture
def request_context():
    """Create a request context."""
    return RequestContext(headers={}, cookies={})


@pytest.mark.asyncio
async def test_handle_prompt_start_log(caplog, mock_agent, request_context):
    """Test [HANDLE_PROMPT_START] log is emitted."""
    with caplog.at_level(logging.INFO):
        await handle_prompt(mock_agent, request_context, "test prompt")
    
    assert any("[HANDLE_PROMPT_START]" in record.message and "timestamp=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_handle_prompt_llm_start_log(caplog, mock_agent, request_context):
    """Test [HANDLE_PROMPT_LLM_START] log is emitted."""
    with caplog.at_level(logging.INFO):
        await handle_prompt(mock_agent, request_context, "test prompt")
    
    assert any("[HANDLE_PROMPT_LLM_START]" in record.message and "timestamp=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_handle_prompt_llm_done_log(caplog, mock_agent, request_context):
    """Test [HANDLE_PROMPT_LLM_DONE] log is emitted with timing."""
    with caplog.at_level(logging.INFO):
        await handle_prompt(mock_agent, request_context, "test prompt")
    
    assert any("[HANDLE_PROMPT_LLM_DONE]" in record.message and "took=" in record.message and "response_length=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_handle_prompt_sql_extracted_log(caplog, mock_agent, request_context):
    """Test [HANDLE_PROMPT_SQL_EXTRACTED] log is emitted."""
    with caplog.at_level(logging.INFO):
        await handle_prompt(mock_agent, request_context, "test prompt")
    
    assert any("[HANDLE_PROMPT_SQL_EXTRACTED]" in record.message and "sql_length=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_handle_prompt_sql_exec_start_log(caplog, mock_agent, request_context):
    """Test [HANDLE_PROMPT_SQL_EXEC_START] log is emitted."""
    import os
    import tempfile
    import sqlite3
    
    # Create a temporary SQLite database
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        # Create a simple table
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.close()
        
        with caplog.at_level(logging.INFO):
            await handle_prompt(mock_agent, request_context, "test prompt", database_url=db_path)
        
        assert any("[HANDLE_PROMPT_SQL_EXEC_START]" in record.message and "timestamp=" in record.message for record in caplog.records)
    finally:
        import os
        if os.path.exists(db_path):
            os.unlink(db_path)


@pytest.mark.asyncio
async def test_handle_prompt_sql_exec_done_log(caplog, mock_agent, request_context):
    """Test [HANDLE_PROMPT_SQL_EXEC_DONE] log is emitted with timing."""
    import os
    import tempfile
    import sqlite3
    
    # Create a temporary SQLite database
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        # Create a simple table
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.close()
        
        with caplog.at_level(logging.INFO):
            await handle_prompt(mock_agent, request_context, "test prompt", database_url=db_path)
        
        assert any("[HANDLE_PROMPT_SQL_EXEC_DONE]" in record.message and "total_took=" in record.message for record in caplog.records)
    finally:
        import os
        if os.path.exists(db_path):
            os.unlink(db_path)


@pytest.mark.asyncio
async def test_handle_prompt_done_log(caplog, mock_agent, request_context):
    """Test [HANDLE_PROMPT_DONE] log is emitted with total timing."""
    with caplog.at_level(logging.INFO):
        await handle_prompt(mock_agent, request_context, "test prompt")
    
    assert any("[HANDLE_PROMPT_DONE]" in record.message and "total_took=" in record.message for record in caplog.records)

