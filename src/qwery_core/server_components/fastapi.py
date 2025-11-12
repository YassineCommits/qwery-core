"""FastAPI server wrapper for qwery-core."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

from ..agent import handle_prompt
from ..core import RequestContext


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


class ChatRequest(BaseModel):
    prompt: str


class ChatResponse(BaseModel):
    summary: str
    sql: str
    columns: list[str]
    rows: list[list[Any]]
    truncated: bool
    csv_filename: str
    visualization: Optional[Dict[str, Any]]


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

        @app.post(
            "/api/v1/projects/{project_id}/chats/{chat_id}/messages",
            response_model=ChatResponse,
        )
        async def chat_message(
            project_id: str,
            chat_id: str,
            payload: ChatRequest,
            request: Request,
        ) -> ChatResponse:
            headers = {k.lower(): v for k, v in request.headers.items()}
            cookies = dict(request.cookies) if request.cookies else {}
            request_context = RequestContext(headers=headers, cookies=cookies)

            try:
                result = await handle_prompt(
                    self.agent,
                    request_context,
                    payload.prompt,
                )
            except RuntimeError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            return ChatResponse(
                summary=result.get("summary", ""),
                sql=result.get("sql", ""),
                columns=result.get("columns", []),
                rows=result.get("preview_rows", []),
                truncated=bool(result.get("truncated")),
                csv_filename=result.get("csv_filename", ""),
                visualization=result.get("visualization"),
            )

        return app

