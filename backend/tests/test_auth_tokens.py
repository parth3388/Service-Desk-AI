"""Token-type separation: access / email-verification / password-reset."""

from datetime import datetime, timedelta

from jose import jwt

from app.core import config
from app.core.security import (
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
)
from app.models.user import User
from conftest import auth_headers, make_user


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_access_token_works_on_protected_routes(client, employee):
    assert client.get("/auth/profile", headers=auth_headers(employee)).status_code == 200
    assert client.get("/employee/dashboard", headers=auth_headers(employee)).status_code == 200


def test_password_reset_token_is_not_a_bearer_token(client, employee):
    token = create_password_reset_token(user_id=employee.id, email=employee.email)

    assert client.get("/auth/profile", headers=bearer(token)).status_code == 401
    assert client.get("/employee/dashboard", headers=bearer(token)).status_code == 401
    assert client.get("/report/my-reports", headers=bearer(token)).status_code == 401


def test_email_verification_token_is_not_a_bearer_token(client, employee):
    token = create_email_verification_token(user_id=employee.id, email=employee.email)

    assert client.get("/auth/profile", headers=bearer(token)).status_code == 401
    assert client.get("/employee/dashboard", headers=bearer(token)).status_code == 401


def test_token_without_type_claim_is_rejected(client, employee):
    legacy = jwt.encode(
        {
            "user_id": employee.id,
            "email": employee.email,
            "role": "employee",
            "exp": datetime.utcnow() + timedelta(minutes=5),
        },
        config.SECRET_KEY,
        algorithm=config.ALGORITHM,
    )

    assert client.get("/auth/profile", headers=bearer(legacy)).status_code == 401


def test_token_with_non_integer_user_id_is_rejected(client):
    forged = jwt.encode(
        {"user_id": "1", "type": "access", "exp": datetime.utcnow() + timedelta(minutes=5)},
        config.SECRET_KEY,
        algorithm=config.ALGORITHM,
    )

    assert client.get("/auth/profile", headers=bearer(forged)).status_code == 401


def test_access_token_cannot_reset_a_password(client, employee):
    access = create_access_token(user_id=employee.id, email=employee.email, role="employee")

    response = client.post(
        "/auth/reset-password",
        json={"token": access, "new_password": "BrandNewPass1"},
    )

    assert response.status_code == 400


def test_verification_token_cannot_reset_a_password(client, employee):
    token = create_email_verification_token(user_id=employee.id, email=employee.email)

    response = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "BrandNewPass1"},
    )

    assert response.status_code == 400


def test_access_and_reset_tokens_cannot_verify_email(client, db):
    user = make_user(db, "unverified@example.com", verified=False)
    access = create_access_token(user_id=user.id, email=user.email, role="employee")
    reset = create_password_reset_token(user_id=user.id, email=user.email)

    for token in (access, reset):
        page = client.get("/auth/verify-email", params={"token": token})
        assert "invalid or expired" in page.text

    db.expire_all()
    assert db.query(User).get(user.id).is_verified is False


def test_verification_token_verifies_email(client, db):
    user = make_user(db, "unverified@example.com", verified=False)
    token = create_email_verification_token(user_id=user.id, email=user.email)

    page = client.get("/auth/verify-email", params={"token": token})

    assert "verified successfully" in page.text
    db.expire_all()
    assert db.query(User).get(user.id).is_verified is True


def test_reset_token_resets_password_and_is_single_use(client, employee):
    token = create_password_reset_token(user_id=employee.id, email=employee.email)

    first = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "BrandNewPass1"},
    )
    assert first.status_code == 200

    login = client.post(
        "/auth/login",
        data={"username": employee.email, "password": "BrandNewPass1"},
    )
    assert login.status_code == 200

    second = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "AnotherPass22"},
    )
    assert second.status_code == 400


def test_valid_token_for_deleted_user_is_401_not_404(client, db, employee):
    headers = auth_headers(employee)
    db.delete(db.query(User).get(employee.id))
    db.commit()

    assert client.get("/auth/profile", headers=headers).status_code == 401


def test_deactivated_user_cannot_use_profile(client, db, employee):
    headers = auth_headers(employee)
    row = db.query(User).get(employee.id)
    row.is_active = False
    db.commit()

    assert client.get("/auth/profile", headers=headers).status_code == 403
