"""Unit tests for WebSocket timing logs."""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from qwery_core.domain.protocols import MessageKind, MessageRole, ProtocolMessage, ProtocolPayload
from qwery_core.domain.protocols import MessageContent
from qwery_core.server_components.websocket import WebsocketAgentManager


@pytest.fixture
def mock_agent():
    """Create a mock agent."""
    agent = MagicMock()
    agent.handle_prompt = AsyncMock(return_value={
        "summary": "Test summary",
        "sql": "SELECT 1",
        "columns": ["id"],
        "preview_rows": [(1,)],
        "truncated": False,
        "csv_filename": "test.csv",
        "visualization": None,
    })
    return agent


@pytest.fixture
def manager(mock_agent):
    """Create WebSocket manager."""
    return WebsocketAgentManager(mock_agent)


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket."""
    ws = AsyncMock()
    ws.accept = AsyncMock()
    ws.send_json = AsyncMock()
    ws.receive_json = AsyncMock()
    ws.headers = {}
    ws.cookies = {}
    return ws


@pytest.mark.asyncio
async def test_ws_connect_start_log(caplog, manager, mock_websocket):
    """Test [WS_CONNECT_START] log is emitted."""
    with caplog.at_level(logging.INFO):
        await manager.connect(mock_websocket, project_id="test-proj", chat_id="test-chat")
    
    assert any("[WS_CONNECT_START]" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_ws_connect_accept_log(caplog, manager, mock_websocket):
    """Test [WS_CONNECT_ACCEPT] log is emitted."""
    with caplog.at_level(logging.INFO):
        await manager.connect(mock_websocket, project_id="test-proj", chat_id="test-chat")
    
    assert any("[WS_CONNECT_ACCEPT]" in record.message and "took=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_ws_handshake_sent_log(caplog, manager, mock_websocket):
    """Test [WS_HANDSHAKE_SENT] log is emitted."""
    with caplog.at_level(logging.INFO):
        await manager.connect(mock_websocket, project_id="test-proj", chat_id="test-chat")
    
    assert any("[WS_HANDSHAKE_SENT]" in record.message and "took=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_ws_history_sent_log(caplog, manager, mock_websocket):
    """Test [WS_HISTORY_SENT] log is emitted."""
    with caplog.at_level(logging.INFO):
        await manager.connect(mock_websocket, project_id="test-proj", chat_id="test-chat")
    
    assert any("[WS_HISTORY_SENT]" in record.message and "took=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_ws_handle_msg_start_log(caplog, manager, mock_websocket, mock_agent):
    """Test [WS_HANDLE_MSG_START] log is emitted."""
    from qwery_core.domain.protocols import create_text_message
    
    message = create_text_message(
        role=MessageRole.USER,
        content="test message",
        from_="client",
        to="server",
    )
    
    # Fix websocket.headers to be a dict, not async
    mock_websocket.headers = {}
    
    with caplog.at_level(logging.INFO):
        await manager.handle_message(
            mock_websocket,
            message=message,
            project_id="test-proj",
            chat_id="test-chat",
        )
    
    assert any("[WS_HANDLE_MSG_START]" in record.message and "timestamp=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_ws_handle_prompt_start_log(caplog, manager, mock_websocket, mock_agent):
    """Test [WS_HANDLE_PROMPT_START] log is emitted."""
    from qwery_core.domain.protocols import create_text_message
    
    message = create_text_message(
        role=MessageRole.USER,
        content="list tables",
        from_="client",
        to="server",
    )
    
    mock_websocket.headers = {}
    
    with caplog.at_level(logging.INFO):
        await manager.handle_message(
            mock_websocket,
            message=message,
            project_id="test-proj",
            chat_id="test-chat",
        )
    
    assert any("[WS_HANDLE_PROMPT_START]" in record.message and "timestamp=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_ws_handle_prompt_done_log(caplog, manager, mock_websocket, mock_agent):
    """Test [WS_HANDLE_PROMPT_DONE] log is emitted with timing."""
    from qwery_core.domain.protocols import create_text_message
    
    message = create_text_message(
        role=MessageRole.USER,
        content="list tables",
        from_="client",
        to="server",
    )
    
    mock_websocket.headers = {}
    
    with caplog.at_level(logging.INFO):
        await manager.handle_message(
            mock_websocket,
            message=message,
            project_id="test-proj",
            chat_id="test-chat",
        )
    
    assert any("[WS_HANDLE_PROMPT_DONE]" in record.message and "took=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_ws_format_response_start_log(caplog, manager, mock_websocket, mock_agent):
    """Test [WS_FORMAT_RESPONSE_START] log is emitted."""
    from qwery_core.domain.protocols import create_text_message
    
    message = create_text_message(
        role=MessageRole.USER,
        content="list tables",
        from_="client",
        to="server",
    )
    
    mock_websocket.headers = {}
    
    with caplog.at_level(logging.INFO):
        await manager.handle_message(
            mock_websocket,
            message=message,
            project_id="test-proj",
            chat_id="test-chat",
        )
    
    assert any("[WS_FORMAT_RESPONSE_START]" in record.message and "timestamp=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_ws_format_response_done_log(caplog, manager, mock_websocket, mock_agent):
    """Test [WS_FORMAT_RESPONSE_DONE] log is emitted with timing."""
    from qwery_core.domain.protocols import create_text_message
    
    message = create_text_message(
        role=MessageRole.USER,
        content="list tables",
        from_="client",
        to="server",
    )
    
    mock_websocket.headers = {}
    
    with caplog.at_level(logging.INFO):
        await manager.handle_message(
            mock_websocket,
            message=message,
            project_id="test-proj",
            chat_id="test-chat",
        )
    
    assert any("[WS_FORMAT_RESPONSE_DONE]" in record.message and "took=" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_ws_broadcast_done_log(caplog, manager, mock_websocket, mock_agent):
    """Test [WS_BROADCAST_DONE] log is emitted with timing."""
    from qwery_core.domain.protocols import create_text_message
    
    message = create_text_message(
        role=MessageRole.USER,
        content="list tables",
        from_="client",
        to="server",
    )
    
    mock_websocket.headers = {}
    
    with caplog.at_level(logging.INFO):
        await manager.handle_message(
            mock_websocket,
            message=message,
            project_id="test-proj",
            chat_id="test-chat",
        )
    
    assert any("[WS_BROADCAST_DONE]" in record.message and "took=" in record.message and "total_msg_time=" in record.message for record in caplog.records)

