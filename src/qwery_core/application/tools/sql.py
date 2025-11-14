"""SQL execution tool for running queries against databases."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Iterable

from ...infrastructure.database.sql_runner import QueryResult

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RunSqlResult:
    columns: list[str]
    rows: list[tuple[Any, ...]]


class RunSqlTool:
    name = "run_sql"

    def __init__(self, sql_runner, file_system) -> None:
        self.sql_runner = sql_runner
        self.file_system = file_system

    async def __call__(self, query: str, params: Iterable[Any] | None = None) -> RunSqlResult:
        return await self.execute(query, params=params)

    async def execute(self, query: str, params: Iterable[Any] | None = None) -> RunSqlResult:
        sql_start = time.time()
        logger.info(f"[SQL_TOOL_EXEC_START] query_length={len(query)}, has_params={params is not None}, timestamp={sql_start}")
        
        run_start = time.time()
        result: QueryResult = self.sql_runner.run(query, params=params)
        logger.info(f"[SQL_TOOL_RUN_DONE] took={time.time() - run_start:.4f}s, rows={len(result.rows)}, cols={len(result.columns)}")
        
        convert_start = time.time()
        sql_result = RunSqlResult(columns=list(result.columns), rows=list(result.rows))
        logger.info(f"[SQL_TOOL_CONVERT] took={time.time() - convert_start:.4f}s, total_took={time.time() - sql_start:.4f}s")
        return sql_result


__all__ = ["RunSqlTool", "RunSqlResult"]
