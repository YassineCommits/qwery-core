from __future__ import annotations

from functools import lru_cache
import logging
import os
import sys

from fastapi import FastAPI

from .agent import create_agent
from .server_components.fastapi import QweryFastAPIServer
from .server_components.websocket import register_websocket_routes

# Configure logging
log_level = os.environ.get("QWERY_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ],
    force=True,  # Override any existing configuration
)


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

