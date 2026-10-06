from fastapi import APIRouter, Depends, HTTPException
import mimetypes
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os

from app.core.database import get_db
from app.core.dependencies import get_current_user, employee_required

from app.models.call_analysis import ProcessingStatus
from app.models.email_delivery import EmailStatus
from app.models.user import User, UserRole

from app.services.email_delivery import deliver_report_email
from app.services.report_service import (
    get_employee_reports,
    get_downloadable_report,
    get_employee_report,
    delete_report
)


router = APIRouter(
    prefix="/report",
    tags=["Report"]
)


# =========================
# MY REPORTS
# =========================

@router.get("/my-reports")
def get_my_reports(
    current_user: User = Depends(employee_required),
    db: Session = Depends(get_db)
):

    reports = get_employee_reports(
        db=db,
        employee_id=current_user.id
    )

    return {
        "status": "success",
        "total_reports": len(reports),
        "reports": [
            {
                "report_id": report.id,
                "original_filename": report.original_filename,
                "confidence_score": report.confidence_score,
                "customer_score": report.customer_score,
                "agent_score": report.agent_score,
                "processing_status": report.processing_status.value,
                "created_at": report.created_at
            }
            for report in reports
        ]
    }



# =========================
# AUDIO DOWNLOAD
# IMPORTANT: keep before /{report_id}
# =========================

@router.get("/audio/{report_id}")
def get_report_audio(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    report = get_downloadable_report(
        db=db,
        report_id=report_id,
        current_user=current_user
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Report not found."
        )


    if not report.audio_path:
        raise HTTPException(
            status_code=404,
            detail="Audio path missing."
        )


    if not os.path.exists(report.audio_path):
        raise HTTPException(
            status_code=404,
            detail="Audio file missing."
        )


    mime_type, _ = mimetypes.guess_type(
        report.audio_path
    )


    return FileResponse(
        path=report.audio_path,
        filename=report.original_filename,
        media_type=mime_type or "application/octet-stream"
    )



# =========================
# PDF DOWNLOAD
# =========================

@router.get("/download/{report_id}")
def download_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    report = get_downloadable_report(
        db=db,
        report_id=report_id,
        current_user=current_user
    )


    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Report not found."
        )


    if not report.pdf_path:
        raise HTTPException(
            status_code=404,
            detail="PDF not generated."
        )


    if not os.path.exists(report.pdf_path):
        raise HTTPException(
            status_code=404,
            detail="PDF file missing."
        )


    return FileResponse(
        path=report.pdf_path,
        filename=f"{os.path.splitext(report.original_filename)[0]}_Analysis_Report.pdf",
        media_type="application/pdf"
    )



# =========================
# REPORT DETAILS
# Keep this BELOW audio/download
# =========================

@router.get("/{report_id}")
def get_report_details(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    if current_user.role == UserRole.MANAGER:

        report = get_downloadable_report(
            db=db,
            report_id=report_id,
            current_user=current_user
        )

    else:

        report = get_employee_report(
            db=db,
            report_id=report_id,
            employee_id=current_user.id
        )


    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Report not found."
        )


    return {
        "status": "success",
        "report": report
    }



# =========================
# DELETE REPORT
# =========================

@router.delete("/{report_id}")
def remove_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    report = get_employee_report(
        db=db,
        report_id=report_id,
        employee_id=current_user.id
    )


    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Report not found."
        )


    # delete_report removes the DB row and then the files.
    delete_report(
        db=db,
        report=report
    )


    return {
        "status": "success",
        "message": "Report deleted successfully.",
        "report_id": report_id
    }



# =========================
# RESEND REPORT EMAIL
#
# See app/services/email_delivery.py for the delivery state machine. This is
# the manual/explicit resend path: the report's owner or a manager can ask
# for the email again if it never arrived. It is NOT subject to
# EMAIL_MAX_ATTEMPTS (that cap only bounds the automatic attempts made right
# after processing and at server startup) — but it still cannot re-send an
# email that already went out (status SENT), and it cannot run concurrently
# with another attempt already in flight.
# =========================

@router.post("/{report_id}/resend-email")
def resend_report_email(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    report = get_downloadable_report(
        db=db,
        report_id=report_id,
        current_user=current_user
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Report not found."
        )

    if report.processing_status != ProcessingStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="This report has not completed processing yet."
        )

    if report.email_delivery is None:
        raise HTTPException(
            status_code=404,
            detail="No email delivery record exists for this report."
        )

    result_status = deliver_report_email(
        report_id,
        automatic=False,
        db=db
    )

    db.refresh(report)
    delivery = report.email_delivery

    if result_status == EmailStatus.SENT:
        message = "Email sent successfully."
    elif result_status == EmailStatus.FAILED:
        message = "The email could not be sent. Please try again shortly."
    elif result_status == EmailStatus.SENDING:
        message = "Another attempt is already in progress. Please wait a moment."
    else:
        message = "The email has already been sent."

    return {
        "status": "success",
        "message": message,
        "email": {
            "status": delivery.status if delivery else result_status,
            "attempts": delivery.attempts if delivery else None,
            "last_error": delivery.last_error if delivery else None,
            "sent_at": delivery.sent_at if delivery else None
        }
    }