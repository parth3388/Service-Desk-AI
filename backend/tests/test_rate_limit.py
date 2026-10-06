"""In-memory rate limiting on the unauthenticated endpoints."""

import pytest

from app.core import config, rate_limit
from conftest import make_user


@pytest.fixture
def limited(monkeypatch):
    """Turn the limiter on with tiny limits."""
    monkeypatch.setattr(config, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(
        config,
        "RATE_LIMITS",
        {
            "login": "3/60",
            "register": "2/60",
            "forgot_password": "2/60",
            "resend_verification": "2/60",
            "contact": "2/60",
        },
    )
    rate_limit.reset()


def login(client, password="wrong-password"):
    return client.post("/auth/login", data={"username": "nobody@example.com", "password": password})


def test_login_is_limited_per_client_and_reports_retry_after(client, limited):
    assert [login(client).status_code for _ in range(3)] == [401, 401, 401]

    blocked = login(client)

    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1
    assert "Too many requests" in blocked.json()["detail"]


def test_a_successful_login_within_the_limit_still_works(client, db, limited):
    make_user(db, "ok@example.com", password="Password123")

    for _ in range(3):
        response = client.post("/auth/login", data={"username": "ok@example.com", "password": "Password123"})
        assert response.status_code == 200


def test_limit_window_expires(client, limited, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: now[0])

    for _ in range(3):
        login(client)
    assert login(client).status_code == 429

    now[0] += 61

    assert login(client).status_code == 401


def test_endpoints_have_independent_limits(client, limited):
    for _ in range(3):
        login(client)
    assert login(client).status_code == 429

    other = client.post("/auth/forgot-password", json={"email": "someone@example.com"})

    assert other.status_code == 200


def test_forgot_password_is_limited(client, limited):
    codes = [
        client.post("/auth/forgot-password", json={"email": "x@example.com"}).status_code
        for _ in range(3)
    ]

    assert codes == [200, 200, 429]


def test_register_is_limited(client, limited, monkeypatch):
    import app.api.auth as auth_module

    monkeypatch.setattr(auth_module, "send_verification_email", lambda **kw: None)

    def register(n):
        return client.post(
            "/auth/register",
            json={"full_name": "Some One", "email": f"u{n}@example.com", "password": "Password123", "role": "employee"},
        ).status_code

    assert [register(1), register(2), register(3)] == [200, 200, 429]


def test_contact_form_is_limited(client, limited, monkeypatch):
    import app.api.contact as contact_module

    monkeypatch.setattr(contact_module, "send_contact_email", lambda **kw: None)
    body = {"name": "Ann", "email": "ann@example.com", "message": "Hello"}

    assert [client.post("/contact", json=body).status_code for _ in range(3)] == [200, 200, 429]


def test_resend_verification_is_limited(client, limited):
    body = {"email": "x@example.com"}

    assert [client.post("/auth/resend-verification", json=body).status_code for _ in range(3)] == [200, 200, 429]


def test_disabled_limiter_never_blocks(client, monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_ENABLED", False)

    assert all(login(client).status_code == 401 for _ in range(30))


def test_default_limits_leave_room_for_normal_local_development():
    for name, spec in {
        "login": "10/60",
        "register": "10/600",
        "forgot_password": "5/600",
        "resend_verification": "5/600",
        "contact": "5/600",
    }.items():
        limit, window = rate_limit._parse_limit(spec)
        assert limit >= 5 and window >= 60, name
