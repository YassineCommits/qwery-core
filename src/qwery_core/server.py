from __future__ import annotations

from functools import lru_cache
import logging
import os
import sys

from fastapi import FastAPI

from .agent import create_agent
from .middleware.rate_limit import RateLimitMiddleware
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


def _build_app() -> FastAPI:
    agent = create_agent(require_database=True)
    server = QweryFastAPIServer(agent)
    app = server.create_app()
    register_websocket_routes(app, agent)

    # Add rate limiting middleware
    rate_limit_rpm = int(os.environ.get("QWERY_RATE_LIMIT_RPM", "60"))
    rate_limit_rph = int(os.environ.get("QWERY_RATE_LIMIT_RPH", "1000"))
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=rate_limit_rpm,
        requests_per_hour=rate_limit_rph,
    )

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

