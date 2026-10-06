from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import manager_required


from app.schemas.manager import ManagerReviewRequest
from typing import Any
from app.services.call_analysis_service import (
    get_company_dashboard_stats,
    get_recent_company_calls,
    get_top_employee,
    get_employee_performance,
    get_employee_by_id,
    delete_employee
)
from app.models.user import User, UserRole
from app.services.report_service import (
    get_company_reports,
    get_report_by_id
)
from app.services.report_service import (
    get_report_by_id,
    delete_report
)

router = APIRouter(
    prefix="/manager",
    tags=["Manager"]
)


@router.get("/dashboard")
def get_manager_dashboard(
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db)
):

    dashboard = get_company_dashboard_stats(
        db=db
    )

    recent_calls = get_recent_company_calls(
        db=db,
        limit=10
    )

    top_employee = get_top_employee(
        db=db
    )

    recent_calls_response: list[dict] = []

    for call in recent_calls:

        recent_calls_response.append(
            {
                "id": call.id,
                "employee_id": call.employee_id,
                "original_filename": call.original_filename,
                "confidence_score": call.confidence_score,
                "customer_score": call.customer_score,
                "agent_score": call.agent_score,
                "processing_status": (
                    call.processing_status.value
                    if call.processing_status
                    else None
                ),
                "created_at": call.created_at
            }
        )

    top_employee_response: dict | None = None

    if top_employee:

        top_employee_response = {
            "employee_id": top_employee.id,
            "employee_name": top_employee.full_name,
            "average_confidence_score": round(
                float(
                    top_employee.average_confidence_score or 0
                ),
                2
            )
        }

    return {
        "status": "success",

        "manager": {
            "id": current_user.id,
            "full_name": current_user.full_name,
            "email": current_user.email
        },

        "statistics": dashboard,

        "top_performer": top_employee_response,

        "recent_calls": recent_calls_response
    }
@router.get("/employees")
def list_employee_performance(
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db)
):

    employees = get_employee_performance(
        db=db
    )

    employee_list: list[dict] = []

    for employee in employees:

        employee_list.append(
            {
                "employee_id": employee.id,
                "employee_name": employee.full_name,
                "total_calls": employee.total_calls,
                "average_confidence_score": round(
                    float(employee.confidence_score or 0),
                    2
                ),
                "average_customer_score": round(
                    float(employee.customer_score or 0),
                    2
                ),
                "average_agent_score": round(
                    float(employee.agent_score or 0),
                    2
                )
            }
        )

    return {
        "status": "success",
        "total_employees": len(employee_list),
        "employees": employee_list
    }

@router.get("/employees/list")
def get_employees_list(
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db)
):

    employees = (
        db.query(User)
        .filter(User.role == UserRole.EMPLOYEE)
        .order_by(User.full_name)
        .all()
    )

    return {
        "status": "success",
        "employees": [
            {
                "id": e.id,
                "full_name": e.full_name,
                "email": e.email
            }
            for e in employees
        ]
    }
@router.delete("/employee/{employee_id}")
def delete_employee_route(
    employee_id: int,
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db)
):

    employee = get_employee_by_id(
        db=db,
        employee_id=employee_id
    )

    if employee is None:
        raise HTTPException(
            status_code=404,
            detail="Employee not found."
        )

    delete_employee(
        db=db,
        employee=employee
    )

    return {
        "status": "success",
        "message": "Employee deleted successfully."
    }


@router.get("/reports")
def list_company_reports(
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db)
):

    reports = get_company_reports(
        db=db
    )

    report_list: list[dict] = []

    for report in reports:

        report_list.append(
            {
                "report_id": report.id,
                "employee_id": report.employee_id,
                "original_filename": report.original_filename,
                "stored_filename": report.stored_filename,
                "confidence_score": report.confidence_score,
                "customer_score": report.customer_score,
                "agent_score": report.agent_score,
                "call_duration": report.call_duration,
                "processing_status": (
                    report.processing_status.value
                    if report.processing_status
                    else None
                ),
                "created_at": report.created_at
            }
        )

    return {
        "status": "success",
        "total_reports": len(report_list),
        "reports": report_list
    }

@router.get("/report/{report_id}")
def get_company_report(
    report_id: int,
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db)
):

    report = get_report_by_id(
        db=db,
        report_id=report_id
    )

    if report is None:

        raise HTTPException(
            status_code=404,
            detail="Report not found."
        )

    return {
        "status": "success",

        "report": {

            "id": report.id,

            "employee_id": report.employee_id,

            "original_filename": report.original_filename,

            "stored_filename": report.stored_filename,

            "audio_path": report.audio_path,

            "pdf_path": report.pdf_path,

            "transcript": report.transcript,

            "analysis": report.analysis_json,

            "confidence_score": report.confidence_score,

            "customer_score": report.customer_score,

            "agent_score": report.agent_score,

            "call_duration": report.call_duration,

            "file_size": report.file_size,

            "processing_status": (
                report.processing_status.value
                if report.processing_status
                else None
            ),

            "created_at": report.created_at,

            "updated_at": report.updated_at,

            "manager_review": {
                "rating": report.manager_rating,
                "decision": report.manager_decision,
                "feedback": report.manager_feedback,
                "recommendation": report.manager_recommendation
            }
        }
    }

@router.put("/report/{report_id}/review")
def save_manager_review(
    report_id: int,
    review: ManagerReviewRequest,
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db)
):

    report = get_report_by_id(
        db=db,
        report_id=report_id
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Report not found."
        )

    report.manager_rating = review.rating
    report.manager_decision = review.decision
    report.manager_feedback = review.feedback
    report.manager_recommendation = review.recommendation

    db.commit()
    db.refresh(report)

    return {
        "status": "success",
        "message": "Review saved successfully.",
        "manager_review": {
            "rating": report.manager_rating,
            "decision": report.manager_decision,
            "feedback": report.manager_feedback,
            "recommendation": report.manager_recommendation
        }
    }

@router.delete("/report/{report_id}")
def delete_company_report(
    report_id: int,
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db)
):

    report = get_report_by_id(
        db=db,
        report_id=report_id
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Report not found."
        )

    delete_report(
        db=db,
        report=report
    )

    return {
        "status": "success",
        "message": "Report deleted successfully."
    }