"""
Validation of the JSON analysis returned by the LLM.

The model is asked for a fixed JSON structure, but nothing guarantees it
complies. Everything that reaches the PDF generator, the database and the
frontend goes through `parse_analysis_response`, which either returns a
fully-normalised dict with the SAME keys the app already uses, or raises
`AnalysisValidationError`.

Rules:
- The response must be a JSON object (NaN/Infinity literals are rejected).
- `executive_summary` and the three `confidence_scorecard` scores are
  REQUIRED. Scores must be real numbers (not bools/strings) within 0-100.
- Every other field is optional: missing or null becomes "" / [] / {} so the
  PDF and UI never receive None where they expect text.
- Text fields must be strings; list fields must be lists whose items are
  strings (objects are flattened to text, because models often return
  `{"action": ..., "owner": ...}` for action items).
- Unknown keys are dropped.
"""

import json
import math
import re
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationError


class AnalysisValidationError(ValueError):
    """Raised when the AI output cannot be used. `problems` is safe to log."""

    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__("; ".join(problems))


# ----------------------------------------------------------------------
# Field types
# ----------------------------------------------------------------------

def _text(value: Any) -> str:

    if value is None:
        return ""

    if isinstance(value, str):
        return value.strip()

    raise ValueError("must be text")


def _text_list(value: Any) -> list[str]:

    if value is None:
        return []

    if not isinstance(value, list):
        raise ValueError("must be a list")

    items: list[str] = []

    for item in value:

        if isinstance(item, dict):
            item = "; ".join(
                str(v) for v in item.values()
                if isinstance(v, (str, int, float)) and str(v).strip()
            )

        text = _text(item)

        if text:
            items.append(text)

    return items


def _score(value: Any) -> float:

    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("score must be a number")

    if not math.isfinite(value) or not 0 <= value <= 100:
        raise ValueError("score must be between 0 and 100")

    return float(value)


def _optional_score(value: Any):

    if value is None:
        return None

    return _score(value)


def _none_to_empty(value: Any):
    return {} if value is None else value


Text = Annotated[str, BeforeValidator(_text)]
TextList = Annotated[list[str], BeforeValidator(_text_list)]
Score = Annotated[float, BeforeValidator(_score)]
OptionalScore = Annotated[float | None, BeforeValidator(_optional_score)]


# ----------------------------------------------------------------------
# Models (mirror the JSON schema requested in core/groq_client.py)
# ----------------------------------------------------------------------

class _Section(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CustomerSentiment(_Section):
    overall: Text = ""
    journey: Text = ""
    confidence_score: OptionalScore = None
    detailed_analysis: Text = ""


class AgentSentiment(_Section):
    overall: Text = ""
    confidence_score: OptionalScore = None
    detailed_analysis: Text = ""


class CustomerBehavior(_Section):
    frustration_level: Text = ""
    cooperation_level: Text = ""
    satisfaction_level: Text = ""
    communication_quality: Text = ""
    detailed_analysis: Text = ""


class AgentBehavior(_Section):
    professionalism: Text = ""
    empathy: Text = ""
    resolution_focus: Text = ""
    communication_quality: Text = ""
    detailed_analysis: Text = ""


class ConfidenceScorecard(_Section):
    customer_experience_score: Score
    agent_performance_score: Score
    overall_call_confidence_score: Score


class CriticalMoment(_Section):
    start_time: Text = ""
    speaker: Text = ""
    category: Text = ""
    severity: Text = ""
    quote: Text = ""


def _section(model):
    return Annotated[model, BeforeValidator(_none_to_empty)]


class CallAnalysisResult(_Section):

    executive_summary: Text

    # Pillar 1 (canonical interaction fields). Optional/defaulted so older
    # stored analyses (produced before these existed) still validate.
    intent: Text = ""
    topics: TextList = Field(default_factory=list)
    entities: TextList = Field(default_factory=list)
    outcome: Text = ""
    disposition: Text = ""

    customer_sentiment: _section(CustomerSentiment) = Field(
        default_factory=CustomerSentiment
    )
    agent_sentiment: _section(AgentSentiment) = Field(
        default_factory=AgentSentiment
    )
    customer_behavior: _section(CustomerBehavior) = Field(
        default_factory=CustomerBehavior
    )
    agent_behavior: _section(AgentBehavior) = Field(
        default_factory=AgentBehavior
    )

    key_customer_concerns: TextList = Field(default_factory=list)
    emotional_cues: TextList = Field(default_factory=list)
    action_items: TextList = Field(default_factory=list)
    positive_observations: TextList = Field(default_factory=list)

    confidence_scorecard: ConfidenceScorecard

    risk_assessment: Text = ""
    root_cause_analysis: Text = ""

    critical_conversation_moments: Annotated[
        list[CriticalMoment],
        BeforeValidator(lambda v: [] if v is None else v),
    ] = Field(default_factory=list)


# ----------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------

_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL | re.IGNORECASE)


def _reject_constant(name: str):
    raise ValueError(f"invalid JSON constant {name}")


def parse_analysis_response(raw: Any) -> dict:
    """Parse + validate the raw LLM text. Returns a normalised dict."""

    if not isinstance(raw, str) or not raw.strip():
        raise AnalysisValidationError(["empty response"])

    text = raw.strip()

    fenced = _FENCE.match(text)

    if fenced:
        text = fenced.group(1)

    try:
        data = json.loads(text, parse_constant=_reject_constant)
    except ValueError:
        raise AnalysisValidationError(["response is not valid JSON"]) from None

    if not isinstance(data, dict):
        raise AnalysisValidationError(["response is not a JSON object"])

    try:
        result = CallAnalysisResult.model_validate(data)
    except ValidationError as error:
        # Only field paths + messages are surfaced (never the input values).
        raise AnalysisValidationError([
            f"{'.'.join(str(part) for part in e['loc'])}: {e['msg']}"
            for e in error.errors()
        ]) from None

    if not result.executive_summary:
        raise AnalysisValidationError(["executive_summary: must not be empty"])

    return result.model_dump()
