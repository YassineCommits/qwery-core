from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import pytest

from qwery_core import cli


class StubAgent:
    tool_registry = None


@pytest.mark.asyncio
async def test_cli_supabase_session_uses_token_json(monkeypatch: pytest.MonkeyPatch) -> None:
    token_path = Path(__file__).parent / "token.json"
    tokens = json.loads(token_path.read_text())

    captured: Dict[str, Any] = {}

    async def fake_handle_prompt(
        agent,
        request_context,
        prompt,
        *,
        session_manager,
        project_id,
        chat_id,
        access_token,
        refresh_token,
    ):
        captured["project_id"] = project_id
        captured["chat_id"] = chat_id
        captured["access_token"] = access_token
        captured["refresh_token"] = refresh_token
        captured["prompt"] = prompt
        captured["session_manager"] = session_manager
        return {
            "summary": "ok",
            "sql": "SELECT 1",
            "columns": ["column"],
            "preview_rows": [[1]],
            "truncated": False,
            "csv_filename": "results.csv",
            "visualization": None,
        }

    monkeypatch.setattr(cli, "create_agent", lambda require_database=True: StubAgent())
    monkeypatch.setattr(cli, "handle_prompt", fake_handle_prompt)
    monkeypatch.setattr(cli, "_print_agent_response", lambda response: None)

    await cli._chat_loop(
        agent_name="tester",
        prompt="list my tables",
        project_id="project-abc",
        chat_id="chat-xyz",
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
    )

    assert captured["project_id"] == "project-abc"
    assert captured["chat_id"] == "chat-xyz"
    assert captured["prompt"] == "list my tables"
    assert captured["access_token"] == tokens["access_token"]
    assert captured["refresh_token"] == tokens["refresh_token"]
    # session_manager should be provided when Supabase is enabled
    assert captured["session_manager"] is not None

