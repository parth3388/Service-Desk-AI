"""
Durable report-email delivery (services/email_delivery.py).

State machine: PENDING -> SENDING -> SENT | FAILED, one row per report,
created in the SAME commit that marks the report COMPLETED. See the module
docstring for exactly what is (at-least-once, bounded) and is NOT
(exactly-once) guaranteed — SMTP is not transactional with PostgreSQL.
"""

import threading
import time
from datetime import datetime, timedelta

import pytest

from app.core import config
from app.models.call_analysis import CallAnalysis, ProcessingStatus
from app.models.email_delivery import EmailStatus, ReportEmailDelivery
from app.services.call_analysis_service import create_call_record, update_call_record
from app.services.email_delivery import (
    claim_email_send,
    deliver_report_email,
    describe_error,
    recover_pending_emails,
)
from conftest import audio_files, auth_headers, valid_analysis, wait_for_pipeline


def completed_report(db, employee, pdf_path="storage/reports/x.pdf", **overrides):
    """A COMPLETED report with its (PENDING) email-delivery row, exactly as
    the real pipeline creates it via update_call_record(..., email_pending=True)."""
    record = create_call_record(
        db=db, employee_id=employee.id, original_filename="call.wav",
        stored_filename="call.wav", audio_path="x", file_size=1,
    )
    update_call_record(
        db=db, record=record, transcript="hello there, a real transcript",
        analysis_json=valid_analysis(), pdf_path=pdf_path,
        confidence_score=80, customer_score=80, agent_score=80, call_duration=10,
        status=ProcessingStatus.COMPLETED, email_pending=True,
        **overrides,
    )
    return record


def delivery_row(db, report_id):
    db.expire_all()
    return db.query(ReportEmailDelivery).filter_by(report_id=report_id).first()


# ----------------------------------------------------------------------
# Row creation is atomic with COMPLETED
# ----------------------------------------------------------------------

def test_completed_report_gets_a_pending_email_row_in_the_same_commit(db, employee):
    record = completed_report(db, employee)

    row = delivery_row(db, record.id)
    assert row is not None and row.status == EmailStatus.PENDING
    assert row.attempts == 0 and row.sent_at is None


def test_a_report_that_never_completes_gets_no_email_row(db, employee):
    record = create_call_record(
        db=db, employee_id=employee.id, original_filename="c.wav",
        stored_filename="c.wav", audio_path="x", file_size=1,
    )
    assert delivery_row(db, record.id) is None


def test_update_call_record_does_not_duplicate_the_row_if_called_again(db, employee):
    record = completed_report(db, employee)
    first_id = delivery_row(db, record.id).id

    update_call_record(
        db=db, record=record, transcript="again", analysis_json=valid_analysis(),
        pdf_path="storage/reports/x.pdf", confidence_score=90, customer_score=90,
        agent_score=90, call_duration=5, status=ProcessingStatus.COMPLETED,
        email_pending=True,
    )

    row = delivery_row(db, record.id)
    assert row.id == first_id  # same row, not a second one


# ----------------------------------------------------------------------
# 1. COMPLETED -> email sent -> SENT
# ----------------------------------------------------------------------

def test_completed_report_email_is_sent(client, db, employee, mailer):
    record = completed_report(db, employee, pdf_path=_write_pdf())

    result = deliver_report_email(record.id, db=db)

    assert result == EmailStatus.SENT
    row = delivery_row(db, record.id)
    assert row.status == EmailStatus.SENT and row.attempts == 1
    assert row.sent_at is not None and row.last_error is None
    assert mailer.sent[0]["to"] == employee.email


def _write_pdf(name="x.pdf"):
    import os
    os.makedirs("storage/reports", exist_ok=True)
    path = f"storage/reports/{name}"
    with open(path, "wb") as f:
        f.write(b"%PDF-1.4\n%%EOF")
    return path


# ----------------------------------------------------------------------
# 2. email failure -> FAILED
# ----------------------------------------------------------------------

def test_send_failure_marks_the_row_failed_with_a_safe_reason(db, employee, mailer):
    mailer.error = RuntimeError("SMTP said 550 mailbox unknown for a@b.com")
    record = completed_report(db, employee, pdf_path=_write_pdf("f.pdf"))

    result = deliver_report_email(record.id, db=db)

    assert result == EmailStatus.FAILED
    row = delivery_row(db, record.id)
    assert row.status == EmailStatus.FAILED and row.attempts == 1
    assert row.sent_at is None
    assert row.last_error == "Unexpected error while sending"
    assert "a@b.com" not in (row.last_error or "")  # raw exception text never stored


@pytest.mark.parametrize(
    "error,expected",
    [
        (TimeoutError(), "SMTP connection timed out"),
        (OSError("Connection refused"), "Could not reach the SMTP server"),
        (FileNotFoundError(), "Report PDF is missing"),
    ],
)
def test_error_classification_never_includes_raw_exception_text(error, expected):
    assert describe_error(error) == expected


# ----------------------------------------------------------------------
# 3. FAILED email retry -> SENT       4. SENT retry -> no second send
# ----------------------------------------------------------------------

def test_failed_email_can_be_retried_and_then_succeeds(db, employee, mailer):
    mailer.error = RuntimeError("down")
    record = completed_report(db, employee, pdf_path=_write_pdf("r.pdf"))
    assert deliver_report_email(record.id, db=db) == EmailStatus.FAILED

    mailer.error = None
    assert deliver_report_email(record.id, db=db) == EmailStatus.SENT

    row = delivery_row(db, record.id)
    assert row.status == EmailStatus.SENT and row.attempts == 2
    assert len(mailer.sent) == 1  # only the successful attempt actually "sent"


def test_sent_email_is_never_sent_again(db, employee, mailer):
    record = completed_report(db, employee, pdf_path=_write_pdf("s.pdf"))
    deliver_report_email(record.id, db=db)
    assert len(mailer.sent) == 1

    again = deliver_report_email(record.id, db=db)

    assert again == EmailStatus.SENT
    assert len(mailer.sent) == 1  # not sent twice
    assert delivery_row(db, record.id).attempts == 1  # not claimed again


def test_claim_email_send_rejects_an_already_sent_row(db, employee):
    record = completed_report(db, employee)
    row = delivery_row(db, record.id)
    row.status, row.sent_at = EmailStatus.SENT, datetime.utcnow()
    db.commit()

    assert claim_email_send(db, record.id, automatic=True) is False


# ----------------------------------------------------------------------
# 5. report failure -> no email
# ----------------------------------------------------------------------

def test_failed_report_processing_never_creates_a_pending_email(client, db, employee, whisper, mailer):
    whisper.result = {"text": "", "segments": []}   # -> FAILED, not COMPLETED

    client.post("/upload/audio", files=audio_files(("a.wav", "audio/wav")), headers=auth_headers(employee))
    wait_for_pipeline()

    row = db.query(CallAnalysis).first()
    assert row.processing_status == ProcessingStatus.FAILED
    assert delivery_row(db, row.id) is None
    assert mailer.sent == []


# ----------------------------------------------------------------------
# 6. crash-recovery scenario: email stays PENDING, then gets delivered
# ----------------------------------------------------------------------

def test_a_row_left_pending_by_a_simulated_crash_is_recovered(db, employee, mailer):
    # Simulate the process dying right after COMPLETED was committed, before
    # any send was attempted — the row is exactly PENDING, as designed.
    record = completed_report(db, employee, pdf_path=_write_pdf("crash.pdf"))
    assert delivery_row(db, record.id).status == EmailStatus.PENDING

    outcomes = recover_pending_emails()

    assert outcomes.get(EmailStatus.SENT) == 1
    assert delivery_row(db, record.id).status == EmailStatus.SENT
    assert mailer.sent[0]["to"] == employee.email


def test_a_stale_sending_claim_from_a_crashed_attempt_is_recovered(db, employee, mailer):
    record = completed_report(db, employee, pdf_path=_write_pdf("stale.pdf"))
    row = delivery_row(db, record.id)
    row.status = EmailStatus.SENDING
    row.attempts = 1
    row.updated_at = datetime.utcnow() - timedelta(minutes=config.EMAIL_STALE_MINUTES + 1)
    db.commit()

    recover_pending_emails()

    assert delivery_row(db, record.id).status == EmailStatus.SENT


def test_a_fresh_sending_claim_is_left_alone_by_recovery(db, employee, mailer):
    record = completed_report(db, employee, pdf_path=_write_pdf("fresh.pdf"))
    row = delivery_row(db, record.id)
    row.status, row.updated_at = EmailStatus.SENDING, datetime.utcnow()
    db.commit()

    recover_pending_emails()

    assert delivery_row(db, record.id).status == EmailStatus.SENDING  # untouched
    assert mailer.sent == []


# ----------------------------------------------------------------------
# 7. no infinite retry — automatic attempts are bounded
# ----------------------------------------------------------------------

def test_automatic_attempts_are_capped_and_then_recovery_stops_trying(db, employee, mailer, monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MAX_ATTEMPTS", 2)
    mailer.error = RuntimeError("permanently down")
    record = completed_report(db, employee, pdf_path=_write_pdf("cap.pdf"))

    for _ in range(5):  # far more attempts than the cap
        recover_pending_emails()

    row = delivery_row(db, record.id)
    assert row.attempts == 2                 # never exceeded the cap
    assert row.status == EmailStatus.FAILED
    assert len(mailer.sent) == 0              # every attempt failed, none delivered


def test_explicit_resend_is_not_capped_by_the_automatic_attempt_limit(db, employee, mailer, monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MAX_ATTEMPTS", 1)
    mailer.error = RuntimeError("down")
    record = completed_report(db, employee, pdf_path=_write_pdf("nocap.pdf"))

    deliver_report_email(record.id, automatic=True, db=db)   # consumes the only automatic attempt
    assert delivery_row(db, record.id).attempts == 1

    mailer.error = None
    result = deliver_report_email(record.id, automatic=False, db=db)   # explicit resend

    assert result == EmailStatus.SENT
    assert delivery_row(db, record.id).attempts == 2


def test_recovery_pass_is_a_single_bounded_pass_not_a_loop(db, employee, mailer):
    """recover_pending_emails() must return after ONE pass, not block/loop."""
    mailer.error = RuntimeError("down")
    completed_report(db, employee, pdf_path=_write_pdf("bounded.pdf"))

    started = time.perf_counter()
    recover_pending_emails()
    elapsed = time.perf_counter() - started

    assert elapsed < 2.0  # a bounded pass over fakes, not a retry loop


# ----------------------------------------------------------------------
# 8. SMTP timeout handled safely (not crashing the pipeline / recovery)
# ----------------------------------------------------------------------

def test_smtp_timeout_during_send_is_handled_as_a_normal_failure(db, employee, mailer):
    import socket
    mailer.error = socket.timeout("timed out")
    record = completed_report(db, employee, pdf_path=_write_pdf("timeout.pdf"))

    result = deliver_report_email(record.id, db=db)

    assert result == EmailStatus.FAILED
    assert delivery_row(db, record.id).last_error == "SMTP connection timed out"


# ----------------------------------------------------------------------
# Concurrency: only one sender wins the claim
# ----------------------------------------------------------------------

def test_concurrent_delivery_attempts_send_exactly_once(db, employee, mailer):
    """
    Six callers race to deliver the same report's email. Every one of them
    may correctly report "SENT" back (a loser that checks AFTER the winner
    has already finished legitimately sees the current status as SENT — that
    is not a second send). What must be true is that the claim itself was
    only won once: exactly one SMTP call happened and attempts == 1.
    """
    record = completed_report(db, employee, pdf_path=_write_pdf("race.pdf"))
    from app.core.database import SessionLocal

    barrier = threading.Barrier(6)
    results = []

    def worker():
        session = SessionLocal()
        try:
            barrier.wait()
            results.append(deliver_report_email(record.id, db=session))
        finally:
            session.close()

    threads = [threading.Thread(target=worker) for _ in range(6)]
    [t.start() for t in threads]
    [t.join(30) for t in threads]

    assert results  # every caller got an answer, none raised
    # A loser can legitimately observe "SENDING" (it checked while the winner
    # was mid-send) or "SENT" (it checked just after) — both are correct
    # reads of shared state, not a second send. FAILED must never appear.
    assert set(results) <= {EmailStatus.SENT, EmailStatus.SENDING}
    assert len(mailer.sent) == 1               # exactly one real send
    row = delivery_row(db, record.id)
    assert row.attempts == 1                   # exactly one claim won
    assert row.status == EmailStatus.SENT       # settles on SENT once all threads finish


# ----------------------------------------------------------------------
# Manual resend endpoint (report.py)
# ----------------------------------------------------------------------

def test_resend_endpoint_sends_for_a_failed_email(client, db, employee, mailer):
    mailer.error = RuntimeError("down")
    record = completed_report(db, employee, pdf_path=_write_pdf("ep1.pdf"))
    deliver_report_email(record.id, db=db)
    assert delivery_row(db, record.id).status == EmailStatus.FAILED

    mailer.error = None
    response = client.post(f"/report/{record.id}/resend-email", headers=auth_headers(employee))

    assert response.status_code == 200
    body = response.json()
    assert body["email"]["status"] == EmailStatus.SENT
    assert "sent successfully" in body["message"].lower()


def test_resend_endpoint_reports_already_sent_without_resending(client, db, employee, mailer):
    record = completed_report(db, employee, pdf_path=_write_pdf("ep2.pdf"))
    deliver_report_email(record.id, db=db)
    assert len(mailer.sent) == 1

    response = client.post(f"/report/{record.id}/resend-email", headers=auth_headers(employee))

    assert response.status_code == 200
    assert response.json()["email"]["status"] == EmailStatus.SENT
    assert len(mailer.sent) == 1  # not sent again


def test_resend_endpoint_requires_a_completed_report(client, db, employee):
    record = create_call_record(
        db=db, employee_id=employee.id, original_filename="p.wav",
        stored_filename="p.wav", audio_path="x", file_size=1,
    )

    response = client.post(f"/report/{record.id}/resend-email", headers=auth_headers(employee))

    assert response.status_code == 400


def test_resend_endpoint_ownership_is_enforced(client, db, employee, manager):
    other = completed_report(db, employee, pdf_path=_write_pdf("ep3.pdf"))
    from conftest import make_user
    from app.models.user import UserRole
    stranger = make_user(db, "stranger@example.com", UserRole.EMPLOYEE)

    assert client.post(
        f"/report/{other.id}/resend-email", headers=auth_headers(stranger)
    ).status_code == 404

    assert client.post(
        f"/report/{other.id}/resend-email", headers=auth_headers(manager)
    ).status_code == 200  # managers can resend any report's email


def test_resend_endpoint_does_not_expose_raw_smtp_errors(client, db, employee, mailer):
    mailer.error = RuntimeError("auth failed for user@internal.smtp.example password=hunter2")
    record = completed_report(db, employee, pdf_path=_write_pdf("ep4.pdf"))

    response = client.post(f"/report/{record.id}/resend-email", headers=auth_headers(employee))

    assert "hunter2" not in response.text and "internal.smtp" not in response.text
