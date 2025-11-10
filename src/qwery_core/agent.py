from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

from dotenv import load_dotenv

from vanna import Agent, AgentConfig, ToolRegistry
from vanna.core import LlmService
from vanna.core.user import RequestContext, User, UserResolver
from vanna.integrations.local import LocalFileSystem
from vanna.integrations.local.agent_memory import DemoAgentMemory
from vanna.integrations.postgres import PostgresRunner
from vanna.integrations.sqlite import SqliteRunner
from vanna.tools import RunSqlTool, VisualizeDataTool

from .llm import build_llm_service


class EnvUserResolver(UserResolver):
    """Resolve users from cookies/headers with env defaults."""

    async def resolve_user(self, request_context: RequestContext) -> User:
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


def create_agent(
    database_path: Optional[str] = None,
    working_directory: Optional[str] = None,
    llm_service: Optional[LlmService] = None,
    user_resolver: Optional[UserResolver] = None,
) -> Agent:
    """Create an agent configured for text-to-SQL + visualization."""

    load_dotenv()

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
        user_resolver=user_resolver or EnvUserResolver(),
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
    )

