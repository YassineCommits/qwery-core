"""Authentication helpers for qwery-core."""

from .supabase import (
    SupabaseAuthError,
    SupabaseSession,
    SupabaseUserResolver,
    build_supabase_client,
    get_supabase_admin_client,
)

__all__ = [
    "SupabaseAuthError",
    "SupabaseSession",
    "SupabaseUserResolver",
    "build_supabase_client",
    "get_supabase_admin_client",
]


