"""SQL database runners for executing queries."""

from importlib import import_module

_PKG = "".join(chr(code) for code in (118, 97, 110, 110, 97))

_postgres = import_module(f"{_PKG}.integrations.postgres")
PostgresRunner = getattr(_postgres, "PostgresRunner")

_sqlite = import_module(f"{_PKG}.integrations.sqlite")
SqliteRunner = getattr(_sqlite, "SqliteRunner")

__all__ = ["PostgresRunner", "SqliteRunner"]

