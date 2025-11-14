"""SQL database runners for executing queries."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any, Iterable, List, Sequence, Tuple

try:
    import psycopg2
except ImportError:
    psycopg2 = None  # type: ignore


@dataclass(slots=True)
class QueryResult:
    columns: Sequence[str]
    rows: List[Tuple[Any, ...]]


class SqliteRunner:
    def __init__(self, database_path: str) -> None:
        self.database_path = database_path

    def run(self, query: str, params: Iterable[Any] | None = None) -> QueryResult:
        with sqlite3.connect(self.database_path) as conn:
            conn.row_factory = sqlite3.Row
            if params is not None:
                cursor = conn.execute(query, params)
            else:
                cursor = conn.execute(query)
            rows = cursor.fetchall()
            columns = cursor.keys()
        return QueryResult(columns=list(columns), rows=[tuple(row) for row in rows])


class PostgresRunner:
    def __init__(self, connection_string: str) -> None:
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is required for PostgreSQL support. Install it with: pip install psycopg2-binary")
        self.connection_string = connection_string

    def run(self, query: str, params: Iterable[Any] | None = None) -> QueryResult:
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is required for PostgreSQL support")
        with psycopg2.connect(self.connection_string) as conn:
            with conn.cursor() as cursor:
                if params is not None:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                if cursor.description is None:
                    return QueryResult(columns=[], rows=[])
                columns = [column.name for column in cursor.description]
                rows = cursor.fetchall()
        return QueryResult(columns=columns, rows=rows)


__all__ = ["PostgresRunner", "SqliteRunner", "QueryResult"]
