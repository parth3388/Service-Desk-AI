"""
Lightweight in-memory sliding-window rate limiter.

Scope: protects the sensitive *unauthenticated* endpoints (login, register,
forgot/resend, contact) from trivial brute force / email-bombing. State lives
in this process only, so it resets on restart and is not shared between
workers — that is acceptable for the single-worker local setup and needs no
extra infrastructure.

The client key is the direct peer address. X-Forwarded-For is deliberately
NOT trusted (it is client-controlled unless a trusted proxy sets it).
"""

import threading
import time
from collections import deque

from fastapi import HTTPException, Request

from app.core import config


_lock = threading.Lock()
_hits: dict[str, deque] = {}

_MAX_KEYS = 10000


def _parse_limit(spec: str) -> tuple[int, int]:
    count, window = spec.split("/")
    return int(count), int(window)


def reset() -> None:
    """Forget all recorded requests (used by tests)."""
    with _lock:
        _hits.clear()


def _purge_expired(now: float) -> None:
    for key in [
        k for k, dq in _hits.items()
        if not dq or dq[-1] <= now
    ]:
        _hits.pop(key, None)


def check(name: str, identity: str) -> None:
    """
    Record one hit for (limit name, identity) and raise 429 if the
    configured limit for `name` is exceeded within its window.
    """

    if not config.RATE_LIMIT_ENABLED:
        return

    limit, window = _parse_limit(config.RATE_LIMITS[name])

    now = time.monotonic()
    key = f"{name}:{identity}"

    with _lock:

        if len(_hits) > _MAX_KEYS:
            _purge_expired(now)

        dq = _hits.setdefault(key, deque())

        # Entries are stored as expiry times; drop the ones that have lapsed.
        while dq and dq[0] <= now:
            dq.popleft()

        if len(dq) >= limit:

            retry_after = max(1, int(dq[0] - now) + 1)

            raise HTTPException(
                status_code=429,
                detail=(
                    "Too many requests. "
                    f"Please try again in {retry_after} seconds."
                ),
                headers={"Retry-After": str(retry_after)},
            )

        dq.append(now + window)


def client_identity(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(name: str):
    """FastAPI dependency factory: `Depends(rate_limit("login"))`."""

    def dependency(request: Request) -> None:
        check(name, client_identity(request))

    return dependency
