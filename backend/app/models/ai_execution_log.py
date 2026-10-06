from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class AIExecutionLog(Base):
    """
    Pillar 9 — AI governance/execution log.

    One row per AI call (call analysis, QA evaluation, ...). Deliberately a
    single reusable table rather than scattered logging: never stores raw
    transcript/PII, only execution metadata safe to keep and query.
    """

    __tablename__ = "ai_execution_log"

    id = Column(Integer, primary_key=True, index=True)

    call_analysis_id = Column(
        Integer,
        ForeignKey("call_analysis.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    use_case = Column(String(40), nullable=False, index=True)  # "call_analysis" | "qa_evaluation"

    model = Column(String(100), nullable=False)
    prompt_version = Column(String(20), nullable=True)

    status = Column(String(20), nullable=False, default="success")  # "success" | "error"

    latency_ms = Column(Integer, nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    estimated_cost_usd = Column(Float, nullable=True)

    # Short, safe classification only — never the raw exception text.
    error_reason = Column(String(300), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    call_analysis = relationship("CallAnalysis")
