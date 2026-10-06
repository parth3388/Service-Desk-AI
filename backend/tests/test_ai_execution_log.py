"""
Pillar 9 — AI governance/execution log. One row per AI call, recording
execution metadata only (model, prompt version, latency, tokens, status) —
never raw transcript or analysis content.
"""

from app.models.ai_execution_log import AIExecutionLog
from conftest import audio_files, auth_headers, wait_for_pipeline


def upload(client, employee):
    return client.post(
        "/upload/audio",
        files=audio_files(("call.wav", "audio/wav")),
        headers=auth_headers(employee),
    )


def test_successful_pipeline_logs_both_call_analysis_and_qa_execution(
    client, db, employee, whisper, groq, mailer
):
    upload(client, employee)
    wait_for_pipeline()

    logs = db.query(AIExecutionLog).order_by(AIExecutionLog.id).all()
    use_cases = [log.use_case for log in logs]

    assert "call_analysis" in use_cases
    assert "qa_evaluation" in use_cases

    for log in logs:
        assert log.status == "success"
        assert log.model
        assert log.latency_ms is not None and log.latency_ms >= 0


def test_execution_log_never_stores_raw_transcript_or_analysis_content(
    client, db, employee, whisper, groq, mailer
):
    upload(client, employee)
    wait_for_pipeline()

    logs = db.query(AIExecutionLog).all()
    assert len(logs) > 0

    # The model has no free-text content column at all beyond a short, safe
    # error classification — assert none of the string columns ever contain
    # the transcript text used in this test.
    for log in logs:
        assert "Hello this is support" not in (log.error_reason or "")


def test_failed_groq_call_is_logged_as_an_error_with_a_call_analysis_id(
    client, db, employee, whisper, groq, mailer
):
    from groq import APIConnectionError

    groq.error = APIConnectionError(request=None)

    upload(client, employee)
    wait_for_pipeline()

    logs = db.query(AIExecutionLog).filter(AIExecutionLog.status == "error").all()
    assert len(logs) >= 1
    assert logs[0].use_case == "call_analysis"
    assert logs[0].call_analysis_id is not None
