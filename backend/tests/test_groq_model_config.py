"""
Groq model migration (llama-3.3-70b-versatile was retired for this tier).
The model is now read from app.core.config.GROQ_MODEL (env-configurable,
default "openai/gpt-oss-120b") rather than hardcoded, so a future model
retirement is a config change, not a code change. These tests prove the
configured model actually reaches every Groq call, for both the
call-analysis and AutoQA code paths.
"""

import json
import os

from app.core import config, groq_client
from app.services.qa_defaults import ensure_default_scorecard
from app.services.qa_engine import run_ai_qa_evaluation
from conftest import make_user
from app.models.call_analysis import CallAnalysis, ProcessingStatus


def test_model_name_comes_from_config_not_a_hardcoded_literal():
    assert groq_client.MODEL_NAME == config.GROQ_MODEL


def test_config_reads_groq_model_from_env_with_a_safe_default():
    # Mirrors exactly how app/core/config.py computes it, without needing a
    # process restart (GROQ_MODEL is intentionally not set in the test env —
    # see conftest.py — so this proves the fallback default is what's active).
    assert config.GROQ_MODEL == os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    assert "llama-3.3-70b-versatile" not in config.GROQ_MODEL


def test_call_analysis_groq_request_uses_the_configured_model(client, employee, whisper, groq, mailer):
    from conftest import audio_files, auth_headers, wait_for_pipeline

    client.post(
        "/upload/audio",
        files=audio_files(("call.wav", "audio/wav")),
        headers=auth_headers(employee),
    )
    wait_for_pipeline()

    assert len(groq.calls) >= 1
    assert groq.calls[0]["model"] == config.GROQ_MODEL


def test_qa_evaluation_groq_request_uses_the_configured_model(db, groq):
    employee = make_user(db, "model-config@example.com")
    record = CallAnalysis(
        employee_id=employee.id,
        original_filename="a.wav",
        stored_filename="model-config.wav",
        audio_path="a.wav",
        file_size=1,
        transcript="Hello, thanks for calling support.",
        redacted_transcript="Hello, thanks for calling support.",
        processing_status=ProcessingStatus.COMPLETED,
    )
    db.add(record)
    db.commit()

    version = ensure_default_scorecard(db)
    ids = [c.id for s in version.sections for c in s.criteria]
    groq.content = json.dumps({"criteria": [{"criterion_id": cid, "score": 50} for cid in ids]})

    evaluation = run_ai_qa_evaluation(db, record)

    assert evaluation.model == config.GROQ_MODEL
    assert groq.calls[-1]["model"] == config.GROQ_MODEL
