import os
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import func, desc, update, and_, or_
from app.core import config
from app.models.user import User, UserRole
from typing import Any
from app.models.call_analysis import (
    CallAnalysis,
    ProcessingStatus
)
from app.models.email_delivery import EmailStatus, ReportEmailDelivery

# Only calls that finished the whole pipeline count towards performance
# statistics. FAILED / UPLOADING / mid-processing rows carry the column
# default score of 0 and must not be treated as genuine zero-score calls.
COMPLETED = ProcessingStatus.COMPLETED

# Statuses that mean "a pipeline is (or claims to be) running right now".
IN_PROGRESS_STATUSES = (
    ProcessingStatus.TRANSCRIBING,
    ProcessingStatus.AI_ANALYZING,
    ProcessingStatus.GENERATING_REPORT,
)

# Statuses from which a pipeline run may start (first run or intentional retry).
CLAIMABLE_STATUSES = (
    ProcessingStatus.UPLOADING,
    ProcessingStatus.FAILED,
)


class PipelineBusyError(Exception):
    """The record is already processing or already completed."""


def create_call_record(
    db: Session,
    employee_id: int,
    original_filename: str,
    stored_filename: str,
    audio_path: str,
    file_size: float,
    source: str | None = None
):

    record = CallAnalysis(
        employee_id=employee_id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        audio_path=audio_path,
        file_size=file_size,
        source=source,
        processing_status=ProcessingStatus.UPLOADING
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return record


def claim_for_processing(
    db: Session,
    record_id: int
) -> bool:
    """
    Atomically move a record into TRANSCRIBING so only ONE caller can run
    the pipeline for it.

    This is a single conditional UPDATE, so it is race-free on the
    database side: of any number of concurrent callers exactly one sees
    rowcount == 1. A record is claimable when it is UPLOADING (first run),
    FAILED (intentional retry), or has been stuck in an in-progress status
    for longer than PIPELINE_STALE_MINUTES (the server died mid-run).
    COMPLETED records are never claimable, which also prevents a second
    report email.
    """

    now = datetime.utcnow()

    stale_before = now - timedelta(
        minutes=config.PIPELINE_STALE_MINUTES
    )

    result = db.execute(
        update(CallAnalysis)
        .where(CallAnalysis.id == record_id)
        .where(
            or_(
                CallAnalysis.processing_status.in_(CLAIMABLE_STATUSES),
                and_(
                    CallAnalysis.processing_status.in_(IN_PROGRESS_STATUSES),
                    CallAnalysis.updated_at < stale_before
                )
            )
        )
        .values(
            processing_status=ProcessingStatus.TRANSCRIBING,
            updated_at=now
        )
    )

    db.commit()

    return result.rowcount == 1


def update_call_record(
    db: Session,
    record: CallAnalysis,
    transcript: str,
    analysis_json: dict[str, Any],
    pdf_path: str,
    confidence_score: float,
    customer_score: float,
    agent_score: float,
    call_duration: float,
    status: ProcessingStatus = ProcessingStatus.COMPLETED,
    email_pending: bool = False,
    language: str | None = None,
    redacted_transcript: str | None = None,
    pii_detected: bool = False,
    pii_findings: list | None = None,
    disposition: str | None = None
):
    """
    Store the finished analysis.

    email_pending=True also creates the report's email-delivery row (status
    PENDING) in the SAME commit that marks the report COMPLETED, so the
    database can never say "completed" without also saying "email owed".
    """

    record.transcript = transcript
    record.analysis_json = analysis_json
    record.pdf_path = pdf_path
    record.confidence_score = confidence_score
    record.customer_score = customer_score
    record.agent_score = agent_score
    record.call_duration = call_duration
    record.processing_status = status
    record.language = language
    record.redacted_transcript = redacted_transcript
    record.pii_detected = pii_detected
    record.pii_findings = pii_findings
    record.disposition = disposition

    if email_pending and record.email_delivery is None:
        record.email_delivery = ReportEmailDelivery(
            status=EmailStatus.PENDING
        )

    db.commit()
    db.refresh(record)
    return record


def update_processing_status(
    db: Session,
    record: CallAnalysis,
    status: ProcessingStatus
):

    record.processing_status = status

    db.commit()
    db.refresh(record)

    return record


def get_employee_dashboard_stats(
    db: Session,
    employee_id: int
):

    completed = and_(
        CallAnalysis.employee_id == employee_id,
        CallAnalysis.processing_status == COMPLETED
    )

    total_calls = (
        db.query(CallAnalysis)
        .filter(completed)
        .count()
    )

    average_confidence_score = (
        db.query(func.avg(CallAnalysis.confidence_score))
        .filter(completed)
        .scalar()
    ) or 0

    average_customer_score = (
        db.query(func.avg(CallAnalysis.customer_score))
        .filter(completed)
        .scalar()
    ) or 0

    average_agent_score = (
        db.query(func.avg(CallAnalysis.agent_score))
        .filter(completed)
        .scalar()
    ) or 0

    recent_calls = (
        db.query(CallAnalysis)
        .filter(CallAnalysis.employee_id == employee_id)
        .order_by(desc(CallAnalysis.created_at))
        .limit(10)
        .all()
    )
    return {
        "total_calls": total_calls,
        "average_confidence_score": round(
            average_confidence_score,
            2
        ),
        "average_customer_score": round(
            average_customer_score,
            2
        ),
        "average_agent_score": round(
            average_agent_score,
            2
        ),
        "recent_calls": recent_calls
    }


def get_company_dashboard_stats(
    db: Session
):

    total_calls = (
        db.query(CallAnalysis)
        .filter(CallAnalysis.processing_status == COMPLETED)
        .count()
    )

    total_employees = (
        db.query(User)
        .filter(User.role == UserRole.EMPLOYEE)
        .count()
    )

    average_confidence_score = (
        db.query(func.avg(CallAnalysis.confidence_score))
        .filter(CallAnalysis.processing_status == COMPLETED)
        .scalar()
    ) or 0

    average_customer_score = (
        db.query(func.avg(CallAnalysis.customer_score))
        .filter(CallAnalysis.processing_status == COMPLETED)
        .scalar()
    ) or 0

    average_agent_score = (
        db.query(func.avg(CallAnalysis.agent_score))
        .filter(CallAnalysis.processing_status == COMPLETED)
        .scalar()
    ) or 0

    return {
        "total_calls": total_calls,
        "total_employees": total_employees,
        "average_confidence_score": round(
            average_confidence_score,
            2
        ),
        "average_customer_score": round(
            average_customer_score,
            2
        ),
        "average_agent_score": round(
            average_agent_score,
            2
        )
    }
def get_recent_company_calls(
    db: Session,
    limit: int = 10
):

    return (
        db.query(CallAnalysis)
        .order_by(
            desc(CallAnalysis.created_at)
        )
        .limit(limit)
        .all()
    )
def get_top_employee(
    db: Session
):

    return (
        db.query(
            User.id,
            User.full_name,
            func.avg(
                CallAnalysis.confidence_score
            ).label("average_confidence_score")
        )
        .join(
            CallAnalysis,
            CallAnalysis.employee_id == User.id
        )
        .filter(
            User.role == UserRole.EMPLOYEE,
            CallAnalysis.processing_status == COMPLETED
        )
        .group_by(
            User.id,
            User.full_name
        )
        .order_by(
            desc(
                func.avg(
                    CallAnalysis.confidence_score
                )
            ),
            User.full_name
        )
        .first()
    )
def get_failed_calls(
    db: Session
):

    return (
        db.query(CallAnalysis)
        .filter(
            CallAnalysis.processing_status ==
            ProcessingStatus.FAILED
        )
        .all()
    )
def get_all_employees(
    db: Session
):

    return (
        db.query(User)
        .filter(
            User.role == UserRole.EMPLOYEE
        )
        .order_by(User.full_name)
        .all()
    )
def get_employee_by_id(
    db: Session,
    employee_id: int
):

    return (
        db.query(User)
        .filter(
            User.id == employee_id
        )
        .filter(
            User.role == UserRole.EMPLOYEE
        )
        .first()
    )

def get_employee_performance(
    db: Session
):

    return (

        db.query(

            User.id,

            User.full_name,

            func.count(
                CallAnalysis.id
            ).label("total_calls"),

            func.avg(
                CallAnalysis.confidence_score
            ).label("confidence_score"),

            func.avg(
                CallAnalysis.customer_score
            ).label("customer_score"),

            func.avg(
                CallAnalysis.agent_score
            ).label("agent_score")

        )

        .outerjoin(
            CallAnalysis,
            and_(
                CallAnalysis.employee_id == User.id,
                CallAnalysis.processing_status == COMPLETED
            )
        )

        .filter(
            User.role == UserRole.EMPLOYEE
        )

        .group_by(
            User.id,
            User.full_name
        )

        .order_by(
            # Employees with no completed calls have a NULL average, which
            # PostgreSQL sorts FIRST under DESC — keep them last.
            desc(
                func.avg(
                    CallAnalysis.confidence_score
                )
            ).nulls_last(),
            User.full_name
        )

        .all()

    )


def delete_employee(
    db: Session,
    employee: User
) -> None:

    # Remember the files, delete the rows first, and only remove the files
    # once the commit succeeded — a failed commit must not leave rows that
    # point at already-deleted files.
    files = [
        path
        for call in employee.call_records
        for path in (call.audio_path, call.pdf_path)
        if path
    ]

    db.delete(employee)
    db.commit()

    for path in files:

        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            # The DB rows are gone; a leftover file is harmless.
            pass