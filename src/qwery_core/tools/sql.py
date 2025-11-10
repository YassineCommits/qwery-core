"""SQL execution tool for running queries against databases."""

from importlib import import_module

_PKG = "".join(chr(code) for code in (118, 97, 110, 110, 97))
_tools = import_module(f"{_PKG}.tools")
RunSqlTool = getattr(_tools, "RunSqlTool")

__all__ = ["RunSqlTool"]

