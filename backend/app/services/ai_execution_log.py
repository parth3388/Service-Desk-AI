"""
Pillar 9 — reusable AI execution logging.

Every meaningful AI call (call analysis, QA evaluation) should call
`log_execution()` exactly once with its outcome. Kept as its own service
(not scattered `logger.info` calls) so governance data lives in one queryable
table (app/models/ai_execution_log.py).
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.ai_execution_log import AIExecutionLog

logger = logging.getLogger(__name__)


def log_execution(
    db: Session,
    use_case: str,
    model: str,
    status: str,
    call_analysis_id: Optional[int] = None,
    prompt_version: Optional[str] = None,
    latency_ms: Optional[int] = None,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    estimated_cost_usd: Optional[float] = None,
    error_reason: Optional[str] = None,
) -> None:
    """
    Record one AI execution. Best-effort and isolated: a logging failure
    must never break the pipeline it is observing, and never raises.
    """

    try:
        entry = AIExecutionLog(
            call_analysis_id=call_analysis_id,
            use_case=use_case,
            model=model,
            prompt_version=prompt_version,
            status=status,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            estimated_cost_usd=estimated_cost_usd,
            error_reason=error_reason,
        )
        db.add(entry)
        db.commit()

    except Exception:
        logger.exception(
            "Failed to record AI execution log (use_case=%s, call_analysis_id=%s)",
            use_case,
            call_analysis_id,
        )
        db.rollback()
