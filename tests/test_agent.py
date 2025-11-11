from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

import types

from qwery_core.agent import _build_user_resolver, create_agent
from qwery_core.llm import MockLlmService


def _build_temp_db(tmp_path: Path) -> str:
    db_path = tmp_path / "chinook_demo.sqlite"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE tracks (
            id INTEGER PRIMARY KEY,
            name TEXT,
            milliseconds INTEGER,
            bytes INTEGER
        )
        """
    )
    cursor.executemany(
        "INSERT INTO tracks (name, milliseconds, bytes) VALUES (?, ?, ?)",
        [
            ("Track A", 120000, 1000000),
            ("Track B", 145000, 1200000),
            ("Track C", 99000, 800000),
        ],
    )
    conn.commit()
    conn.close()
    return str(db_path)


@pytest.mark.asyncio
async def test_create_agent_requires_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QWERY_SKIP_DOTENV", "1")
    monkeypatch.delenv("QWERY_DB_PATH", raising=False)
    monkeypatch.delenv("QWERY_DB_URL", raising=False)
    with pytest.raises(ValueError, match="database_path must be provided"):
        create_agent()

    db_path = _build_temp_db(tmp_path)
    monkeypatch.setenv("QWERY_DB_PATH", db_path)
    monkeypatch.setenv("QWERY_WORK_DIR", str(tmp_path / "data"))

    agent = create_agent(llm_service=MockLlmService("Here is SQL: SELECT * FROM tracks LIMIT 5"))
    run_sql = await agent.tool_registry.get_tool("run_sql")
    viz = await agent.tool_registry.get_tool("visualize_data")
    assert run_sql is not None
    assert viz is not None


def test_build_user_resolver_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    from qwery_core.auth import supabase as supabase_module

    supabase_module._cached_config.cache_clear()

    monkeypatch.setenv("QWERY_AUTH_PROVIDER", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")

    class DummyClient:
        def __init__(self):
            self.auth = types.SimpleNamespace(
                set_session=lambda access, refresh: None,
                get_user=lambda: types.SimpleNamespace(
                    user=types.SimpleNamespace(id="u-123", user_metadata={"roles": ["read_data"]})
                ),
            )

    monkeypatch.setattr("qwery_core.auth.supabase.create_client", lambda url, key: DummyClient())

    resolver = _build_user_resolver(None)
    assert resolver.__class__.__name__ == "SupabaseUserResolver"


def test_build_user_resolver_supabase_missing_config(monkeypatch: pytest.MonkeyPatch) -> None:
    from qwery_core.auth import supabase as supabase_module

    supabase_module._cached_config.cache_clear()

    monkeypatch.setenv("QWERY_AUTH_PROVIDER", "supabase")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)

    with pytest.raises(RuntimeError):
        _build_user_resolver(None)

