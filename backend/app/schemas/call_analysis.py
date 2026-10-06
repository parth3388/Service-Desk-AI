from pydantic import BaseModel
from datetime import datetime
from typing import Dict, Any


class CallAnalysisResponse(BaseModel):

    id: int

    employee_id: int

    original_filename: str

    stored_filename: str

    audio_path: str

    pdf_path: str

    transcript: str

    analysis_json: Dict[str, Any]

    confidence_score: float

    customer_score: float

    agent_score: float

    call_duration: float

    file_size: float

    processing_status: str

    created_at: datetime

    updated_at: datetime

    class Config:
        from_attributes = True