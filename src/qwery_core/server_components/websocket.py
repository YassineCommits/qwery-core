from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time
from collections import OrderedDict
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
from ..toon import encode_query_results


logger = logging.getLogger(__name__)

INACTIVITY_TIMEOUT = timedelta(hours=1)
HEARTBEAT_INTERVAL = timedelta(seconds=45)

# Scalability limits
MAX_CONNECTIONS_PER_CHAT = int(os.environ.get("QWERY_MAX_CONNECTIONS_PER_CHAT", "10"))
MAX_CHAT_HISTORY_LENGTH = int(os.environ.get("QWERY_MAX_CHAT_HISTORY", "100"))
MAX_CHAT_STATES = int(os.environ.get("QWERY_MAX_CHAT_STATES", "10000"))
CLEANUP_INTERVAL = timedelta(minutes=5)


@dataclass
class ChatState:
    chat_id: str
    database_url: Optional[str] = None
    history: List[Dict[str, str]] = field(default_factory=list)
    last_accessed: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def add_to_history(self, role: str, content: str) -> None:
        """Add message to history with size limit."""
        self.history.append({"role": role, "content": content})
        # Trim history if too long
        if len(self.history) > MAX_CHAT_HISTORY_LENGTH:
            # Keep system message if present, then keep most recent messages
            system_msgs = [msg for msg in self.history if msg.get("role") == "system"]
            other_msgs = [msg for msg in self.history if msg.get("role") != "system"]
            # Keep last N messages (excluding system)
            keep_count = MAX_CHAT_HISTORY_LENGTH - len(system_msgs)
            self.history = system_msgs + other_msgs[-keep_count:]
        
        self.last_accessed = datetime.now(timezone.utc)


@dataclass
class ChatConnection:
    websocket: WebSocket
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    heartbeat_task: Optional[asyncio.Task] = None


class WebsocketAgentManager:
    def __init__(self, agent: Any):
        self.agent = agent
        # Use OrderedDict for LRU eviction
        self._connections: Dict[str, List[ChatConnection]] = {}
        self._chat_states: OrderedDict[str, ChatState] = OrderedDict()
        self._last_activity: Dict[str, datetime] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None
        self._cleanup_started = False

    async def connect(
        self,
        websocket: WebSocket,
        *,
        project_id: str,
        chat_id: str,
    ) -> None:
        # Start cleanup task on first connection (when event loop is running)
        if not self._cleanup_started:
            self._start_cleanup_task()
        
        start_time = time.time()
        logger.info(f"[WS_CONNECT_START] project_id={project_id}, chat_id={chat_id}, timestamp={start_time}")
        
        connect_start = time.time()
        await websocket.accept()
        logger.info(f"[WS_CONNECT_ACCEPT] took={time.time() - connect_start:.4f}s")

        key = self._chat_key(project_id, chat_id)
        if key not in self._chat_states:
            # Evict oldest state if at limit
            if len(self._chat_states) >= MAX_CHAT_STATES:
                oldest_key = next(iter(self._chat_states))
                logger.info(f"[WS_STATE_EVICT] evicting oldest key={oldest_key}")
                self._chat_states.pop(oldest_key, None)
                self._last_activity.pop(oldest_key, None)
            
            self._chat_states[key] = ChatState(chat_id=chat_id)
            logger.info(f"[WS_STATE_CREATED] key={key}, total_states={len(self._chat_states)}")
        
        # Move to end (LRU)
        self._chat_states.move_to_end(key)

        # Check connection limit per chat
        existing_connections = len(self._connections.get(key, []))
        if existing_connections >= MAX_CONNECTIONS_PER_CHAT:
            logger.warning(f"[WS_CONNECTION_LIMIT] key={key}, limit={MAX_CONNECTIONS_PER_CHAT}, rejecting")
            await websocket.close(code=1008, reason="Connection limit exceeded")
            return
        
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
        
        # Build human-readable answer (just the summary, no SQL/details)
        answer_lines: List[str] = []
        summary_text = (response.get("summary") or "").strip()
        if summary_text:
            # Extract the first sentence/line that describes what was done
            # Skip lines that contain "SQL:", "Preview:", "Results saved", etc.
            summary_lines = summary_text.split("\n")
            for line in summary_lines:
                line = line.strip()
                if line and not any(skip in line for skip in ["SQL:", "Preview:", "Results saved", "Query executed"]):
                    answer_lines.append(line)
                    break  # Take first meaningful line
        else:
            answer_lines.append("Query executed successfully.")

        # Build TOON format with query and results
        sql_text = response.get("sql", "")
        columns = response.get("columns") or []
        preview_rows = response.get("preview_rows") or []
        
        toon_lines: List[str] = []
        if sql_text:
            toon_content = encode_query_results(sql_text, columns, preview_rows)
            toon_lines.append("```toon")
            toon_lines.append(toon_content)
            toon_lines.append("```")
        
        # Combine: human answer first, then TOON data
        final_content_parts: List[str] = []
        final_content_parts.append("\n".join(answer_lines))
        
        if toon_lines:
            final_content_parts.append("")  # Empty line separator
            final_content_parts.append("\n".join(toon_lines))

        assistant_message = create_text_message(
            role=MessageRole.ASSISTANT,
            content="\n".join(final_content_parts),
            from_="server",
            to="client",
        )
        logger.info(f"[WS_FORMAT_RESPONSE_DONE] took={time.time() - format_start:.4f}s")

        # Store messages in history (with automatic trimming)
        history_start = time.time()
        chat_state.add_to_history("user", content.content)
        chat_state.add_to_history("assistant", assistant_message.payload.message.content)
        logger.info(f"[WS_HISTORY_UPDATED] took={time.time() - history_start:.4f}s, new_history_length={len(chat_state.history)}")

        broadcast_start = time.time()
        await self._broadcast(
            project_id=project_id,
            chat_id=chat_id,
            message=assistant_message.to_dict(),
        )
        logger.info(f"[WS_BROADCAST_DONE] took={time.time() - broadcast_start:.4f}s, total_msg_time={time.time() - msg_start_time:.4f}s")

    def _start_cleanup_task(self) -> None:
        """Start background cleanup task (call this when event loop is running)."""
        if self._cleanup_started:
            return
        
        async def cleanup_loop() -> None:
            while True:
                try:
                    await asyncio.sleep(CLEANUP_INTERVAL.total_seconds())
                    await self.cleanup()
                except asyncio.CancelledError:
                    break
                except Exception as exc:
                    logger.error(f"[WS_CLEANUP_ERROR] {exc}")
        
        try:
            loop = asyncio.get_running_loop()
            self._cleanup_task = loop.create_task(cleanup_loop())
            self._cleanup_started = True
            logger.info("[WS_CLEANUP_STARTED] background cleanup task started")
        except RuntimeError:
            # No event loop running yet, will start on first connection
            logger.debug("[WS_CLEANUP_DEFERRED] will start cleanup task when event loop is available")

    async def cleanup(self) -> None:
        """Clean up expired connections and states."""
        now = datetime.now(timezone.utc)
        expired = [
            key
            for key, last_active in self._last_activity.items()
            if now - last_active > INACTIVITY_TIMEOUT
        ]
        
        cleaned = 0
        for key in expired:
            connections = self._connections.get(key, [])
            for connection in list(connections):
                await self._stop_heartbeat(connection)
                with contextlib.suppress(Exception):
                    await connection.websocket.close(code=1001)
            self._connections.pop(key, None)
            self._last_activity.pop(key, None)
            self._chat_states.pop(key, None)
            cleaned += 1
        
        if cleaned > 0:
            logger.info(f"[WS_CLEANUP] cleaned {cleaned} expired chats")
        
        # Also evict oldest states if we're over limit
        while len(self._chat_states) > MAX_CHAT_STATES:
            oldest_key = next(iter(self._chat_states))
            # Only evict if not recently active
            if oldest_key in self._last_activity:
                last_active = self._last_activity[oldest_key]
                if now - last_active > INACTIVITY_TIMEOUT:
                    logger.info(f"[WS_CLEANUP_EVICT] evicting inactive key={oldest_key}")
                    self._chat_states.pop(oldest_key, None)
                    self._last_activity.pop(oldest_key, None)
                else:
                    break  # All remaining are active
            else:
                self._chat_states.pop(oldest_key, None)

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
