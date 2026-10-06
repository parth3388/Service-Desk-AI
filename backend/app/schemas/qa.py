"""
Validation of the QA scorer's raw JSON output (mirrors schemas/ai_analysis.py's
approach for the call-analysis JSON). The model may only report a per-criterion
score/pass/rationale/evidence; the deterministic weighted total is computed in
app/services/qa_engine.py, never trusted from the model.
"""

from __future__ import annotations

import json
import math
import re
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationError


class QAValidationError(ValueError):
    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__("; ".join(problems))


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    raise ValueError("must be text")


def _score(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("score must be a number")
    if not math.isfinite(value) or not 0 <= value <= 100:
        raise ValueError("score must be between 0 and 100")
    return float(value)


def _optional_bool(value: Any):
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    raise ValueError("must be a boolean or null")


def _optional_score(value: Any):
    if value is None:
        return None
    return _score(value)


Text = Annotated[str, BeforeValidator(_text)]
Score = Annotated[float, BeforeValidator(_score)]
OptionalScore = Annotated[float | None, BeforeValidator(_optional_score)]
OptionalBool = Annotated[bool | None, BeforeValidator(_optional_bool)]


class QACriterionAIResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    criterion_id: int
    score: Score
    pass_: OptionalBool = Field(default=None, alias="pass")
    confidence: OptionalScore = None
    rationale: Text = ""
    evidence_quote: Text = ""
    evidence_segment: Text = ""


class QAEvaluationAIResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    criteria: list[QACriterionAIResult] = Field(default_factory=list)


_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL | re.IGNORECASE)


def _reject_constant(name: str):
    raise ValueError(f"invalid JSON constant {name}")


def parse_qa_response(raw: Any) -> QAEvaluationAIResponse:
    if not isinstance(raw, str) or not raw.strip():
        raise QAValidationError(["empty response"])

    text = raw.strip()
    fenced = _FENCE.match(text)
    if fenced:
        text = fenced.group(1)

    try:
        data = json.loads(text, parse_constant=_reject_constant)
    except ValueError:
        raise QAValidationError(["response is not valid JSON"]) from None

    if not isinstance(data, dict):
        raise QAValidationError(["response is not a JSON object"])

    try:
        return QAEvaluationAIResponse.model_validate(data)
    except ValidationError as error:
        raise QAValidationError(
            [
                f"{'.'.join(str(part) for part in e['loc'])}: {e['msg']}"
                for e in error.errors()
            ]
        ) from None
