"""
Durable, bounded delivery of the report email.

Lifecycle (state lives in report_email_delivery, one row per report):

    report set COMPLETED  --same transaction-->  row PENDING
    attempt claimed (atomic UPDATE)              PENDING/FAILED -> SENDING
    SMTP accepted the message                    SENDING -> SENT
    SMTP failed / timed out                      SENDING -> FAILED  (safe reason kept)

Guarantees — and what is deliberately NOT guaranteed:

  * A report that is not COMPLETED never gets an email (the row is only
    created together with COMPLETED).
  * A SENT email is never sent again by this code (claims only take
    PENDING / FAILED / stale-SENDING rows).
  * Two concurrent senders cannot both claim a row (single conditional UPDATE).
  * Automatic retries are BOUNDED: EMAIL_MAX_ATTEMPTS per report, one pass at
    startup, no loops or timers. Beyond that only an explicit resend by the
    report's owner / a manager tries again.
  * This is NOT exactly-once delivery. SMTP is not transactional with
    PostgreSQL. If the process dies after the SMTP server accepted the
    message but before SENT is written, the row stays SENDING and the
    recovery pass will send that one message again (at-least-once).
"""

import logging
import smtplib
import socket
from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session

from app.core import config
from app.core.database import SessionLocal
from app.models.call_analysis import CallAnalysis, ProcessingStatus
from app.models.email_delivery import EmailStatus, ReportEmailDelivery
from app.services.email_service import send_report_email

logger = logging.getLogger(__name__)

CLAIMABLE = (EmailStatus.PENDING, EmailStatus.FAILED)


def describe_error(error: BaseException) -> str:
    """
    Classify a send failure into a short, safe label. The raw exception text
    (which can contain addresses, hostnames or server banners) is never
    stored or returned.
    """

    if isinstance(error, (socket.timeout, TimeoutError)):
        return "SMTP connection timed out"

    if isinstance(error, smtplib.SMTPAuthenticationError):
        return "SMTP authentication failed"

    if isinstance(error, smtplib.SMTPRecipientsRefused):
        return "Recipient address was refused"

    if isinstance(error, smtplib.SMTPException):
        return "SMTP server error"

    if isinstance(error, FileNotFoundError):
        return "Report PDF is missing"

    if isinstance(error, OSError):
        return "Could not reach the SMTP server"

    return "Unexpected error while sending"


def _stale_before() -> datetime:
    return datetime.utcnow() - timedelta(minutes=config.EMAIL_STALE_MINUTES)


def claim_email_send(db: Session, report_id: int, *, automatic: bool) -> bool:
    """
    Atomically move PENDING / FAILED (or a stale SENDING) to SENDING and count
    the attempt. Exactly one concurrent caller gets True.

    automatic=True respects EMAIL_MAX_ATTEMPTS (background paths);
    automatic=False is an explicit user resend and is not capped, but it can
    still only ever claim a row that is not SENT / actively SENDING.
    """

    now = datetime.utcnow()

    conditions = [
        ReportEmailDelivery.report_id == report_id,
        or_(
            ReportEmailDelivery.status.in_(CLAIMABLE),
            and_(
                ReportEmailDelivery.status == EmailStatus.SENDING,
                ReportEmailDelivery.updated_at < _stale_before()
            )
        )
    ]

    if automatic:
        conditions.append(
            ReportEmailDelivery.attempts < config.EMAIL_MAX_ATTEMPTS
        )

    result = db.execute(
        update(ReportEmailDelivery)
        .where(*conditions)
        .values(
            status=EmailStatus.SENDING,
            attempts=ReportEmailDelivery.attempts + 1,
            last_attempt_at=now,
            updated_at=now
        )
    )

    db.commit()

    return result.rowcount == 1


def _finish(
    db: Session,
    report_id: int,
    status: str,
    error: str | None = None
) -> bool:
    """Record the outcome of the attempt that currently holds the claim."""

    now = datetime.utcnow()

    try:

        db.execute(
            update(ReportEmailDelivery)
            .where(
                ReportEmailDelivery.report_id == report_id,
                ReportEmailDelivery.status == EmailStatus.SENDING
            )
            .values(
                status=status,
                last_error=error,
                sent_at=now if status == EmailStatus.SENT else None,
                updated_at=now
            )
        )

        db.commit()

        return True

    except Exception:

        db.rollback()

        logger.exception(
            "Could not record email outcome %s for report %s",
            status,
            report_id
        )

        return False


def current_status(db: Session, report_id: int) -> str | None:

    row = (
        db.query(ReportEmailDelivery.status)
        .filter(ReportEmailDelivery.report_id == report_id)
        .first()
    )

    return row[0] if row else None


def deliver_report_email(
    report_id: int,
    *,
    automatic: bool = True,
    db: Session | None = None
) -> str | None:
    """
    Try to send the report email once. Returns the resulting status
    (SENT / FAILED), or the existing status without sending anything if the
    row is not claimable (already SENT, being sent, attempts exhausted...).
    """

    owns_session = db is None

    if owns_session:
        db = SessionLocal()

    try:

        if not claim_email_send(db, report_id, automatic=automatic):
            return current_status(db, report_id)

        record = db.get(CallAnalysis, report_id)

        if (
            record is None
            or record.processing_status != ProcessingStatus.COMPLETED
            or not record.pdf_path
            or record.employee is None
        ):
            _finish(
                db, report_id, EmailStatus.FAILED,
                "Report is not available for emailing"
            )
            return EmailStatus.FAILED

        analysis = record.analysis_json if isinstance(record.analysis_json, dict) else {}

        try:

            send_report_email(
                to_email=record.employee.email,
                subject=f"AI Service Desk Report — {record.original_filename}",
                summary_text=analysis.get("executive_summary") or "Summary not available.",
                pdf_path=record.pdf_path,
            )

        except Exception as error:

            # Class name + safe label only: no address, host or server text.
            logger.warning(
                "Report email failed for report %s (%s)",
                report_id,
                type(error).__name__
            )

            _finish(db, report_id, EmailStatus.FAILED, describe_error(error))

            return EmailStatus.FAILED

        if not _finish(db, report_id, EmailStatus.SENT):
            # The SMTP server accepted it but we could not record that. The
            # row stays SENDING and becomes retryable after EMAIL_STALE_MINUTES
            # — the documented at-least-once window.
            return EmailStatus.SENDING

        return EmailStatus.SENT

    finally:

        if owns_session:
            db.close()


def recover_pending_emails(limit: int = 25) -> dict:
    """
    One bounded pass over emails that are owed: PENDING, FAILED, or a SENDING
    claim that went stale — for COMPLETED reports that still have automatic
    attempts left. Called once at startup; it never loops or reschedules.
    """

    db = SessionLocal()

    outcomes: Counter = Counter()

    try:

        report_ids = [
            row[0]
            for row in (
                db.query(ReportEmailDelivery.report_id)
                .join(
                    CallAnalysis,
                    CallAnalysis.id == ReportEmailDelivery.report_id
                )
                .filter(
                    CallAnalysis.processing_status == ProcessingStatus.COMPLETED,
                    ReportEmailDelivery.attempts < config.EMAIL_MAX_ATTEMPTS,
                    or_(
                        ReportEmailDelivery.status.in_(CLAIMABLE),
                        and_(
                            ReportEmailDelivery.status == EmailStatus.SENDING,
                            ReportEmailDelivery.updated_at < _stale_before()
                        )
                    )
                )
                .order_by(ReportEmailDelivery.id)
                .limit(limit)
                .all()
            )
        ]

        for report_id in report_ids:

            outcomes[
                deliver_report_email(report_id, automatic=True, db=db) or "NONE"
            ] += 1

    except Exception:

        logger.exception("Email recovery pass failed")

    finally:

        db.close()

    if outcomes:
        logger.info("Email recovery pass finished: %s", dict(outcomes))

    return dict(outcomes)
