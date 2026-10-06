"""One password policy for registration and reset (min 8, max 72 bytes)."""

import pytest

from app.core.password_policy import (
    PASSWORD_MAX_BYTES,
    PASSWORD_MIN_LENGTH,
    validate_password,
)
from app.core.security import create_password_reset_token
from conftest import make_user

BAD_CASES = {
    "empty": "",
    "whitespace-only": "        ",
    "short": "short",
    "seven-chars": "1234567",                        # one below the minimum
    "73-bytes": "a" * (PASSWORD_MAX_BYTES + 1),      # one above the byte limit
    "multibyte-74-bytes": "é" * 37,                  # 37 chars but 74 bytes
    "oversized-100k": "a" * 100_000,                 # must be a clean 422, not a 500
}

BAD_PASSWORDS = list(BAD_CASES.values())

bad_passwords = pytest.mark.parametrize(
    "password",
    [pytest.param(value, id=name) for name, value in BAD_CASES.items()],
)


@pytest.fixture
def register(client, monkeypatch):
    import app.api.auth as auth_module

    monkeypatch.setattr(auth_module, "send_verification_email", lambda **kw: None)

    def _register(password, email="new@example.com"):
        return client.post(
            "/auth/register",
            json={
                "full_name": "New Person",
                "email": email,
                "password": password,
                "role": "employee",
            },
        )

    return _register


def test_minimum_length_constant_is_eight():
    assert PASSWORD_MIN_LENGTH == 8


def test_validate_password_boundaries():
    assert validate_password("a" * 8)
    assert validate_password("a" * PASSWORD_MAX_BYTES)
    for bad in BAD_PASSWORDS:
        with pytest.raises(ValueError):
            validate_password(bad)


@bad_passwords
def test_register_rejects_invalid_passwords_with_422(register, password):
    response = register(password)

    assert response.status_code == 422


def test_register_accepts_valid_password(register):
    assert register("Str0ngEnough").status_code == 200


@bad_passwords
def test_reset_rejects_invalid_passwords_with_422(client, employee, password):
    token = create_password_reset_token(user_id=employee.id, email=employee.email)

    response = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": password},
    )

    assert response.status_code == 422


def test_rejected_reset_password_does_not_consume_the_token(client, employee):
    token = create_password_reset_token(user_id=employee.id, email=employee.email)

    client.post("/auth/reset-password", json={"token": token, "new_password": "short"})
    ok = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "LongEnough123"},
    )

    assert ok.status_code == 200


def test_login_does_not_enforce_the_policy_so_old_short_passwords_still_work(client, db):
    make_user(db, "legacy@example.com", password="abc123")  # 6 chars, pre-policy

    response = client.post(
        "/auth/login",
        data={"username": "legacy@example.com", "password": "abc123"},
    )

    assert response.status_code == 200
