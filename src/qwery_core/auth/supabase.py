from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable, Iterable, Optional, Sequence

from supabase import Client, create_client  # type: ignore[import-not-found]

from ..core import RequestContext, User, UserResolver


__all__ = [
    "SupabaseAuthError",
    "SupabaseSession",
    "SupabaseUserResolver",
    "build_supabase_client",
    "get_supabase_admin_client",
]


class SupabaseAuthError(Exception):
    """Raised when Supabase authentication fails."""


@dataclass(slots=True)
class SupabaseSession:
    """Minimal subset of a Supabase session."""

    access_token: str
    refresh_token: Optional[str]


@dataclass(slots=True)
class _SupabaseConfig:
    url: str
    anon_key: str
    service_role_key: Optional[str]


def _load_config() -> _SupabaseConfig:
    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not anon_key:
        raise SupabaseAuthError("SUPABASE_URL and SUPABASE_ANON_KEY must be configured")

    return _SupabaseConfig(url=url, anon_key=anon_key, service_role_key=service_key)


@lru_cache(maxsize=1)
def _cached_config() -> _SupabaseConfig:
    return _load_config()


def build_supabase_client() -> Client:
    """Create a Supabase client using configured anonymous credentials."""

    config = _cached_config()
    return create_client(config.url, config.anon_key)


def get_supabase_admin_client() -> Client:
    """Create a Supabase client using service role credentials."""

    config = _cached_config()
    if not config.service_role_key:
        raise SupabaseAuthError("SUPABASE_SERVICE_ROLE_KEY must be set for admin access")

    return create_client(config.url, config.service_role_key)


def _normalize_groups(raw_groups: object, fallback: Sequence[str]) -> list[str]:
    if raw_groups is None:
        return list(fallback)

    if isinstance(raw_groups, str):
        return [raw_groups]

    if isinstance(raw_groups, Iterable):
        groups: list[str] = []
        for value in raw_groups:
            if not value:
                continue
            groups.append(str(value))
        return groups or list(fallback)

    return list(fallback)


def _extract_metadata_groups(metadata: dict[str, object], group_claim: str, fallback: Sequence[str]) -> list[str]:
    if not metadata:
        return list(fallback)

    candidates = (
        metadata.get(group_claim)
        or metadata.get("groups")
        or metadata.get("roles")
        or metadata.get("permissions")
    )

    return _normalize_groups(candidates, fallback)


def _strip_bearer(token: str) -> str:
    prefix = "bearer "
    if token.lower().startswith(prefix):
        return token[len(prefix) :]
    return token


def _getattr_or_key(obj: object, name: str, default: object | None = None) -> object | None:
    if hasattr(obj, name):
        return getattr(obj, name)
    if isinstance(obj, dict):
        return obj.get(name, default)
    return default


class SupabaseUserResolver(UserResolver):
    """Resolve users via Supabase tokens provided in request context."""

    def __init__(
        self,
        client_factory: Callable[[], Client] = build_supabase_client,
        group_claim: str | None = None,
        default_groups: Optional[Sequence[str]] = None,
    ) -> None:
        self._config = _cached_config()
        self._client_factory = client_factory
        self._group_claim = group_claim or os.getenv("QWERY_SUPABASE_GROUP_CLAIM", "roles")
        default_groups_env = os.getenv("QWERY_DEFAULT_GROUPS", "read_data")
        self._default_groups = list(default_groups) if default_groups is not None else [
            g.strip() for g in default_groups_env.split(",") if g.strip()
        ]

    async def resolve_user(self, request_context: RequestContext) -> User:
        access_token = (
            request_context.get_header("authorization")
            or request_context.get_cookie("sb-access-token")
        )
        if not access_token:
            raise SupabaseAuthError("Missing Supabase access token")

        refresh_token = (
            request_context.get_header("x-refresh-token")
            or request_context.get_cookie("sb-refresh-token")
        )

        access_token = _strip_bearer(access_token)

        client = self._client_factory()
        try:
            client.auth.set_session(access_token, refresh_token)
            user_response = client.auth.get_user()
        except Exception as exc:  # pragma: no cover - supabase raises runtime errors
            raise SupabaseAuthError(f"Failed to resolve Supabase user: {exc}") from exc

        supabase_user = _getattr_or_key(user_response, "user")
        if not supabase_user:
            raise SupabaseAuthError("Supabase session user not found")

        user_id = _getattr_or_key(supabase_user, "id")
        if not user_id:
            raise SupabaseAuthError("Supabase user is missing an id")

        metadata = _getattr_or_key(supabase_user, "user_metadata", {}) or {}
        if not isinstance(metadata, dict):
            metadata = {}

        groups = _extract_metadata_groups(metadata, self._group_claim, self._default_groups)

        return User(id=str(user_id), group_memberships=groups)


