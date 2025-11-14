from __future__ import annotations

import asyncio
import contextlib
import logging
import time
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
        start_time = time.time()
        logger.info(f"[WS_CONNECT_START] project_id={project_id}, chat_id={chat_id}, timestamp={start_time}")
        
        connect_start = time.time()
        await websocket.accept()
        logger.info(f"[WS_CONNECT_ACCEPT] took={time.time() - connect_start:.4f}s")

        key = self._chat_key(project_id, chat_id)
        if key not in self._chat_states:
            self._chat_states[key] = ChatState(chat_id=chat_id)
            logger.info(f"[WS_STATE_CREATED] key={key}")

        connection = ChatConnection(websocket=websocket)
        connection.heartbeat_task = asyncio.create_task(self._heartbeat(connection))
        self._connections.setdefault(key, []).append(connection)
        self._last_activity[key] = datetime.now(timezone.utc)
        logger.info(f"[WS_CONNECTION_ADDED] key={key}, total_connections={len(self._connections.get(key, []))}")

        chat_state = self._chat_states[key]

        handshake_start = time.time()
        await self._send_json(
            websocket,
            create_handshake_message(
                project_id=project_id,
                chat_id=chat_state.chat_id,
                from_="server",
                to="client",
            ).to_dict(),
        )
        logger.info(f"[WS_HANDSHAKE_SENT] took={time.time() - handshake_start:.4f}s")
        
        history_start = time.time()
        await self._send_history(websocket, chat_state)
        logger.info(f"[WS_HISTORY_SENT] took={time.time() - history_start:.4f}s, total_time={time.time() - start_time:.4f}s")

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
        msg_start_time = time.time()
        key = self._chat_key(project_id, chat_id)
        self._last_activity[key] = datetime.now(timezone.utc)

        logger.info(f"[WS_HANDLE_MSG_START] key={key}, kind={message.kind}, timestamp={msg_start_time}")

        if key not in self._chat_states:
            self._chat_states[key] = ChatState(chat_id=chat_id)
            logger.info(f"[WS_STATE_CREATED_IN_HANDLE] key={key}")

        chat_state = self._chat_states[key]

        payload_type = message.payload.get_payload_type()
        logger.info(f"[WS_PAYLOAD_TYPE] payload_type={payload_type}")

        if message.kind == MessageKind.HEARTBEAT or payload_type == "heartbeat":
            logger.info(f"[WS_HEARTBEAT] responding to heartbeat")
            await self._send_json(
                websocket,
                ProtocolMessage.create(
                    kind=MessageKind.HEARTBEAT,
                    payload=message.payload,
                    from_="server",
                    to="client",
                ).to_dict(),
            )
            logger.info(f"[WS_HEARTBEAT_DONE] took={time.time() - msg_start_time:.4f}s")
            return

        if message.kind == MessageKind.COMMAND and message.payload.command:
            logger.info(f"[WS_COMMAND] handling command")
            cmd_start = time.time()
            await self._handle_command(websocket, message, chat_state)
            logger.info(f"[WS_COMMAND_DONE] took={time.time() - cmd_start:.4f}s")
            return

        if not message.payload.message:
            logger.warning(f"[WS_INVALID_PAYLOAD] no message in payload")
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
            logger.info(f"[WS_NON_USER_MSG] role={content.role}, skipping")
            return

        logger.info(f"[WS_USER_MSG] content_length={len(content.content)}, history_length={len(chat_state.history)}")

        request_context = RequestContext(
            headers={k.lower(): v for k, v in websocket.headers.items()},
            cookies=dict(websocket.cookies) if websocket.cookies else {},
        )

        prompt_start = time.time()
        logger.info(f"[WS_HANDLE_PROMPT_START] timestamp={prompt_start}")
        try:
            response = await handle_prompt(
                self.agent,
                request_context,
                content.content,
                database_url=chat_state.database_url,
                chat_history=chat_state.history,
            )
            logger.info(f"[WS_HANDLE_PROMPT_DONE] took={time.time() - prompt_start:.4f}s")
        except Exception as exc:
            logger.exception(f"[WS_HANDLE_PROMPT_ERROR] took={time.time() - prompt_start:.4f}s, error={exc}")
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

        format_start = time.time()
        logger.info(f"[WS_FORMAT_RESPONSE_START] timestamp={format_start}")
        
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
        logger.info(f"[WS_FORMAT_RESPONSE_DONE] took={time.time() - format_start:.4f}s")

        # Store messages in history
        history_start = time.time()
        chat_state.history.append({"role": "user", "content": content.content})
        chat_state.history.append({"role": "assistant", "content": assistant_message.payload.message.content})
        logger.info(f"[WS_HISTORY_UPDATED] took={time.time() - history_start:.4f}s, new_history_length={len(chat_state.history)}")

        broadcast_start = time.time()
        await self._broadcast(
            project_id=project_id,
            chat_id=chat_id,
            message=assistant_message.to_dict(),
        )
        logger.info(f"[WS_BROADCAST_DONE] took={time.time() - broadcast_start:.4f}s, total_msg_time={time.time() - msg_start_time:.4f}s")

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
        endpoint_start = time.time()
        logger.info(f"[WS_ENDPOINT_START] project_id={project_id}, chat_id={chat_id}, timestamp={endpoint_start}")
        try:
            await manager.connect(
                websocket,
                project_id=project_id,
                chat_id=chat_id,
            )
        except Exception:
            logger.exception(f"[WS_ENDPOINT_CONNECT_ERROR] took={time.time() - endpoint_start:.4f}s")
            await websocket.close(code=4401)
            return

        try:
            while True:
                receive_start = time.time()
                logger.info(f"[WS_RECEIVE_START] waiting for message, timestamp={receive_start}")
                data = await websocket.receive_json()
                logger.info(f"[WS_RECEIVE_DONE] took={time.time() - receive_start:.4f}s, data_size={len(str(data))}")
                
                parse_start = time.time()
                try:
                    protocol_message = ProtocolMessage.model_validate(data)
                    logger.info(f"[WS_PARSE_DONE] took={time.time() - parse_start:.4f}s")
                except Exception as e:
                    logger.error(f"[WS_PARSE_ERROR] took={time.time() - parse_start:.4f}s, error={e}")
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
            logger.info(f"[WS_DISCONNECT] project_id={project_id}, chat_id={chat_id}")
            pass
        finally:
            disconnect_start = time.time()
            await manager.disconnect(websocket, project_id=project_id, chat_id=chat_id)
            logger.info(f"[WS_ENDPOINT_END] total_lifetime={time.time() - endpoint_start:.4f}s, disconnect_took={time.time() - disconnect_start:.4f}s")

    app.include_router(router)
