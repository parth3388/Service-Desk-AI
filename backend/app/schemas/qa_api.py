from typing import Optional

from pydantic import BaseModel, Field


class QACriterionOverrideRequest(BaseModel):
    human_score: Optional[float] = Field(default=None, ge=0, le=100)
    human_pass: Optional[bool] = None
    human_comment: Optional[str] = Field(default=None, max_length=2000)
    disputed: Optional[bool] = None
