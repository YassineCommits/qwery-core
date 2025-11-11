"""SQL execution tool for running queries against databases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from ..integrations.sql_runner import QueryResult


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
        result: QueryResult = self.sql_runner.run(query, params=params)
        return RunSqlResult(columns=list(result.columns), rows=list(result.rows))


__all__ = ["RunSqlTool", "RunSqlResult"]
