from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect

from ...application.services import handle_prompt
from ...domain.entities import RequestContext
from ...domain.protocols import (
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


logger = logging.getLogger(__name__)

INACTIVITY_TIMEOUT = timedelta(hours=1)
HEARTBEAT_INTERVAL = timedelta(seconds=45)


@dataclass
class ChatState:
    chat_id: str
    database_url: Optional[str] = None
    history: List[Dict[str, str]] = field(default_factory=list)


@dataclass
class ChatConnection:
    websocket: WebSocket
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    heartbeat_task: Optional[asyncio.Task] = None


class WebsocketAgentManager:
    def __init__(self, agent: Any):
        self.agent = agent
        self._connections: Dict[str, List[ChatConnection]] = {}
        self._chat_states: Dict[str, ChatState] = {}
        self._last_activity: Dict[str, datetime] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        *,
        project_id: str,
        chat_id: str,
    ) -> None:
        await websocket.accept()

        key = self._chat_key(project_id, chat_id)
        if key not in self._chat_states:
            self._chat_states[key] = ChatState(chat_id=chat_id)

        connection = ChatConnection(websocket=websocket)
        connection.heartbeat_task = asyncio.create_task(self._heartbeat(connection))
        self._connections.setdefault(key, []).append(connection)
        self._last_activity[key] = datetime.now(timezone.utc)

        chat_state = self._chat_states[key]

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

    async def disconnect(self, websocket: WebSocket, *, project_id: str, chat_id: str) -> None:
        key = self._chat_key(project_id, chat_id)
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
        project_id: str,
        chat_id: str,
    ) -> None:
        key = self._chat_key(project_id, chat_id)
        self._last_activity[key] = datetime.now(timezone.utc)

        if key not in self._chat_states:
            self._chat_states[key] = ChatState(chat_id=chat_id)

        chat_state = self._chat_states[key]

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
                database_url=chat_state.database_url,
                chat_history=chat_state.history,
            )
        except Exception as exc:
            logger.exception("Error while handling agent message")
            error_payload = create_error_message(
                error_code="agent_error",
                message=str(exc),
            ).to_dict()
            await self._send_json(websocket, error_payload)
            await self._broadcast(
                project_id=project_id,
                chat_id=chat_id,
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

        # Store messages in history
        chat_state.history.append({"role": "user", "content": content.content})
        chat_state.history.append({"role": "assistant", "content": assistant_message.payload.message.content})

        await self._broadcast(
            project_id=project_id,
            chat_id=chat_id,
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
            self._chat_states.pop(key, None)

    async def _send_history(self, websocket: WebSocket, chat_state: ChatState) -> None:
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
        chat_state: ChatState,
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
        project_id: str,
        chat_id: str,
        message: Dict[str, Any],
        exclude: Optional[Set[WebSocket]] = None,
    ) -> None:
        key = self._chat_key(project_id, chat_id)
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
    def _chat_key(project_id: str, chat_id: str) -> str:
        return f"{project_id}:{chat_id}"


def register_websocket_routes(app: FastAPI, agent: Any) -> None:
    router = APIRouter()
    manager = WebsocketAgentManager(agent)

    @router.websocket("/ws/agent/{project_id}/{chat_id}")
    async def websocket_endpoint(
        websocket: WebSocket,
        project_id: str,
        chat_id: str,
    ):
        try:
            await manager.connect(
                websocket,
                project_id=project_id,
                chat_id=chat_id,
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
                    project_id=project_id,
                    chat_id=chat_id,
                )
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(websocket, project_id=project_id, chat_id=chat_id)

    app.include_router(router)
