from __future__ import annotations

from functools import lru_cache
import os

from fastapi import FastAPI

from ...application.services import create_agent
from .fastapi import QweryFastAPIServer
from ..websocket import register_websocket_routes


@lru_cache(maxsize=1)
def _build_app() -> FastAPI:
    agent = create_agent(require_database=True)
    server = QweryFastAPIServer(agent)
    app = server.create_app()
    register_websocket_routes(app, agent)

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

