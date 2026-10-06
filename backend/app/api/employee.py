from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import employee_required

from app.models.user import User

from app.services.call_analysis_service import (
    get_employee_dashboard_stats
)

router = APIRouter(
    prefix="/employee",
    tags=["Employee"]
)


@router.get("/dashboard")
def employee_dashboard(
    current_user: User = Depends(employee_required),
    db: Session = Depends(get_db)
):

    stats = get_employee_dashboard_stats(
        db=db,
        employee_id=current_user.id
    )

    recent_calls = []

    for call in stats["recent_calls"]:

        recent_calls.append(
            {
                "id": call.id,
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

    return {
        "status": "success",
        "employee": {
            "id": current_user.id,
            "full_name": current_user.full_name,
            "email": current_user.email,
            "role": current_user.role.value
        },
        "statistics": {
            "total_calls": stats["total_calls"],
            "average_confidence_score": stats["average_confidence_score"],
            "average_customer_score": stats["average_customer_score"],
            "average_agent_score": stats["average_agent_score"]
        },
        "recent_calls": recent_calls
    }