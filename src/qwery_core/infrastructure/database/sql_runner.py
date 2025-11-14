"""SQL database runners for executing queries."""

from __future__ import annotations

import logging
import os
import sqlite3
import time
from dataclasses import dataclass
from typing import Any, Iterable, List, Optional, Sequence, Tuple

try:
    import psycopg2
    from psycopg2 import pool
except ImportError:
    psycopg2 = None  # type: ignore
    pool = None  # type: ignore

logger = logging.getLogger(__name__)

# Connection pool configuration
DEFAULT_POOL_MIN = int(os.environ.get("QWERY_DB_POOL_MIN", "2"))
DEFAULT_POOL_MAX = int(os.environ.get("QWERY_DB_POOL_MAX", "20"))


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
            # Get column names from Row objects (when row_factory is sqlite3.Row)
            if rows and isinstance(rows[0], sqlite3.Row):
                columns = list(rows[0].keys())
            elif cursor.description:
                columns = [desc[0] for desc in cursor.description]
            else:
                columns = []
            logger.info(f"[SQLITE_FETCH] took={time.time() - fetch_start:.4f}s, rows={len(rows)}, cols={len(columns)}")
        
        convert_start = time.time()
        result = QueryResult(columns=list(columns), rows=[tuple(row) for row in rows])
        logger.info(f"[SQLITE_CONVERT] took={time.time() - convert_start:.4f}s, total_took={time.time() - sqlite_start:.4f}s")
        return result


class PostgresRunner:
    def __init__(self, connection_string: str, minconn: int = DEFAULT_POOL_MIN, maxconn: int = DEFAULT_POOL_MAX) -> None:
        if psycopg2 is None or pool is None:
            raise RuntimeError("psycopg2 is required for PostgreSQL support. Install it with: pip install psycopg2-binary")
        self.connection_string = connection_string
        self._pool: Optional[pool.ThreadedConnectionPool] = None
        self._minconn = minconn
        self._maxconn = maxconn
        self._lock = False  # Simple lock flag for thread safety

    def _get_pool(self) -> pool.ThreadedConnectionPool:
        """Get or create connection pool."""
        if self._pool is None:
            self._pool = pool.ThreadedConnectionPool(
                minconn=self._minconn,
                maxconn=self._maxconn,
                dsn=self.connection_string,
            )
            logger.info(f"[POSTGRES_POOL_CREATED] min={self._minconn}, max={self._maxconn}")
        return self._pool

    def run(self, query: str, params: Iterable[Any] | None = None) -> QueryResult:
        pg_start = time.time()
        logger.info(f"[POSTGRES_RUN_START] query_length={len(query)}, has_params={params is not None}, timestamp={pg_start}")
        
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is required for PostgreSQL support")
        
        connection_pool = self._get_pool()
        conn = None
        try:
            connect_start = time.time()
            conn = connection_pool.getconn()
            logger.info(f"[POSTGRES_POOL_GET] took={time.time() - connect_start:.4f}s")
            
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
        except Exception as e:
            logger.error(f"[POSTGRES_RUN_ERROR] error={e}")
            raise
        finally:
            if conn:
                connection_pool.putconn(conn)
                logger.debug("[POSTGRES_POOL_PUT] connection returned to pool")

    def close(self) -> None:
        """Close the connection pool."""
        if self._pool:
            self._pool.closeall()
            self._pool = None
            logger.info("[POSTGRES_POOL_CLOSED]")


__all__ = ["PostgresRunner", "SqliteRunner", "QueryResult"]
