"""FastAPI server wrapper for qwery-core."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


class RunSqlRequest(BaseModel):
    query: str


class RunSqlResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]


class VisualizationResponse(BaseModel):
    figure: Dict[str, Any]


class VisualizationRequest(BaseModel):
    data: Dict[str, list[Any]]
    chart_type: str = "bar"
    title: str = "Visualization"


@dataclass(slots=True)
class QweryFastAPIServer:
    """FastAPI server for qwery-core endpoints."""

    agent: Any

    def create_app(self) -> FastAPI:
        app = FastAPI()

        @app.post("/api/v1/run-sql", response_model=RunSqlResponse)
        async def run_sql(payload: RunSqlRequest) -> RunSqlResponse:
            tool = await self.agent.tool_registry.get_tool("run_sql")
            if tool is None:
                raise HTTPException(status_code=404, detail="run_sql tool not available")
            result = await tool.execute(payload.query)
            return RunSqlResponse(columns=result.columns, rows=[list(row) for row in result.rows])

        @app.post("/api/v1/visualize", response_model=VisualizationResponse)
        async def visualize(payload: VisualizationRequest) -> VisualizationResponse:
            tool = await self.agent.tool_registry.get_tool("visualize_data")
            if tool is None:
                raise HTTPException(status_code=404, detail="visualize_data tool not available")
            result = await tool.execute(
                data=payload.data,
                chart_type=payload.chart_type,
                title=payload.title,
            )
            return VisualizationResponse(figure=result.figure_json)

        return app

