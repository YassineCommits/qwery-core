from __future__ import annotations

import json
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from qwery_core.domain.protocols import MessageRole, create_text_message
from qwery_core.presentation.websocket import register_websocket_routes


class StubAgent:
    pass


@pytest.fixture
def stub_agent(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("QWERY_DB_URL", "sqlite:///:memory:")

    async def fake_handle_prompt(agent, request_context, prompt, **kwargs):
        return {
            "summary": "Ran query successfully.",
            "sql": "SELECT 1",
            "columns": ["value"],
            "preview_rows": [[1]],
            "truncated": False,
            "csv_filename": "query.csv",
            "visualization": None,
        }
    monkeypatch.setattr("qwery_core.presentation.websocket.handle_prompt", fake_handle_prompt)
    return StubAgent()


def test_websocket_message_flow(stub_agent):
    app = FastAPI()
    register_websocket_routes(app, stub_agent)

    client = TestClient(app)
    project_id = "project-123"
    chat_id = str(uuid4())

    with client.websocket_connect(
        f"/ws/agent/{project_id}/{chat_id}",
    ) as websocket:
        handshake = websocket.receive_json()
        assert handshake["kind"] == "Handshake"

        message = create_text_message(
            role=MessageRole.USER,
            content="list my tables",
            from_="client",
            to="server",
        ).to_dict()
        websocket.send_json(message)

        response = websocket.receive_json()
        assert response["kind"] == "Message"
        assert "Ran query successfully." in response["payload"]["Message"]["content"]
