from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect

from ..agent import handle_prompt
from ..core import RequestContext
from ..protocol import (
    CommandType,
    Heartbeat,
    MessageKind,
    MessageRole,
    ProtocolMessage,
    ProtocolPayload,
    SetCommandArgument,
    SetCommandArgumentType,
    create_error_message,
    create_handshake_message,
    create_text_message,
)
from ..supabase.session import ManagedSupabaseSession, SupabaseChatState, SupabaseSessionManager


logger = logging.getLogger(__name__)

INACTIVITY_TIMEOUT = timedelta(hours=1)
HEARTBEAT_INTERVAL = timedelta(seconds=45)


@dataclass
class ChatConnection:
    websocket: WebSocket
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    heartbeat_task: Optional[asyncio.Task] = None


class WebsocketAgentManager:
    def __init__(self, agent: Any, session_manager: SupabaseSessionManager):
        self.agent = agent
        self.session_manager = session_manager
        self._connections: Dict[str, List[ChatConnection]] = {}
        self._last_activity: Dict[str, datetime] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        *,
        project_id: str,
        chat_id: str,
        session: ManagedSupabaseSession,
        chat_state: SupabaseChatState,
    ) -> None:
        await websocket.accept()

        key = self._chat_key(session.key, chat_state.chat_id)
        connection = ChatConnection(websocket=websocket)
        connection.heartbeat_task = asyncio.create_task(self._heartbeat(connection))
        self._connections.setdefault(key, []).append(connection)
        self._last_activity[key] = datetime.now(timezone.utc)

        await self._send_json(
            websocket,
            create_handshake_message(
                project_id=project_id,
                chat_id=chat_state.chat_id,
                from_="server",
                to="client",
            ).to_dict(),
        )
        await self._send_history(websocket, chat_state)

    async def disconnect(self, websocket: WebSocket, *, session_key: str, chat_id: str) -> None:
        key = self._chat_key(session_key, chat_id)
        connection: Optional[ChatConnection] = None
        if key in self._connections:
            for existing in list(self._connections[key]):
                if existing.websocket is websocket:
                    connection = existing
                    self._connections[key].remove(existing)
                    break
            if not self._connections[key]:
                self._connections.pop(key, None)
                self._last_activity.pop(key, None)
        if connection:
            await self._stop_heartbeat(connection)

    async def handle_message(
        self,
        websocket: WebSocket,
        *,
        message: ProtocolMessage,
        session: ManagedSupabaseSession,
        chat_state: SupabaseChatState,
        access_token: str,
        refresh_token: Optional[str],
    ) -> None:
        key = self._chat_key(session.key, chat_state.chat_id)
        self._last_activity[key] = datetime.now(timezone.utc)

        payload_type = message.payload.get_payload_type()

        if message.kind == MessageKind.HEARTBEAT or payload_type == "heartbeat":
            await self._send_json(
                websocket,
                ProtocolMessage.create(
                    kind=MessageKind.HEARTBEAT,
                    payload=message.payload,
                    from_="server",
                    to="client",
                ).to_dict(),
            )
            return

        if message.kind == MessageKind.COMMAND and message.payload.command:
            await self._handle_command(websocket, message, chat_state)
            return

        if not message.payload.message:
            await self._send_json(
                websocket,
                create_error_message(
                    error_code="invalid_payload",
                    message="Unsupported message payload.",
                ).to_dict(),
            )
            return

        content = message.payload.message
        if content.role != MessageRole.USER:
            return

        request_context = RequestContext(
            headers={k.lower(): v for k, v in websocket.headers.items()},
            cookies=dict(websocket.cookies) if websocket.cookies else {},
        )

        try:
            response = await handle_prompt(
                self.agent,
                request_context,
                content.content,
                session_manager=self.session_manager,
                project_id=chat_state.project_id,
                chat_id=chat_state.chat_id,
                access_token=access_token,
                refresh_token=refresh_token,
            )
        except Exception as exc:
            logger.exception("Error while handling agent message")
            error_payload = create_error_message(
                error_code="agent_error",
                message=str(exc),
            ).to_dict()
            await self._send_json(websocket, error_payload)
            await self._broadcast(
                session_key=session.key,
                chat_id=chat_state.chat_id,
                message=error_payload,
                exclude={websocket},
            )
            return

        display_lines: List[str] = []
        summary_text = (response.get("summary") or "").strip()
        if summary_text:
            display_lines.append(summary_text)

        csv_filename = response.get("csv_filename")
        if csv_filename and (not summary_text or csv_filename not in summary_text):
            display_lines.append(f"Results saved to {csv_filename}.")

        sql_text = response.get("sql")
        if sql_text:
            display_lines.append("")
            display_lines.append("SQL:")
            display_lines.append(sql_text)

        columns = response.get("columns") or []
        preview_rows = response.get("preview_rows") or []
        if columns and preview_rows:
            display_lines.append("")
            display_lines.append("Preview:")
            display_lines.append(", ".join(str(col) for col in columns))
            for row in preview_rows[:5]:
                display_lines.append(", ".join(str(value) for value in row))
            if response.get("truncated"):
                display_lines.append("... (truncated)")

        if not display_lines:
            display_lines.append("Query executed successfully.")

        assistant_message = create_text_message(
            role=MessageRole.ASSISTANT,
            content="\n".join(line for line in display_lines if line),
            from_="server",
            to="client",
        )

        await self._broadcast(
            session_key=session.key,
            chat_id=chat_state.chat_id,
            message=assistant_message.to_dict(),
        )

    async def cleanup(self) -> None:
        now = datetime.now(timezone.utc)
        expired = [
            key
            for key, last_active in self._last_activity.items()
            if now - last_active > INACTIVITY_TIMEOUT
        ]
        for key in expired:
            connections = self._connections.get(key, [])
            for connection in list(connections):
                await self._stop_heartbeat(connection)
                with contextlib.suppress(Exception):
                    await connection.websocket.close(code=1001)
            self._connections.pop(key, None)
            self._last_activity.pop(key, None)

    async def _send_history(self, websocket: WebSocket, chat_state: SupabaseChatState) -> None:
        if not chat_state.history:
            return
        for record in chat_state.history:
            role = MessageRole(record.get("role", "user"))
            content = record.get("content", "")
            await self._send_json(
                websocket,
                create_text_message(
                    role=role,
                    content=content,
                    from_="server",
                    to="client",
                ).to_dict(),
            )

    async def _handle_command(
        self,
        websocket: WebSocket,
        message: ProtocolMessage,
        chat_state: SupabaseChatState,
    ) -> None:
        command = message.payload.command
        if not command:
            return

        response_text = None
        if command.command == CommandType.SET and isinstance(command.arguments, SetCommandArgument):
            arg = command.arguments
            if arg.key in {SetCommandArgumentType.DATABASE, SetCommandArgumentType.DATABASE_UPPER}:
                chat_state.database_url = arg.value
                response_text = f"Database context set to {arg.value}"
            elif arg.key in {
                SetCommandArgumentType.DATABASE_URL,
                SetCommandArgumentType.DATABASE_URL_UPPER,
            }:
                chat_state.database_url = arg.value
                response_text = "Database URL updated."
            elif arg.key == SetCommandArgumentType.ROLE:
                if chat_state.deployment_info is None:
                    chat_state.deployment_info = {}
                chat_state.deployment_info["role"] = arg.value
                response_text = f"Role context set to {arg.value}"

        if response_text:
            await self._send_json(
                websocket,
                create_text_message(
                    role=MessageRole.SYSTEM,
                    content=response_text,
                    from_="server",
                    to="client",
                ).to_dict(),
            )

    async def _broadcast(
        self,
        *,
        session_key: str,
        chat_id: str,
        message: Dict[str, Any],
        exclude: Optional[Set[WebSocket]] = None,
    ) -> None:
        key = self._chat_key(session_key, chat_id)
        if key not in self._connections:
            return
        send_tasks = []
        for connection in list(self._connections[key]):
            if exclude and connection.websocket in exclude:
                continue
            send_tasks.append(self._send_json(connection.websocket, message))
        if send_tasks:
            await asyncio.gather(*send_tasks, return_exceptions=True)

    async def _send_json(self, websocket: WebSocket, message: Dict[str, Any]) -> None:
        try:
            await websocket.send_json(message)
        except RuntimeError:
            pass

    async def _stop_heartbeat(self, connection: ChatConnection) -> None:
        if connection.heartbeat_task:
            connection.heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await connection.heartbeat_task
            connection.heartbeat_task = None

    async def _heartbeat(self, connection: ChatConnection) -> None:
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL.total_seconds())
                heartbeat_message = ProtocolMessage.create(
                    kind=MessageKind.HEARTBEAT,
                    payload=ProtocolPayload(heartbeat=Heartbeat()),
                    from_="server",
                    to="client",
                ).to_dict()
                await self._send_json(connection.websocket, heartbeat_message)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("Heartbeat send failed: %s", exc)

    @staticmethod
    def _chat_key(session_key: str, chat_id: str) -> str:
        return f"{session_key}:{chat_id}"


def register_websocket_routes(app: FastAPI, agent: Any, session_manager: SupabaseSessionManager) -> None:
    router = APIRouter()
    manager = WebsocketAgentManager(agent, session_manager)

    @router.websocket("/ws/agent/{project_id}/{chat_id}")
    async def websocket_endpoint(
        websocket: WebSocket,
        project_id: str,
        chat_id: str,
    ):
        authorization = websocket.headers.get("authorization")
        refresh_token = websocket.headers.get("x-refresh-token")
        if not authorization or not authorization.lower().startswith("bearer "):
            await websocket.close(code=4401)
            return
        access_token = authorization.split(" ", 1)[1].strip()

        try:
            session = session_manager.get_session(access_token, refresh_token)
            chat_state = session_manager.get_chat_state(session, project_id, chat_id)
            session_manager.ensure_history_loaded(chat_state)
            await manager.connect(
                websocket,
                project_id=project_id,
                chat_id=chat_state.chat_id,
                session=session,
                chat_state=chat_state,
            )
        except Exception:
            logger.exception("Failed to initialize websocket session")
            await websocket.close(code=4401)
            return

        try:
            while True:
                data = await websocket.receive_json()
                try:
                    protocol_message = ProtocolMessage.model_validate(data)
                except Exception:
                    await manager._send_json(
                        websocket,
                        create_error_message(
                            error_code="invalid_message",
                            message="Unable to parse protocol message.",
                        ).to_dict(),
                    )
                    continue
                await manager.handle_message(
                    websocket,
                    message=protocol_message,
                    session=session,
                    chat_state=chat_state,
                    access_token=access_token,
                    refresh_token=refresh_token,
                )
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(websocket, session_key=session.key, chat_id=chat_state.chat_id)

    app.include_router(router)

