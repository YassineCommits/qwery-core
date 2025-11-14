"""Rate limiting middleware for FastAPI."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiting middleware."""
    
    def __init__(
        self,
        app: Callable,
        requests_per_minute: int = 60,
        requests_per_hour: int = 1000,
    ) -> None:
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self._minute_requests: dict[str, list[float]] = defaultdict(list)
        self._hour_requests: dict[str, list[float]] = defaultdict(list)
        self._cleanup_interval = 300  # Clean up every 5 minutes
        self._last_cleanup = time.time()
    
    def _get_client_id(self, request: Request) -> str:
        """Get client identifier for rate limiting."""
        # Use IP address or user ID from headers
        client_ip = request.client.host if request.client else "unknown"
        user_id = request.headers.get("x-user-id") or request.cookies.get("user_id")
        return f"{client_ip}:{user_id}" if user_id else client_ip
    
    def _cleanup_old_requests(self) -> None:
        """Remove old request timestamps."""
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return
        
        minute_ago = now - 60
        hour_ago = now - 3600
        
        # Clean minute window
        for client_id in list(self._minute_requests.keys()):
            self._minute_requests[client_id] = [
                ts for ts in self._minute_requests[client_id] if ts > minute_ago
            ]
            if not self._minute_requests[client_id]:
                del self._minute_requests[client_id]
        
        # Clean hour window
        for client_id in list(self._hour_requests.keys()):
            self._hour_requests[client_id] = [
                ts for ts in self._hour_requests[client_id] if ts > hour_ago
            ]
            if not self._hour_requests[client_id]:
                del self._hour_requests[client_id]
        
        self._last_cleanup = now
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Check rate limits before processing request."""
        # Skip rate limiting for health checks
        if request.url.path == "/health":
            return await call_next(request)
        
        self._cleanup_old_requests()
        
        client_id = self._get_client_id(request)
        now = time.time()
        
        # Check minute limit
        minute_requests = self._minute_requests[client_id]
        minute_requests = [ts for ts in minute_requests if ts > now - 60]
        if len(minute_requests) >= self.requests_per_minute:
            return Response(
                content="Rate limit exceeded: too many requests per minute",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": "60"},
            )
        
        # Check hour limit
        hour_requests = self._hour_requests[client_id]
        hour_requests = [ts for ts in hour_requests if ts > now - 3600]
        if len(hour_requests) >= self.requests_per_hour:
            return Response(
                content="Rate limit exceeded: too many requests per hour",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": "3600"},
            )
        
        # Record request
        minute_requests.append(now)
        hour_requests.append(now)
        self._minute_requests[client_id] = minute_requests
        self._hour_requests[client_id] = hour_requests
        
        # Process request
        response = await call_next(request)
        return response

