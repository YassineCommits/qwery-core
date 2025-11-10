from __future__ import annotations

from functools import lru_cache

from fastapi import FastAPI

from .agent import create_agent
from .server_components.fastapi import QweryFastAPIServer


@lru_cache(maxsize=1)
def _build_app() -> FastAPI:
    agent = create_agent()
    server = QweryFastAPIServer(agent)
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

