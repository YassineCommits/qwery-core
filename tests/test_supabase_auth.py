from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import pytest
from dotenv import load_dotenv

from qwery_core.auth.supabase import SupabaseAuthError, SupabaseUserResolver


class _MockRequestContext:
    def __init__(self, headers: dict[str, str], cookies: Optional[dict[str, str]] = None) -> None:
        self._headers = {k.lower(): v for k, v in headers.items()}
        self._cookies = {k: v for k, v in (cookies or {}).items()}

    def get_header(self, name: str) -> Optional[str]:
        return self._headers.get(name.lower())

    def get_cookie(self, name: str) -> Optional[str]:
        return self._cookies.get(name)


@pytest.mark.asyncio
async def test_supabase_user_resolver_integration(monkeypatch: pytest.MonkeyPatch) -> None:
    token_path = Path(__file__).parent / "token.json"
    if not token_path.exists():
        pytest.skip("token.json not available")

    token_data = json.loads(token_path.read_text())

    load_dotenv(override=False)

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon = os.getenv("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_anon:
        pytest.skip("Supabase environment not configured")

    monkeypatch.setenv("SUPABASE_URL", supabase_url)
    monkeypatch.setenv("SUPABASE_ANON_KEY", supabase_anon)
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if service_key:
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", service_key)

    monkeypatch.setenv("QWERY_DEFAULT_GROUPS", "read_data")

    # Ensure cached config picks up the patched values
    from qwery_core.auth import supabase as supabase_module

    supabase_module._cached_config.cache_clear()

    resolver = SupabaseUserResolver()

    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    request_context = _MockRequestContext(
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-Refresh-Token": refresh_token or "",
        }
    )

    try:
        user = await resolver.resolve_user(request_context)
    except SupabaseAuthError as exc:
        pytest.skip(f"Supabase authentication failed: {exc}")

    assert user.id == token_data["user"]["id"]
    assert user.group_memberships == ["read_data"]

