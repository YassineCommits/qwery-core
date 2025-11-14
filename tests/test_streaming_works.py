"""Simple test to verify streaming endpoint works."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

from qwery_core.server_components.fastapi import QweryFastAPIServer
from qwery_core.server_components.websocket import register_websocket_routes
from qwery_core.middleware.rate_limit import RateLimitMiddleware


@pytest.fixture
def mock_agent():
    """Create a mock agent."""
    agent = MagicMock()
    agent.tool_registry = MagicMock()
    return agent


@pytest.fixture
def app(mock_agent):
    """Create FastAPI app exactly like server.py."""
    server = QweryFastAPIServer(mock_agent)
    app = server.create_app()
    register_websocket_routes(app, mock_agent)
    
    # Add middleware like server.py
    app.add_middleware(RateLimitMiddleware, requests_per_minute=60, requests_per_hour=1000)
    
    @app.get("/health")
    async def health():
        return {"status": "ok"}
    
    return app


def test_streaming_endpoint_works(app, mock_agent):
    """Test streaming endpoint returns 200 and SSE format."""
    # Mock handle_prompt
    async def mock_handle_prompt(*args, **kwargs):
        return {
            "summary": "Test query executed",
            "sql": "SELECT * FROM test",
            "columns": ["id"],
            "preview_rows": [(1,)],
            "truncated": False,
            "csv_filename": "test.csv",
            "visualization": None,
        }
    
    with patch('qwery_core.server_components.fastapi.handle_prompt', side_effect=mock_handle_prompt):
        client = TestClient(app)
        response = client.post(
            "/api/v1/projects/test-project/test-chat/messages/stream",
            json={"prompt": "test"},
        )
        
        # Debug output
        if response.status_code != 200:
            print(f"Response status: {response.status_code}")
            print(f"Response body: {response.text}")
            # Check what routes exist
            routes = [r.path for r in app.routes if hasattr(r, 'path') and 'messages' in r.path]
            print(f"Available message routes: {routes}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "text/event-stream" in response.headers.get("content-type", ""), "Should be SSE"
        assert "data: " in response.text, "Should contain SSE data format"
        assert '"type": "start"' in response.text, "Should contain start event"

