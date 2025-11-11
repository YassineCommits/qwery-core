from __future__ import annotations

from functools import lru_cache
import os

from fastapi import FastAPI

from .agent import create_agent
from .server_components.fastapi import QweryFastAPIServer
from .supabase import SupabaseSessionManager


@lru_cache(maxsize=1)
def _build_app() -> FastAPI:
    auth_provider = os.environ.get("QWERY_AUTH_PROVIDER", "").strip().lower()
    use_supabase = auth_provider == "supabase"

    agent = create_agent(require_database=not use_supabase)
    session_manager = SupabaseSessionManager() if use_supabase else None
    server = QweryFastAPIServer(agent, session_manager=session_manager)
    app = server.create_app()

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


def create_app(*args, **kwargs):
    """
    Return FastAPI application instance.

    Compatible with both uvicorn --factory and direct ASGI usage.
    """
    app = _build_app()
    if args:
        return app(*args, **kwargs)
    return app


app = _build_app()

