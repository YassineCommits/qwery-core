from __future__ import annotations

import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from qwery_core.protocol import MessageRole, create_text_message
from qwery_core.server_components.websocket import register_websocket_routes


class StubSupabaseSessionManager:
    def __init__(self):
        self.sessions = {}
        self.states = {}

    def get_session(self, access_token: str, refresh_token: str | None):
        session = SimpleNamespace(key=access_token, user_id="user-123")
        self.sessions[access_token] = session
        return session

    def get_chat_state(self, session, project_id: str, chat_id: str):
        state = SimpleNamespace(
            session_key=session.key,
            chat_id=chat_id,
            project_id=project_id,
            database_url="sqlite:///:memory:",
            deployment_info=None,
            history=[],
            history_loaded=False,
        )
        self.states[(session.key, chat_id)] = state
        return state

    def ensure_history_loaded(self, chat_state):
        chat_state.history_loaded = True

    def record_message(self, session, chat_state, *, role: str, content: str):
        pass


class StubAgent:
    pass


@pytest.fixture
def stub_session_manager(monkeypatch: pytest.MonkeyPatch):
    manager = StubSupabaseSessionManager()
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
    monkeypatch.setattr("qwery_core.server_components.websocket.handle_prompt", fake_handle_prompt)
    return manager


def test_websocket_message_flow(stub_session_manager):
    app = FastAPI()
    register_websocket_routes(app, StubAgent(), stub_session_manager)

    client = TestClient(app)
    project_id = "project-123"
    chat_id = str(uuid4())

    with client.websocket_connect(
        f"/ws/agent/{project_id}/{chat_id}",
        headers={"Authorization": "Bearer access-token", "X-Refresh-Token": "refresh"},
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

