"""SQL database runners for executing queries."""

from __future__ import annotations

import logging
import sqlite3
import time
from dataclasses import dataclass
from typing import Any, Iterable, List, Sequence, Tuple

try:
    import psycopg2
except ImportError:
    psycopg2 = None  # type: ignore

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class QueryResult:
    columns: Sequence[str]
    rows: List[Tuple[Any, ...]]


class SqliteRunner:
    def __init__(self, database_path: str) -> None:
        self.database_path = database_path

    def run(self, query: str, params: Iterable[Any] | None = None) -> QueryResult:
        sqlite_start = time.time()
        logger.info(f"[SQLITE_RUN_START] db_path={self.database_path}, query_length={len(query)}, has_params={params is not None}, timestamp={sqlite_start}")
        
        connect_start = time.time()
        with sqlite3.connect(self.database_path) as conn:
            logger.info(f"[SQLITE_CONNECT] took={time.time() - connect_start:.4f}s")
            
            conn.row_factory = sqlite3.Row
            execute_start = time.time()
            if params is not None:
                cursor = conn.execute(query, params)
            else:
                cursor = conn.execute(query)
            logger.info(f"[SQLITE_EXECUTE] took={time.time() - execute_start:.4f}s")
            
            fetch_start = time.time()
            rows = cursor.fetchall()
            columns = cursor.keys()
            logger.info(f"[SQLITE_FETCH] took={time.time() - fetch_start:.4f}s, rows={len(rows)}, cols={len(columns)}")
        
        convert_start = time.time()
        result = QueryResult(columns=list(columns), rows=[tuple(row) for row in rows])
        logger.info(f"[SQLITE_CONVERT] took={time.time() - convert_start:.4f}s, total_took={time.time() - sqlite_start:.4f}s")
        return result


class PostgresRunner:
    def __init__(self, connection_string: str) -> None:
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is required for PostgreSQL support. Install it with: pip install psycopg2-binary")
        self.connection_string = connection_string

    def run(self, query: str, params: Iterable[Any] | None = None) -> QueryResult:
        pg_start = time.time()
        logger.info(f"[POSTGRES_RUN_START] query_length={len(query)}, has_params={params is not None}, timestamp={pg_start}")
        
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is required for PostgreSQL support")
        
        connect_start = time.time()
        with psycopg2.connect(self.connection_string) as conn:
            logger.info(f"[POSTGRES_CONNECT] took={time.time() - connect_start:.4f}s")
            
            with conn.cursor() as cursor:
                execute_start = time.time()
                if params is not None:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                logger.info(f"[POSTGRES_EXECUTE] took={time.time() - execute_start:.4f}s")
                
                if cursor.description is None:
                    logger.info(f"[POSTGRES_NO_RESULT] total_took={time.time() - pg_start:.4f}s")
                    return QueryResult(columns=[], rows=[])
                
                fetch_start = time.time()
                columns = [column.name for column in cursor.description]
                rows = cursor.fetchall()
                logger.info(f"[POSTGRES_FETCH] took={time.time() - fetch_start:.4f}s, rows={len(rows)}, cols={len(columns)}")
        
        logger.info(f"[POSTGRES_RUN_DONE] total_took={time.time() - pg_start:.4f}s")
        return QueryResult(columns=columns, rows=rows)


__all__ = ["PostgresRunner", "SqliteRunner", "QueryResult"]
