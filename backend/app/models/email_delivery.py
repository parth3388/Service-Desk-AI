from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class EmailStatus:
    """
    Delivery state of a report's email.

    Plain strings (not a database enum) so this table needs no enum type.

        PENDING  report is COMPLETED, email not attempted yet
        SENDING  an attempt is in flight (claimed atomically; stale after
                 EMAIL_STALE_MINUTES so a crashed attempt can be retried)
        SENT     the SMTP server accepted the message
        FAILED   the last attempt failed
    """

    PENDING = "PENDING"
    SENDING = "SENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class ReportEmailDelivery(Base):
    """
    One row per COMPLETED report, created in the SAME transaction that marks
    the report COMPLETED. That is what makes recovery possible: after a crash
    the database still says "completed, email pending".

    NOTE: SMTP is not transactional with PostgreSQL, so this gives bounded,
    at-least-once recovery, not exactly-once delivery. If the process dies
    after the SMTP server accepted a message but before SENT is written, the
    recovery pass will send that message once more.
    """

    __tablename__ = "report_email_delivery"

    id = Column(
        Integer,
        primary_key=True
    )

    report_id = Column(
        Integer,
        ForeignKey("call_analysis.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True
    )

    status = Column(
        String(16),
        nullable=False,
        default=EmailStatus.PENDING,
        index=True
    )

    attempts = Column(
        Integer,
        nullable=False,
        default=0
    )

    # Short, safe classification ("SMTP connection timed out"), never the raw
    # exception text (which can contain addresses / server details).
    last_error = Column(
        String(200),
        nullable=True
    )

    last_attempt_at = Column(
        DateTime,
        nullable=True
    )

    sent_at = Column(
        DateTime,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    report = relationship(
        "CallAnalysis",
        back_populates="email_delivery"
    )
