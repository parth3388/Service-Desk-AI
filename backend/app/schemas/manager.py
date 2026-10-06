from pydantic import BaseModel, Field


class ManagerReviewRequest(BaseModel):
    # The review UI is a 1-5 star control.
    rating: float = Field(..., ge=0, le=5)
    decision: str = Field(..., max_length=100)
    feedback: str = Field(..., max_length=5000)
    recommendation: str = Field(..., max_length=5000)
