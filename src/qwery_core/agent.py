from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse
import csv
import json
from uuid import uuid4

from dotenv import load_dotenv

from .auth import SupabaseAuthError, SupabaseUserResolver
from .core import (
    Agent,
    AgentConfig,
    DemoAgentMemory,
    LocalFileSystem,
    ToolRegistry,
    User,
    UserResolver,
    RequestContext,
)
from .integrations import PostgresRunner, SqliteRunner
from .llm import LlmService, build_llm_service
from .tools import RunSqlTool, VisualizeDataTool


class EnvUserResolver(UserResolver):
    """Resolve users from cookies/headers with env defaults."""

    async def resolve_user(self, request_context) -> User:
        user_id = request_context.get_cookie("user_id") or request_context.get_header("x-user-id")
        if not user_id:
            user_id = os.environ.get("QWERY_DEFAULT_USER_ID", "demo-user")

        memberships = request_context.get_header("x-user-groups")
        if memberships:
            groups = [g.strip() for g in memberships.split(";") if g.strip()]
        else:
            env_groups = os.environ.get("QWERY_DEFAULT_GROUPS", "read_data")
            groups = [g.strip() for g in env_groups.split(",") if g.strip()]

        return User(id=user_id, group_memberships=groups)


@dataclass(slots=True)
class AgentSettings:
    database_url: str
    working_directory: str
    llm_service: LlmService
    include_thinking_indicators: bool = False
    stream_responses: bool = True
    user_resolver: Optional[UserResolver] = None


def _build_sql_runner(database_url: str):
    parsed = urlparse(database_url)
    scheme = parsed.scheme.lower()

    if scheme in {"postgres", "postgresql"}:
        return PostgresRunner(connection_string=database_url)

    if scheme in {"sqlite", "file"} or not scheme:
        path = parsed.path if scheme else database_url
        if not path:
            raise ValueError("SQLite connection must include a file path")
        abs_path = os.path.abspath(path)
        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"SQLite database not found: {abs_path}")
        return SqliteRunner(database_path=abs_path)

    raise ValueError(f"Unsupported database scheme: {scheme}")


def _build_tool_registry(settings: AgentSettings) -> ToolRegistry:
    file_system = LocalFileSystem(settings.working_directory)
    sql_runner = _build_sql_runner(settings.database_url)

    registry = ToolRegistry()
    registry.register_local_tool(RunSqlTool(sql_runner=sql_runner, file_system=file_system), [])
    registry.register_local_tool(VisualizeDataTool(file_system=file_system), [])
    return registry


def _build_user_resolver(explicit_resolver: Optional[UserResolver]) -> UserResolver:
    if explicit_resolver is not None:
        return explicit_resolver

    provider = os.environ.get("QWERY_AUTH_PROVIDER", "").strip().lower()
    if provider == "supabase":
        try:
            return SupabaseUserResolver()
        except SupabaseAuthError as exc:  # pragma: no cover - configuration error
            raise RuntimeError("Supabase authentication requested but misconfigured") from exc

    return EnvUserResolver()


def create_agent(
    database_path: Optional[str] = None,
    working_directory: Optional[str] = None,
    llm_service: Optional[LlmService] = None,
    user_resolver: Optional[UserResolver] = None,
) -> Agent:
    """Create an agent configured for text-to-SQL + visualization."""

    if os.environ.get("QWERY_SKIP_DOTENV") != "1":
        load_dotenv(override=False)

    db_url = database_path or os.environ.get("QWERY_DB_URL") or os.environ.get("QWERY_DB_PATH")
    if not db_url:
        raise ValueError("database_path must be provided or set QWERY_DB_URL / QWERY_DB_PATH")

    work_dir = working_directory or os.environ.get("QWERY_WORK_DIR", "./data_storage")
    os.makedirs(work_dir, exist_ok=True)

    llm = llm_service or build_llm_service()

    settings = AgentSettings(
        database_url=db_url,
        working_directory=work_dir,
        llm_service=llm,
        user_resolver=_build_user_resolver(user_resolver),
    )

    tools = _build_tool_registry(settings)

    agent_memory = DemoAgentMemory()

    return Agent(
        llm_service=settings.llm_service,
        tool_registry=tools,
        user_resolver=settings.user_resolver,
        agent_memory=agent_memory,
        config=AgentConfig(
            stream_responses=settings.stream_responses,
            include_thinking_indicators=settings.include_thinking_indicators,
        ),
        working_directory=work_dir,
    )


SYSTEM_PROMPT = """You are a PostgreSQL analytics assistant. Convert the user request into a valid SQL query.
Respond with JSON containing:
{
  "sql": "<SQL query>",
  "summary": "<short description of what the query does>",
  "visualization": {
    "type": "bar|line|scatter|none",
    "x": "column name for x axis",
    "y": "column name for y axis",
    "title": "Chart title"
  }
}
If no visualization is appropriate, set "visualization": null.
Do not include any markdown or commentary outside the JSON."""


def _clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # drop leading and trailing fences
        lines = [line for line in lines if not line.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return text


def _write_csv(path: str, columns: list[str], rows: list[tuple]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(columns)
        writer.writerows(rows)


async def handle_prompt(agent: Agent, request_context: RequestContext, prompt: str) -> dict[str, object]:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    llm_result = await agent.llm_service.send_request({"messages": messages})
    payload_text = _clean_json(llm_result.content)

    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError as exc:  # pragma: no cover - LLM failure path
        raise RuntimeError(f"Failed to parse model response as JSON: {payload_text}") from exc

    sql = payload.get("sql")
    if not sql:
        raise RuntimeError("Model response did not include 'sql'")

    run_sql_tool = await agent.tool_registry.get_tool("run_sql")
    if run_sql_tool is None:
        raise RuntimeError("run_sql tool is not registered")

    result = await run_sql_tool.execute(sql)

    csv_filename = f"query_results_{uuid4().hex[:8]}.csv"
    csv_path = os.path.join(agent.working_directory, csv_filename)
    _write_csv(csv_path, result.columns, result.rows)

    preview_limit = 20
    preview_rows = [list(row) for row in result.rows[:preview_limit]]
    truncated = len(result.rows) > preview_limit

    viz_summary = None
    viz_payload = payload.get("visualization")
    visualize_tool = await agent.tool_registry.get_tool("visualize_data")
    if viz_payload and visualize_tool:
        viz_type = (viz_payload.get("type") or "").lower()
        x_col = viz_payload.get("x")
        y_col = viz_payload.get("y")
        title = viz_payload.get("title") or "Visualization"
        if viz_type in {"bar", "line", "scatter"} and x_col in result.columns and y_col in result.columns:
            data = {
                x_col: [row[result.columns.index(x_col)] for row in result.rows],
                y_col: [row[result.columns.index(y_col)] for row in result.rows],
            }
            await visualize_tool.execute(data=data, chart_type=viz_type, title=title)
            viz_summary = {
                "title": title,
                "type": viz_type,
            }

    return {
        "columns": result.columns,
        "preview_rows": preview_rows,
        "truncated": truncated,
        "csv_filename": csv_filename,
        "summary": payload.get("summary", ""),
        "visualization": viz_summary,
        "sql": sql,
    }

