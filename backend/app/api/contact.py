import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.rate_limit import rate_limit

from app.schemas.contact import ContactRequest
from app.services.email_service import send_contact_email

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/contact",
    tags=["Contact"]
)


@router.post(
    "",
    dependencies=[Depends(rate_limit("contact"))]
)
def submit_contact_form(data: ContactRequest):

    try:
        send_contact_email(
            name=data.name,
            email=data.email,
            phone=data.phone,
            company=data.company,
            interest=data.interest,
            message=data.message,
        )
    except Exception:
        logger.exception("Contact form email failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to send your message. Please try again later."
        )

    return {
        "status": "success",
        "message": "Your message has been sent. We'll get back to you soon."
    }