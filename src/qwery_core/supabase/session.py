from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from supabase import Client

from ..auth import SupabaseAuthError, build_supabase_client, get_supabase_admin_client
from ..core import RequestContext
from .message_service import SupabaseMessage, SupabaseMessageService


@dataclass(slots=True)
class ManagedSupabaseSession:
    key: str
    client: Client
    user_id: str
    access_token: str
    refresh_token: Optional[str]


@dataclass(slots=True)
class SupabaseChatState:
    session_key: str
    chat_id: str
    project_id: str
    database_url: Optional[str]
    deployment_info: Optional[Dict[str, Any]]
    history: List[Dict[str, str]] = field(default_factory=list)
    history_loaded: bool = False


class SupabaseSessionManager:
    """Manage Supabase sessions, chat context, and history across tenants."""

    def __init__(
        self,
        client_factory=build_supabase_client,
        admin_client_factory=get_supabase_admin_client,
    ) -> None:
        self._client_factory = client_factory
        self._admin_client_factory = admin_client_factory
        self._sessions: Dict[str, SupabaseSession] = {}
        self._chat_states: Dict[Tuple[str, str], SupabaseChatState] = {}
        self._admin_client: Optional[Client] = None
        self._message_service: Optional[SupabaseMessageService] = None

    # ------------------------------------------------------------------
    # Session handling
    # ------------------------------------------------------------------

    def get_session(self, access_token: str, refresh_token: Optional[str]) -> ManagedSupabaseSession:
        if not access_token:
            raise SupabaseAuthError("Supabase access token is required")

        session_key = access_token
        if session_key in self._sessions:
            return self._sessions[session_key]

        client = self._client_factory()
        client.auth.set_session(access_token, refresh_token)
        user_response = client.auth.get_user()
        user = getattr(user_response, "user", None) or user_response.get("user")
        if not user:
            raise SupabaseAuthError("Supabase user information not available")
        user_id = getattr(user, "id", None) or user.get("id")
        if not user_id:
            raise SupabaseAuthError("Supabase user id missing")

        session = ManagedSupabaseSession(
            key=session_key,
            client=client,
            user_id=str(user_id),
            access_token=access_token,
            refresh_token=refresh_token,
        )
        self._sessions[session_key] = session
        return session

    # ------------------------------------------------------------------
    # Chat context
    # ------------------------------------------------------------------

    def get_chat_state(
        self,
        session: ManagedSupabaseSession,
        project_id: str,
        chat_id: str,
    ) -> SupabaseChatState:
        normalized_project_id = self._message_service_instance().normalize_chat_id(project_id)
        normalized_chat_id = self._message_service_instance().normalize_chat_id(chat_id)

        key = (session.key, normalized_chat_id)
        if key in self._chat_states:
            return self._chat_states[key]

        chat_state = SupabaseChatState(
            session_key=session.key,
            chat_id=normalized_chat_id,
            project_id=normalized_project_id,
            database_url=None,
            deployment_info=None,
        )
        self._load_chat_context(session, chat_state)
        self._chat_states[key] = chat_state
        return chat_state

    def ensure_history_loaded(self, chat_state: SupabaseChatState) -> None:
        if chat_state.history_loaded:
            return
        messages = self._message_service_instance().get_chat_history(chat_id=chat_state.chat_id, limit=50)
        history: List[Dict[str, str]] = []
        for message in messages:
            text_segments = [
                part.text_content for part in message.parts if part.type == "text" and part.text_content
            ]
            if not text_segments:
                continue
            content = "\n".join(text_segments)
            role = "assistant" if message.role == "assistant" else "user"
            history.append({"role": role, "content": content})
        chat_state.history = history
        chat_state.history_loaded = True

    def record_message(
        self,
        session: ManagedSupabaseSession,
        chat_state: SupabaseChatState,
        *,
        role: str,
        content: str,
    ) -> None:
        self._message_service_instance().save_message(
            chat_id=chat_state.chat_id,
            user_id=session.user_id,
            role=role,
            content=content,
        )
        chat_state.history.append({"role": role, "content": content})

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_chat_context(self, session: SupabaseSession, chat_state: SupabaseChatState) -> None:
        message_service = self._message_service_instance()
        chat_state.chat_id = message_service.ensure_chat_exists(
            chat_id=chat_state.chat_id,
            project_id=chat_state.project_id,
            user_id=session.user_id,
        )

        admin_client = self._admin_client_instance()

        chat_response = (
            admin_client.schema("guepard")
            .table("gp_chats")
            .select("*")
            .eq("id", chat_state.chat_id)
            .execute()
        )
        chat_data = (chat_response.data or [{}])[0]

        deployment_id = (
            chat_data.get("deployment_id")
            or chat_data.get("project_id")
            or chat_state.project_id
        )
        deployment_info = None
        database_url = None
        if deployment_id:
            deployment_response = (
                admin_client.schema("guepard")
                .table("gp_deployment_request")
                .select("*")
                .eq("id", deployment_id)
                .execute()
            )
            if deployment_response.data:
                deployment_info = deployment_response.data[0]
                database_url = self._determine_database_url(deployment_info)

        if not database_url:
            database_url = os.environ.get("QWERY_DB_URL") or os.environ.get("QWERY_DB_PATH")

        chat_state.database_url = database_url
        chat_state.deployment_info = deployment_info

    @staticmethod
    def _determine_database_url(deployment_info: Optional[Dict[str, Any]]) -> Optional[str]:
        if not deployment_info:
            return None
        for key in ("connection_string", "database_url", "fqdn"):
            candidate = deployment_info.get(key)
            if candidate:
                return candidate
        return None

    def _admin_client_instance(self) -> Client:
        if self._admin_client is None:
            self._admin_client = self._admin_client_factory()
        return self._admin_client

    def _message_service_instance(self) -> SupabaseMessageService:
        if self._message_service is None:
            self._message_service = SupabaseMessageService(self._admin_client_instance())
        return self._message_service


