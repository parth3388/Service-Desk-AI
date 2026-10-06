"""SMTP timeout, visible email failures, resend-verification, contact + health."""

import socket
from email.message import EmailMessage

import pytest

import app.api.auth as auth_module
import app.api.contact as contact_module
from app.core import config
from app.models.user import User
from app.services import email_service
from conftest import make_user


# ----------------------------------------------------------------------
# SMTP timeout
# ----------------------------------------------------------------------

class FakeSMTP:
    instances = []

    def __init__(self, host, port, timeout=None, **kwargs):
        self.host, self.port, self.timeout = host, port, timeout
        self.sent = []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        pass

    def login(self, user, password):
        pass

    def send_message(self, msg):
        self.sent.append(msg)


def test_smtp_connection_always_has_a_timeout(monkeypatch):
    FakeSMTP.instances.clear()
    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)

    msg = EmailMessage()
    msg["To"] = "a@example.com"
    msg.set_content("hi")
    email_service._send(msg)

    (smtp,) = FakeSMTP.instances
    assert smtp.timeout == config.SMTP_TIMEOUT
    assert smtp.timeout and smtp.timeout > 0
    assert smtp.sent


def test_smtp_timeout_default_is_finite():
    assert 0 < config.SMTP_TIMEOUT <= 60


def test_every_email_type_goes_through_the_timeout_sender(monkeypatch):
    FakeSMTP.instances.clear()
    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)

    email_service.send_verification_email("a@example.com", "tok")
    email_service.send_password_reset_email("a@example.com", "tok")
    email_service.send_contact_email("A", "a@example.com", None, None, "x", "hello")

    assert len(FakeSMTP.instances) == 3
    assert all(i.timeout == config.SMTP_TIMEOUT for i in FakeSMTP.instances)


# ----------------------------------------------------------------------
# Failures are visible, not swallowed
# ----------------------------------------------------------------------

def register_body(email="new@example.com"):
    return {"full_name": "New Person", "email": email, "password": "Password123", "role": "employee"}


def test_register_reports_when_the_verification_email_could_not_be_sent(client, db, monkeypatch):
    def boom(**kwargs):
        raise socket.timeout("smtp timed out")

    monkeypatch.setattr(auth_module, "send_verification_email", boom)

    response = client.post("/auth/register", json=register_body())

    assert response.status_code == 200                     # the account exists
    body = response.json()
    assert body["verification_email_sent"] is False
    assert "could not be sent" in body["message"]
    assert "Resend verification email" in body["message"]
    assert "timed out" not in response.text
    assert db.query(User).count() == 1


def test_register_reports_success_when_email_is_sent(client, monkeypatch):
    monkeypatch.setattr(auth_module, "send_verification_email", lambda **kw: None)

    body = client.post("/auth/register", json=register_body()).json()

    assert body["verification_email_sent"] is True
    assert "check your email" in body["message"]


# ----------------------------------------------------------------------
# Resend verification
# ----------------------------------------------------------------------

@pytest.fixture
def sent_verifications(monkeypatch):
    sent = []
    monkeypatch.setattr(auth_module, "send_verification_email", lambda **kw: sent.append(kw))
    return sent


def resend(client, email):
    return client.post("/auth/resend-verification", json={"email": email})


def test_resend_sends_a_fresh_working_token_to_an_unverified_user(client, db, sent_verifications):
    user = make_user(db, "pending@example.com", verified=False)

    response = resend(client, user.email)

    assert response.status_code == 200
    (mail,) = sent_verifications
    assert mail["to_email"] == user.email

    page = client.get("/auth/verify-email", params={"token": mail["token"]})
    assert "verified successfully" in page.text
    db.expire_all()
    assert db.query(User).get(user.id).is_verified is True


def test_resend_does_not_reveal_whether_an_account_exists_or_is_verified(client, db, sent_verifications):
    make_user(db, "pending@example.com", verified=False)
    make_user(db, "done@example.com", verified=True)
    make_user(db, "off@example.com", verified=False, active=False)

    bodies = [
        resend(client, email).json()
        for email in ("pending@example.com", "done@example.com", "off@example.com", "ghost@example.com")
    ]

    assert all(b == bodies[0] for b in bodies)
    assert [m["to_email"] for m in sent_verifications] == ["pending@example.com"]


def test_resend_swallows_smtp_errors_without_changing_the_response(client, db, monkeypatch):
    make_user(db, "pending@example.com", verified=False)

    def boom(**kwargs):
        raise socket.timeout("nope")

    monkeypatch.setattr(auth_module, "send_verification_email", boom)

    response = resend(client, "pending@example.com")

    assert response.status_code == 200
    assert "nope" not in response.text


def test_resend_rejects_malformed_email(client):
    assert resend(client, "not-an-email").status_code == 422


def test_expired_verification_token_points_the_user_to_resend(client, db):
    from datetime import datetime, timedelta

    from jose import jwt

    user = make_user(db, "late@example.com", verified=False)
    expired = jwt.encode(
        {"user_id": user.id, "email": user.email, "type": "email_verification",
         "exp": datetime.utcnow() - timedelta(minutes=1)},
        config.SECRET_KEY,
        algorithm=config.ALGORITHM,
    )

    page = client.get("/auth/verify-email", params={"token": expired})

    assert "invalid or expired" in page.text
    assert "Resend verification email" in page.text


def test_unverified_user_still_cannot_log_in_until_verified(client, db):
    make_user(db, "pending@example.com", verified=False, password="Password123")

    response = client.post("/auth/login", data={"username": "pending@example.com", "password": "Password123"})

    assert response.status_code == 403
    assert "verify your email" in response.json()["detail"]


# ----------------------------------------------------------------------
# Contact form
# ----------------------------------------------------------------------

@pytest.fixture
def contact_mail(monkeypatch):
    sent = []
    monkeypatch.setattr(contact_module, "send_contact_email", lambda **kw: sent.append(kw))
    return sent


GOOD_CONTACT = {
    "name": "Ann Example",
    "email": "ann@example.com",
    "phone": "+1 555 0100",
    "company": "Acme",
    "interest": "Demo",
    "message": "Please get in touch.",
}


def test_valid_contact_form_is_sent(client, contact_mail):
    response = client.post("/contact", json=GOOD_CONTACT)

    assert response.status_code == 200
    assert contact_mail[0]["message"] == "Please get in touch."


def test_contact_optional_fields_may_be_omitted_or_empty(client, contact_mail):
    body = {"name": "Ann", "email": "ann@example.com", "message": "Hi", "phone": "", "company": None}

    assert client.post("/contact", json=body).status_code == 200


@pytest.mark.parametrize(
    "override",
    [
        {"message": ""},
        {"message": "   "},
        {"message": "x" * 5001},
        {"name": ""},
        {"name": "n" * 101},
        {"phone": "1" * 31},
        {"company": "c" * 151},
        {"interest": "i" * 101},
        {"email": "a@b"},
        {"email": "not-an-email"},
    ],
)
def test_invalid_contact_input_is_a_422_with_a_readable_list(client, contact_mail, override):
    response = client.post("/contact", json={**GOOD_CONTACT, **override})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list) and detail[0]["msg"]      # what the frontend normalizes
    assert contact_mail == []


def test_header_injection_attempts_are_flattened_to_a_single_line(client, contact_mail):
    client.post("/contact", json={**GOOD_CONTACT, "interest": "Demo\r\nBcc: evil@example.com"})

    assert "\n" not in contact_mail[0]["interest"] and "\r" not in contact_mail[0]["interest"]


def test_contact_email_failure_is_a_generic_500(client, monkeypatch):
    def boom(**kwargs):
        raise RuntimeError("smtp password rejected for test@example.invalid")

    monkeypatch.setattr(contact_module, "send_contact_email", boom)

    response = client.post("/contact", json=GOOD_CONTACT)

    assert response.status_code == 500
    assert "smtp" not in response.text.lower()
    assert "Failed to send your message" in response.json()["detail"]


# ----------------------------------------------------------------------
# Health
# ----------------------------------------------------------------------

def test_db_test_is_200_when_the_database_is_reachable(client):
    response = client.get("/db-test")

    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_db_test_is_503_when_the_database_is_down(client, monkeypatch):
    import app.api.health as health_module

    class Broken:
        def connect(self):
            raise RuntimeError("connection refused to db.internal:5432")

    monkeypatch.setattr(health_module, "engine", Broken())

    response = client.get("/db-test")

    assert response.status_code == 503
    assert response.json() == {"status": "error", "message": "Database connection failed"}
    assert "db.internal" not in response.text
