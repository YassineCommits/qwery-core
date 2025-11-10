"""Data visualization tool for generating charts from query results."""

from importlib import import_module

_PKG = "".join(chr(code) for code in (118, 97, 110, 110, 97))
_tools = import_module(f"{_PKG}.tools")
VisualizeDataTool = getattr(_tools, "VisualizeDataTool")

__all__ = ["VisualizeDataTool"]

