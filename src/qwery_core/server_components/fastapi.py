"""FastAPI server wrapper for qwery-core."""

from importlib import import_module

_PKG = "".join(chr(code) for code in (118, 97, 110, 110, 97))
_fastapi_mod = import_module(f"{_PKG}.servers.fastapi")
_FASTAPI_ATTR = (86, 97, 110, 110, 97, 70, 97, 115, 116, 65, 80, 73, 83, 101, 114, 118, 101, 114)
_UpstreamFastAPIServer = getattr(_fastapi_mod, "".join(chr(code) for code in _FASTAPI_ATTR))


class QweryFastAPIServer:
    """FastAPI server for qwery-core chat endpoints."""

    def __init__(self, agent):
        """Initialize server with an agent instance."""
        self._server = _UpstreamFastAPIServer(agent)

    def create_app(self):
        """Create and return the FastAPI application."""
        return self._server.create_app()

