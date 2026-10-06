from __future__ import annotations

import os

from sqlalchemy.orm import Session

from app.models.call_analysis import CallAnalysis
from app.models.user import User, UserRole


# ==========================================================
# Employee Reports
# ==========================================================

def get_employee_reports(
    db: Session,
    employee_id: int
) -> list[CallAnalysis]:
    """
    Return all reports belonging to an employee.
    """

    return (
        db.query(CallAnalysis)
        .filter(
            CallAnalysis.employee_id == employee_id
        )
        .order_by(
            CallAnalysis.created_at.desc()
        )
        .all()
    )


# ==========================================================
# Company Reports
# ==========================================================

def get_company_reports(
    db: Session,
    limit: int | None = None
) -> list[CallAnalysis]:
    """
    Return all reports in descending order.
    """

    query = (
        db.query(CallAnalysis)
        .order_by(
            CallAnalysis.created_at.desc()
        )
    )

    if limit is not None:
        query = query.limit(limit)

    return query.all()


# ==========================================================
# Report Lookup
# ==========================================================

def get_report_by_id(
    db: Session,
    report_id: int
) -> CallAnalysis | None:
    """
    Fetch report using report id.
    """

    return (
        db.query(CallAnalysis)
        .filter(
            CallAnalysis.id == report_id
        )
        .first()
    )


def get_employee_report(
    db: Session,
    report_id: int,
    employee_id: int
) -> CallAnalysis | None:
    """
    Fetch report only if it belongs to employee.
    """

    return (
        db.query(CallAnalysis)
        .filter(
            CallAnalysis.id == report_id,
            CallAnalysis.employee_id == employee_id
        )
        .first()
    )


# ==========================================================
# Download Permission
# ==========================================================

def get_downloadable_report(
    db: Session,
    report_id: int,
    current_user: User
) -> CallAnalysis | None:
    """
    Manager can download any report.
    Employee can download only their own report.
    """

    report = get_report_by_id(
        db=db,
        report_id=report_id
    )

    if report is None:
        return None

    if current_user.role == UserRole.MANAGER:
        return report

    if report.employee_id == current_user.id:
        return report

    return None


# ==========================================================
# Delete Report
# ==========================================================

def delete_report(
    db: Session,
    report: CallAnalysis
) -> None:
    """
    Delete report from database
    along with generated files.
    """

    files = [
        path
        for path in (report.audio_path, report.pdf_path)
        if path
    ]

    # Delete the row first; only remove files once the commit succeeded so a
    # failed commit cannot leave a report pointing at deleted files.
    db.delete(report)
    db.commit()

    for path in files:

        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            # The DB row is gone; a leftover file is harmless.
            pass


# ==========================================================
# Report Ownership
# ==========================================================

def employee_can_access_report(
    report: CallAnalysis,
    employee_id: int
) -> bool:
    """
    Check report ownership.
    """

    return (
        report.employee_id == employee_id
    )