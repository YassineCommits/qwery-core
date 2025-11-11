from __future__ import annotations

from types import SimpleNamespace

import pytest

from qwery_core.supabase.session import SupabaseSessionManager


class StubAuth:
    def __init__(self, user_id: str):
        self._user_id = user_id
        self._session = SimpleNamespace(access_token="access", user=SimpleNamespace(email="test@example.com"))

    def set_session(self, access_token, refresh_token):
        self._session.access_token = access_token

    def get_user(self):
        return {"user": {"id": self._user_id}}

    def get_session(self):
        return self._session


class StubTable:
    def __init__(self, storage: dict[str, list[dict]], name: str):
        self.storage = storage
        self.name = name
        self._filter = None
        self._order = None
        self._limit = None
        self._insert_payload = None
        self._include_parts = False

    def select(self, *args, **kwargs):
        self._insert_payload = None
        joined = " ".join(str(arg) for arg in args)
        if "gp_message_parts" in joined:
            self._include_parts = True
        return self

    def eq(self, column: str, value):
        self._filter = (column, value)
        return self

    def order(self, *args, **kwargs):
        self._order = (args, kwargs)
        return self

    def limit(self, value: int):
        self._limit = value
        return self

    def insert(self, payload):
        self._insert_payload = payload
        return self

    def execute(self):
        if self._insert_payload is not None:
            payload = self._insert_payload
            if isinstance(payload, dict):
                self.storage.setdefault(self.name, []).append(payload)
                data = [payload]
            elif isinstance(payload, list):
                self.storage.setdefault(self.name, []).extend(payload)
                data = payload
            else:
                raise ValueError("Unsupported payload type")
            self._insert_payload = None
            return SimpleNamespace(data=data)

        rows = list(self.storage.get(self.name, []))
        if self._filter:
            column, value = self._filter
            rows = [row for row in rows if row.get(column) == value]
        if self._limit is not None:
            rows = rows[: self._limit]
        if self._include_parts and self.name == "gp_messages":
            parts = self.storage.get("gp_message_parts", [])
            enriched = []
            for row in rows:
                row_copy = dict(row)
                row_copy["gp_message_parts"] = [
                    part for part in parts if part.get("message_id") == row["id"]
                ]
                enriched.append(row_copy)
            rows = enriched
        return SimpleNamespace(data=rows)


class StubSchema:
    def __init__(self, storage: dict[str, list[dict]]):
        self.storage = storage

    def table(self, name: str):
        return StubTable(self.storage, name)


class StubSupabaseClient:
    def __init__(self, storage: dict[str, list[dict]], user_id: str = "user-1"):
        self.storage = storage
        self.auth = StubAuth(user_id)

    def schema(self, name: str):
        assert name == "guepard"
        return StubSchema(self.storage)


@pytest.fixture
def storage():
    return {
        "gp_chats": [],
        "gp_deployment_request": [],
        "gp_messages": [],
        "gp_message_parts": [],
    }


def test_supabase_session_manager_creates_chat_and_saves_messages(storage):
    user_client = StubSupabaseClient(storage, user_id="user-123")
    admin_client = StubSupabaseClient(storage, user_id="admin")

    manager = SupabaseSessionManager(
        client_factory=lambda: user_client,
        admin_client_factory=lambda: admin_client,
    )

    session = manager.get_session("access-token", "refresh-token")
    assert session.user_id == "user-123"

    chat_state = manager.get_chat_state(session, "project-1", "chat-1")
    assert storage["gp_chats"], "Chat should be persisted in storage"
    assert chat_state.chat_id

    manager.ensure_history_loaded(chat_state)
    assert chat_state.history == []
    assert chat_state.history_loaded is True

    manager.record_message(session, chat_state, role="user", content="Hello world")
    assert len(storage["gp_messages"]) == 1
    assert len(storage["gp_message_parts"]) == 1

    # Simulate history fetch after a message has been saved
    chat_state.history = []
    chat_state.history_loaded = False
    manager.ensure_history_loaded(chat_state)
    assert chat_state.history
    assert chat_state.history[0]["content"] == "Hello world"

