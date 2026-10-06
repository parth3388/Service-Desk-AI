"""
Pillar 3/4 — configurable AutoQA scorecards, AI evaluations with evidence,
and human review/override.

Hierarchy:
    QAScorecard -> QAScorecardVersion -> QASection -> QACriterion
    QAEvaluation (one per CallAnalysis) -> QACriterionResult (one per criterion)

Weights are deterministic data, never invented by the LLM: `weight_pct` on a
QASection is that section's share of the overall scorecard (sections in a
version should sum to 100); `weight_pct` on a QACriterion is its share
WITHIN its section (criteria in a section should sum to 100). The actual
weighted score is computed in app/services/qa_engine.py, not by the model.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class QAScorecard(Base):
    __tablename__ = "qa_scorecard"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    versions = relationship(
        "QAScorecardVersion",
        back_populates="scorecard",
        cascade="all, delete-orphan",
        order_by="QAScorecardVersion.version_number",
    )


class QAScorecardVersion(Base):
    __tablename__ = "qa_scorecard_version"
    __table_args__ = (UniqueConstraint("scorecard_id", "version_number"),)

    id = Column(Integer, primary_key=True, index=True)
    scorecard_id = Column(Integer, ForeignKey("qa_scorecard.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    # Only one version per scorecard should be active at a time; enforced in
    # app/services/qa_defaults.py / the (future) admin API, not at the DB level.
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    scorecard = relationship("QAScorecard", back_populates="versions")

    sections = relationship(
        "QASection",
        back_populates="scorecard_version",
        cascade="all, delete-orphan",
        order_by="QASection.order_index",
    )


class QASection(Base):
    __tablename__ = "qa_section"

    id = Column(Integer, primary_key=True, index=True)
    scorecard_version_id = Column(
        Integer, ForeignKey("qa_scorecard_version.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String(150), nullable=False)
    weight_pct = Column(Float, nullable=False)  # share of the overall scorecard
    order_index = Column(Integer, nullable=False, default=0)

    scorecard_version = relationship("QAScorecardVersion", back_populates="sections")

    criteria = relationship(
        "QACriterion",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="QACriterion.order_index",
    )


class QACriterion(Base):
    __tablename__ = "qa_criterion"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(Integer, ForeignKey("qa_section.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    weight_pct = Column(Float, nullable=False)  # share WITHIN the section
    is_critical = Column(Boolean, nullable=False, default=False)  # pass/fail gate
    order_index = Column(Integer, nullable=False, default=0)

    section = relationship("QASection", back_populates="criteria")


class QAEvaluation(Base):
    __tablename__ = "qa_evaluation"
    __table_args__ = (UniqueConstraint("call_analysis_id", "version_number"),)

    id = Column(Integer, primary_key=True, index=True)

    # Versioned: every AutoQA run (first run or rerun) creates a NEW row.
    # Older evaluations (and any human review attached to them) are never
    # deleted or overwritten — `is_latest` marks the one the UI shows by
    # default. Exactly one row per call_analysis_id has is_latest=True; that
    # invariant is maintained in app code (services/qa_engine.py), not by a
    # DB constraint, so it works identically on SQLite and Postgres.
    call_analysis_id = Column(
        Integer, ForeignKey("call_analysis.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number = Column(Integer, nullable=False, default=1)
    is_latest = Column(Boolean, nullable=False, default=True, index=True)

    scorecard_version_id = Column(Integer, ForeignKey("qa_scorecard_version.id"), nullable=False)

    model = Column(String(100), nullable=True)
    prompt_version = Column(String(20), nullable=True)

    ai_total_score = Column(Float, nullable=True)  # deterministically computed, never LLM-invented
    ai_passed = Column(Boolean, nullable=True)  # False if any critical criterion failed

    human_total_score = Column(Float, nullable=True)
    overridden = Column(Boolean, nullable=False, default=False)

    status = Column(String(20), nullable=False, default="PENDING")  # PENDING | COMPLETED | FAILED
    error_reason = Column(String(300), nullable=True)

    generated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    call_analysis = relationship("CallAnalysis", back_populates="qa_evaluations")
    scorecard_version = relationship("QAScorecardVersion")

    criterion_results = relationship(
        "QACriterionResult",
        back_populates="evaluation",
        cascade="all, delete-orphan",
    )


class QACriterionResult(Base):
    __tablename__ = "qa_criterion_result"

    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("qa_evaluation.id", ondelete="CASCADE"), nullable=False, index=True)
    criterion_id = Column(Integer, ForeignKey("qa_criterion.id"), nullable=False)

    ai_score = Column(Float, nullable=True)
    ai_pass = Column(Boolean, nullable=True)  # only meaningful when the criterion is_critical
    ai_confidence = Column(Float, nullable=True)
    ai_rationale = Column(Text, nullable=True)

    evidence_quote = Column(Text, nullable=True)
    evidence_segment = Column(String(100), nullable=True)  # e.g. "00:01:23 - 00:01:31"
    # True only when evidence_quote was actually found (substring match) in
    # the transcript it claims to come from — guards against invented evidence.
    evidence_verified = Column(Boolean, nullable=False, default=False)

    human_score = Column(Float, nullable=True)
    human_pass = Column(Boolean, nullable=True)
    human_comment = Column(Text, nullable=True)
    disputed = Column(Boolean, nullable=False, default=False)
    overridden = Column(Boolean, nullable=False, default=False)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    evaluation = relationship("QAEvaluation", back_populates="criterion_results")
    criterion = relationship("QACriterion")
    reviewer = relationship("User")
