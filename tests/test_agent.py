from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from vanna.integrations.mock import MockLlmService

from qwery_core.agent import create_agent


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
    monkeypatch.delenv("QWERY_DB_PATH", raising=False)
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

