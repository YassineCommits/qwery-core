"""FastAPI server wrapper for qwery-core."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.status import HTTP_204_NO_CONTENT

from ..agent import handle_prompt
from ..core import RequestContext
from ..datasources import DatasourceRecord, DatasourceStore
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
    datasource_id: Optional[str] = Field(default=None, alias="datasourceId")
    datasource_slug: Optional[str] = Field(default=None, alias="datasourceSlug")

    model_config = {"populate_by_name": True}


class ChatResponse(BaseModel):
    summary: str
    sql: str
    columns: list[str]
    rows: list[list[Any]]
    truncated: bool
    csv_filename: str
    visualization: Optional[Dict[str, Any]]


class DatasourceBase(BaseModel):
    name: str
    description: str = ""
    slug: Optional[str] = None
    datasource_provider: str = Field(..., alias="datasourceProvider")
    datasource_driver: str = Field(..., alias="datasourceDriver")
    datasource_kind: str = Field(..., alias="datasourceKind")
    config: Dict[str, Any] = Field(default_factory=dict)
    created_by: str = Field("system", alias="createdBy")
    updated_by: str = Field("system", alias="updatedBy")

    model_config = {"populate_by_name": True}


class DatasourceCreateRequest(DatasourceBase):
    id: Optional[str] = None


class DatasourceUpdateRequest(DatasourceBase):
    pass


class DatasourceResponse(BaseModel):
    id: str
    project_id: str = Field(alias="projectId")
    name: str
    description: str
    slug: str
    datasource_provider: str = Field(alias="datasourceProvider")
    datasource_driver: str = Field(alias="datasourceDriver")
    datasource_kind: str = Field(alias="datasourceKind")
    config: Dict[str, Any]
    connection_url: Optional[str] = Field(default=None, alias="connectionUrl")
    created_by: str = Field(alias="createdBy")
    updated_by: str = Field(alias="updatedBy")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


@dataclass(slots=True)
class QweryFastAPIServer:
    """FastAPI server for qwery-core endpoints."""

    agent: Any
    datasource_store: DatasourceStore

    def create_app(self) -> FastAPI:
        app = FastAPI()

        @app.get(
            "/api/v1/projects/{project_id}/datasources",
            response_model=List[DatasourceResponse],
        )
        async def list_datasources(project_id: str) -> List[DatasourceResponse]:
            records = self.datasource_store.list(project_id)
            return [self._to_datasource_response(record) for record in records]

        @app.post(
            "/api/v1/projects/{project_id}/datasources",
            response_model=DatasourceResponse,
        )
        async def create_datasource(
            project_id: str,
            payload: DatasourceCreateRequest,
        ) -> DatasourceResponse:
            record = self.datasource_store.upsert(
                project_id=project_id,
                name=payload.name,
                description=payload.description,
                datasource_provider=payload.datasource_provider,
                datasource_driver=payload.datasource_driver,
                datasource_kind=payload.datasource_kind,
                config=payload.config,
                created_by=payload.created_by,
                updated_by=payload.updated_by,
                datasource_id=payload.id,
                slug=payload.slug,
            )
            return self._to_datasource_response(record)

        @app.get(
            "/api/v1/projects/{project_id}/datasources/{datasource_id}",
            response_model=DatasourceResponse,
        )
        async def get_datasource(
            project_id: str,
            datasource_id: str,
        ) -> DatasourceResponse:
            record = self.datasource_store.get(datasource_id)
            if not record or record.project_id != project_id:
                raise HTTPException(status_code=404, detail="Datasource not found")
            return self._to_datasource_response(record)

        @app.put(
            "/api/v1/projects/{project_id}/datasources/{datasource_id}",
            response_model=DatasourceResponse,
        )
        async def update_datasource(
            project_id: str,
            datasource_id: str,
            payload: DatasourceUpdateRequest,
        ) -> DatasourceResponse:
            record = self.datasource_store.get(datasource_id)
            if not record or record.project_id != project_id:
                raise HTTPException(status_code=404, detail="Datasource not found")
            updated = self.datasource_store.upsert(
                project_id=project_id,
                name=payload.name,
                description=payload.description,
                datasource_provider=payload.datasource_provider,
                datasource_driver=payload.datasource_driver,
                datasource_kind=payload.datasource_kind,
                config=payload.config,
                created_by=record.created_by,
                updated_by=payload.updated_by,
                datasource_id=datasource_id,
                slug=payload.slug or record.slug,
            )
            return self._to_datasource_response(updated)

        @app.delete("/api/v1/projects/{project_id}/datasources/{datasource_id}")
        async def delete_datasource(
            project_id: str,
            datasource_id: str,
        ) -> Response:
            deleted = self.datasource_store.delete(project_id, datasource_id)
            if not deleted:
                raise HTTPException(status_code=404, detail="Datasource not found")
            return Response(status_code=HTTP_204_NO_CONTENT)

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
                    database_url = self._resolve_database_url(project_id, payload)
                    result = await handle_prompt(
                        self.agent,
                        request_context,
                        payload.prompt,
                        database_url=database_url,
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
                database_url = self._resolve_database_url(project_id, payload)
                result = await handle_prompt(
                    self.agent,
                    request_context,
                    payload.prompt,
                    database_url=database_url,
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

    def _resolve_database_url(
        self,
        project_id: str,
        payload: ChatRequest,
    ) -> Optional[str]:
        identifier = payload.datasource_id or payload.datasource_slug
        if not identifier:
            return None
        record = self.datasource_store.get_for_project(project_id, identifier)
        if not record:
            raise HTTPException(status_code=404, detail="Datasource not found")
        database_url = record.connection_url
        if not database_url:
            raise HTTPException(
                status_code=400,
                detail="Datasource config must include a connection_url or connection string",
            )
        return database_url

    @staticmethod
    def _to_datasource_response(record: DatasourceRecord) -> DatasourceResponse:
        return DatasourceResponse(
            id=record.id,
            projectId=record.project_id,
            name=record.name,
            description=record.description,
            slug=record.slug,
            datasourceProvider=record.datasource_provider,
            datasourceDriver=record.datasource_driver,
            datasourceKind=record.datasource_kind,
            config=record.config,
            connectionUrl=record.connection_url,
            createdBy=record.created_by,
            updatedBy=record.updated_by,
            createdAt=record.created_at,
            updatedAt=record.updated_at,
        )

