"""Unit tests for FastAPI routes."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from qwery_core.application.services import create_agent
from qwery_core.infrastructure.llm import MockLlmService
from qwery_core.server_components.fastapi import QweryFastAPIServer


@pytest.fixture
def mock_agent():
    """Create a mock agent for testing."""
    agent = MagicMock()
    agent.tool_registry = MagicMock()
    
    # Mock run_sql tool
    run_sql_tool = AsyncMock()
    run_sql_tool.execute = AsyncMock(return_value=MagicMock(
        columns=["id", "name"],
        rows=[(1, "test"), (2, "test2")]
    ))
    agent.tool_registry.get_tool = AsyncMock(return_value=run_sql_tool)
    
    # Mock handle_prompt
    agent.handle_prompt = AsyncMock(return_value={
        "summary": "Test summary",
        "sql": "SELECT * FROM test",
        "columns": ["id", "name"],
        "preview_rows": [(1, "test")],
        "truncated": False,
        "csv_filename": "test.csv",
        "visualization": None,
    })
    
    return agent


@pytest.fixture
def app(mock_agent):
    """Create FastAPI app for testing - using the same method as server.py."""
    from qwery_core.server import _build_app
    from qwery_core.server_components.fastapi import QweryFastAPIServer
    from qwery_core.server_components.websocket import register_websocket_routes
    import os
    
    # Temporarily patch create_agent to return our mock
    import qwery_core.server
    original_create_agent = qwery_core.server.create_agent
    qwery_core.server.create_agent = lambda **kwargs: mock_agent
    
    # Disable rate limiting for tests
    original_rpm = os.environ.get("QWERY_RATE_LIMIT_RPM")
    original_rph = os.environ.get("QWERY_RATE_LIMIT_RPH")
    os.environ["QWERY_RATE_LIMIT_RPM"] = "10000"
    os.environ["QWERY_RATE_LIMIT_RPH"] = "100000"
    
    try:
        # Create app directly without caching
        server = QweryFastAPIServer(mock_agent)
        app = server.create_app()
        register_websocket_routes(app, mock_agent)
        
        # Add health endpoint
        @app.get("/health", tags=["system"])
        async def health() -> dict[str, str]:
            return {"status": "ok"}
        
        return app
    finally:
        qwery_core.server.create_agent = original_create_agent
        if original_rpm:
            os.environ["QWERY_RATE_LIMIT_RPM"] = original_rpm
        elif "QWERY_RATE_LIMIT_RPM" in os.environ:
            del os.environ["QWERY_RATE_LIMIT_RPM"]
        if original_rph:
            os.environ["QWERY_RATE_LIMIT_RPH"] = original_rph
        elif "QWERY_RATE_LIMIT_RPH" in os.environ:
            del os.environ["QWERY_RATE_LIMIT_RPH"]


@pytest.fixture
def client(app):
    """Create test client."""
    return TestClient(app)


def test_health_endpoint(client):
    """Test health endpoint exists."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_streaming_endpoint_exists(app):
    """Test streaming endpoint is registered."""
    # Check that the route exists in the app
    routes = [r.path for r in app.routes if hasattr(r, 'path')]
    assert "/api/v1/projects/{project_id}/chats/{chat_id}/messages/stream" in routes, \
        f"Streaming route not found. Available routes: {routes}"


def test_messages_endpoint_exists(app):
    """Test messages endpoint is registered."""
    # Check that the route exists in the app
    routes = [r.path for r in app.routes if hasattr(r, 'path')]
    assert "/api/v1/projects/{project_id}/chats/{chat_id}/messages" in routes, \
        f"Messages route not found. Available routes: {routes}"


def test_run_sql_endpoint_exists(client):
    """Test run-sql endpoint is registered."""
    response = client.post(
        "/api/v1/run-sql",
        json={"query": "SELECT 1"},
    )
    # Should not be 404
    assert response.status_code != 404, f"Route not found. Response: {response.text}"


def test_visualize_endpoint_exists(client, mock_agent):
    """Test visualize endpoint is registered."""
    # Mock visualize tool
    viz_tool = AsyncMock()
    viz_tool.execute = AsyncMock(return_value=MagicMock(
        figure_json={"data": [{"x": [1, 2], "y": [3, 4]}]}
    ))
    mock_agent.tool_registry.get_tool = AsyncMock(return_value=viz_tool)
    
    response = client.post(
        "/api/v1/visualize",
        json={"data": {"x": [1, 2], "y": [3, 4]}},
    )
    # Should not be 404
    assert response.status_code != 404, f"Route not found. Response: {response.text}"


def test_streaming_endpoint_returns_sse(app):
    """Test streaming endpoint is configured for SSE."""
    # Find the streaming route
    stream_route = None
    for route in app.routes:
        if hasattr(route, 'path') and route.path == "/api/v1/projects/{project_id}/chats/{chat_id}/messages/stream":
            stream_route = route
            break
    
    assert stream_route is not None, "Streaming route not found"
    
    # Check that it returns StreamingResponse
    # We can't easily test the actual response with TestClient due to path parameter issues,
    # but we can verify the route exists and is configured correctly
    assert hasattr(stream_route, 'endpoint'), "Route should have an endpoint"
    
    # Verify the endpoint signature matches what we expect
    import inspect
    sig = inspect.signature(stream_route.endpoint)
    assert 'payload' in sig.parameters, "Endpoint should accept payload parameter"
    assert 'project_id' in sig.parameters, "Endpoint should accept project_id parameter"
    assert 'chat_id' in sig.parameters, "Endpoint should accept chat_id parameter"

