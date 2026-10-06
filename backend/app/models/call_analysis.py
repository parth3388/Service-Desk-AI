from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Float,
    Boolean,
    Enum,
    JSON
)
import os
from sqlalchemy.orm import relationship

from datetime import datetime
import enum

from app.core.database import Base


class ProcessingStatus(str, enum.Enum):
    UPLOADING = "UPLOADING"
    TRANSCRIBING = "TRANSCRIBING"
    AI_ANALYZING = "AI_ANALYZING"
    GENERATING_REPORT = "GENERATING_REPORT"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class CallAnalysis(Base):

    __tablename__ = "call_analysis"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    employee_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    original_filename = Column(
        String,
        nullable=False
    )

    stored_filename = Column(
        String,
        unique=True,
        nullable=False
    )

    audio_path = Column(
        String,
        nullable=False
    )

    pdf_path = Column(
        String,
        nullable=True
    )

    transcript = Column(
        Text,
        nullable=True
    )

    analysis_json = Column(
        JSON,
        nullable=True
    )

    confidence_score = Column(
        Float,
        default=0
    )

    customer_score = Column(
        Float,
        default=0
    )

    agent_score = Column(
        Float,
        default=0
    )

    call_duration = Column(
        Float,
        default=0
    )

    file_size = Column(
        Float,
        default=0
    )

    # NEW: links an uploaded recording to a support incident/ticket number.
    # Nullable because most existing (and many future) uploads won't have one.
    incident_number = Column(
        String,
        nullable=True
    )

    # ---- Pillar 1: canonical interaction fields (additive) ----------------

    # Every record today comes from an uploaded call recording; kept as a
    # column (not hardcoded in responses) so a future non-voice channel is a
    # data change, not a schema change.
    channel = Column(
        String(30),
        nullable=False,
        default="voice_call"
    )

    # Which intake path created this record: "self_upload" | "manager_upload"
    # | "library_generate". Nullable for rows created before this column
    # existed (source cannot be reconstructed for those).
    source = Column(
        String(30),
        nullable=True
    )

    # Whisper's detected language code (e.g. "en"), when available.
    language = Column(
        String(10),
        nullable=True
    )

    # Mirrors analysis_json["disposition"] as a queryable column for
    # dashboards; the JSON blob remains the source of truth.
    disposition = Column(
        String(50),
        nullable=True
    )

    # ---- Pillar 2: PII / sensitive-data protection -------------------------

    # The transcript with detected PII replaced by typed placeholders. This
    # is what gets sent to the LLM; `transcript` above keeps the original for
    # the employee/manager UI and PDF, per existing product behaviour.
    redacted_transcript = Column(
        Text,
        nullable=True
    )

    pii_detected = Column(
        Boolean,
        nullable=False,
        default=False
    )

    # [{"type": "EMAIL", "count": 2}, ...] — counts only, never raw values.
    pii_findings = Column(
        JSON,
        nullable=True
    )

    manager_rating = Column(
        Float,
        nullable=True
    )

    manager_decision = Column(
        String,
        nullable=True
    )

    manager_feedback = Column(
        Text,
        nullable=True
    )

    manager_recommendation = Column(
        Text,
        nullable=True
    )

    processing_status = Column(
        Enum(ProcessingStatus),
        default=ProcessingStatus.UPLOADING,
        nullable=False
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

    employee = relationship(
        "User",
        back_populates="call_records"
    )

    # Email delivery state (see models/email_delivery.py). Deleting a report
    # deletes its delivery row.
    email_delivery = relationship(
        "ReportEmailDelivery",
        back_populates="report",
        uselist=False,
        cascade="all, delete-orphan"
    )

    # Versioned: every AutoQA run adds a row rather than replacing one.
    # Use services/qa_engine.get_latest_evaluation() to fetch the current one.
    qa_evaluations = relationship(
        "QAEvaluation",
        back_populates="call_analysis",
        cascade="all, delete-orphan",
        order_by="QAEvaluation.version_number"
    )
