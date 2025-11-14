"""FastAPI server wrapper for qwery-core."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..agent import handle_prompt
from ..core import RequestContext
from ..toon import encode_query_results


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

        # IMPORTANT: /messages/stream must be defined BEFORE /messages
        # FastAPI matches routes in order, and /messages would match /messages/stream otherwise
        @app.post("/api/v1/projects/{project_id}/{chat_id}/messages/stream")
        async def chat_message_stream(
            project_id: str,
            chat_id: str,
            payload: ChatRequest,
            request: Request,
        ) -> StreamingResponse:
            """Stream chat response using Server-Sent Events (SSE)."""
            headers = {k.lower(): v for k, v in request.headers.items()}
            cookies = dict(request.cookies) if request.cookies else {}
            request_context = RequestContext(headers=headers, cookies=cookies)

            async def generate() -> AsyncGenerator[str, None]:
                try:
                    # Send initial message
                    yield f"data: {json.dumps({'type': 'start'})}\n\n"
                    
                    # Process the full request (this handles LLM, SQL execution, etc.)
                    # For true streaming, we'd need to refactor handle_prompt to support streaming
                    result = await handle_prompt(
                        self.agent,
                        request_context,
                        payload.prompt,
                    )
                    
                    # Format response in TOON
                    sql_text = result.get("sql", "")
                    columns = result.get("columns") or []
                    preview_rows = result.get("preview_rows") or []
                    
                    # Extract human-readable summary
                    summary_text = (result.get("summary") or "").strip()
                    if summary_text:
                        summary_lines = summary_text.split("\n")
                        for line in summary_lines:
                            line = line.strip()
                            if line and not any(skip in line for skip in ["SQL:", "Preview:", "Results saved", "Query executed"]):
                                human_answer = line
                                break
                        else:
                            human_answer = "Query executed successfully."
                    else:
                        human_answer = "Query executed successfully."
                    
                    # Send human answer
                    yield f"data: {json.dumps({'type': 'answer', 'content': human_answer})}\n\n"
                    
                    # Send TOON data
                    if sql_text:
                        toon_content = encode_query_results(sql_text, columns, preview_rows)
                        yield f"data: {json.dumps({'type': 'toon', 'content': toon_content})}\n\n"
                    
                    # Send completion
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    
                except Exception as exc:
                    yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

            return StreamingResponse(
                generate(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",  # Disable nginx buffering
                },
            )

        @app.post(
            "/api/v1/projects/{project_id}/{chat_id}/messages",
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

