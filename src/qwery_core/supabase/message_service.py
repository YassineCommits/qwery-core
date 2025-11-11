from __future__ import annotations

import datetime
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from supabase import Client
import logging
from postgrest.exceptions import APIError


__all__ = ["SupabaseMessageService", "SupabaseMessage", "SupabaseMessagePart"]


def _string_to_uuid(string_id: str) -> str:
    """Convert a deterministic string identifier into a UUID."""
    try:
        UUID(string_id)
        return string_id
    except ValueError:
        hash_bytes = hashlib.sha256(string_id.encode("utf-8")).digest()
        uuid_bytes = bytearray(hash_bytes[:16])
        uuid_bytes[6] = (uuid_bytes[6] & 0x0F) | 0x40
        uuid_bytes[8] = (uuid_bytes[8] & 0x3F) | 0x80
        return str(UUID(bytes=bytes(uuid_bytes)))


@dataclass(slots=True)
class SupabaseMessagePart:
    id: str
    type: str
    text_content: Optional[str] = None
    tool_name: Optional[str] = None
    tool_input: Optional[str] = None
    tool_output: Optional[str] = None


@dataclass(slots=True)
class SupabaseMessage:
    id: str
    role: str
    parts: List[SupabaseMessagePart]
    created_at: str


class SupabaseMessageService:
    """Utility for persisting and retrieving chat messages via Supabase."""

    def __init__(self, client: Client) -> None:
        self.client = client
        self._logger = logging.getLogger(__name__)

    # ------------------------------------------------------------------
    # Chat helpers
    # ------------------------------------------------------------------

    def normalize_chat_id(self, chat_id: str) -> str:
        return _string_to_uuid(chat_id)

    def ensure_chat_exists(
        self,
        *,
        chat_id: str,
        project_id: str,
        user_id: str,
        chat_name: Optional[str] = None,
        source: str = "agent",
    ) -> str:
        """Ensure a gp_chats row exists and return the normalized chat UUID."""

        normalized_chat_id = self.normalize_chat_id(chat_id)
        normalized_project_id = self.normalize_chat_id(project_id)

        response = (
            self.client.schema("guepard")
            .table("gp_chats")
            .select("id")
            .eq("id", normalized_chat_id)
            .execute()
        )
        if response.data:
            return normalized_chat_id

        self._ensure_deployment_exists(normalized_project_id, project_id, user_id)

        now = datetime.datetime.now(datetime.UTC).isoformat()
        chat_payload = {
            "id": normalized_chat_id,
            "name": chat_name or f"Chat {now}",
            "deployment_id": normalized_project_id,
            "user_id": user_id,
            "source": source,
            "is_public": False,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id,
            "updated_by": user_id,
        }
        try:
            insert_response = (
                self.client.schema("guepard")
                .table("gp_chats")
                .insert(chat_payload)
                .execute()
            )
        except APIError as exc:
            if exc.code == "23503":  # foreign key violation
                raise RuntimeError(
                    "Supabase deployment not found. Ensure the project/deployment id exists."
                ) from exc
            raise
        if not insert_response.data:
            raise RuntimeError("Failed to create chat in Supabase")
        return normalized_chat_id

    def _ensure_deployment_exists(self, deployment_id: str, name: str, user_id: str) -> None:
        response = (
            self.client.schema("guepard")
            .table("gp_deployment_request")
            .select("id")
            .eq("id", deployment_id)
            .execute()
        )
        if response.data:
            return

        now = datetime.datetime.now(datetime.UTC).isoformat()
        deployment_payload = {
            "id": deployment_id,
            "name": name,
            "repository_name": name,
            "deployment_type": "REPOSITORY",
            "status": "INIT",
            "customer_id": user_id,
            "fqdn": f"{name}.example.supabase",
            "created_by": user_id,
            "database_provider": "postgresql",
            "database_version": "15",
            "created_at": now,
            "updated_at": now,
        }
        try:
            insert_response = (
                self.client.schema("guepard")
                .table("gp_deployment_request")
                .insert(deployment_payload)
                .execute()
            )
            if not insert_response.data:
                self._logger.warning("Supabase deployment insert returned no data for %s", deployment_id)
        except APIError as exc:  # pragma: no cover - depends on remote schema
            self._logger.warning("Could not create deployment record (%s): %s", deployment_id, exc)

    # ------------------------------------------------------------------
    # Message persistence
    # ------------------------------------------------------------------

    def save_message(self, *, chat_id: str, user_id: str, role: str, content: str) -> str:
        """Persist a single text message and return the message id."""

        normalized_chat_id = self.normalize_chat_id(chat_id)
        message_id = str(uuid4())
        now = datetime.datetime.now(datetime.UTC).isoformat()

        message_payload = {
            "id": message_id,
            "chat_id": normalized_chat_id,
            "user_id": user_id,
            "role": role,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id,
            "updated_by": user_id,
        }
        insert_response = (
            self.client.schema("guepard")
            .table("gp_messages")
            .insert(message_payload)
            .execute()
        )
        if not insert_response.data:
            raise RuntimeError("Failed to insert message into gp_messages")

        part_payload = {
            "id": str(uuid4()),
            "message_id": message_id,
            "user_id": user_id,
            "order": 0,
            "type": "text",
            "text_content": content,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id,
            "updated_by": user_id,
        }
        part_response = (
            self.client.schema("guepard")
            .table("gp_message_parts")
            .insert(part_payload)
            .execute()
        )
        if not part_response.data:
            raise RuntimeError("Failed to insert message part into gp_message_parts")

        return message_id

    def get_chat_history(self, *, chat_id: str, limit: int = 50) -> List[SupabaseMessage]:
        normalized_chat_id = self.normalize_chat_id(chat_id)
        response = (
            self.client.schema("guepard")
            .table("gp_messages")
            .select("*, gp_message_parts(*)")
            .eq("chat_id", normalized_chat_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        records: List[SupabaseMessage] = []
        for row in response.data or []:
            parts: List[SupabaseMessagePart] = []
            for part in row.get("gp_message_parts", []) or []:
                parts.append(
                    SupabaseMessagePart(
                        id=part.get("id", ""),
                        type=part.get("type", "text"),
                        text_content=part.get("text_content"),
                        tool_name=part.get("tool_name"),
                        tool_input=self._serialize_json(part.get("tool_input")),
                        tool_output=self._serialize_json(part.get("tool_output")),
                    )
                )
            records.append(
                SupabaseMessage(
                    id=row.get("id", ""),
                    role=row.get("role", "user"),
                    parts=parts,
                    created_at=row.get("created_at", ""),
                )
            )
        return records

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _serialize_json(value: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            return value
        try:
            return json.dumps(value)
        except TypeError:
            return str(value)


