"""
Pillar 1 — canonical interaction fields. A completed report should carry
channel/source/language/disposition and the extended analysis fields
(intent/topics/entities/outcome), using null/unknown rather than fabricated
values when the underlying data doesn't support a field.
"""

from app.models.call_analysis import CallAnalysis
from conftest import audio_files, auth_headers, valid_analysis, wait_for_pipeline


def test_completed_report_has_stable_canonical_fields(client, db, employee, whisper, groq, mailer):
    client.post(
        "/upload/audio",
        files=audio_files(("call.wav", "audio/wav")),
        headers=auth_headers(employee),
    )
    wait_for_pipeline()

    record = db.query(CallAnalysis).order_by(CallAnalysis.id.desc()).first()

    # Channel is always known (every current upload is a voice call).
    assert record.channel == "voice_call"
    # Source records which intake path created the record.
    assert record.source == "self_upload"
    # Disposition mirrors analysis_json for dashboard querying.
    assert record.disposition == valid_analysis()["disposition"]

    analysis = record.analysis_json
    assert analysis["intent"] == valid_analysis()["intent"]
    assert analysis["topics"] == valid_analysis()["topics"]
    assert analysis["entities"] == valid_analysis()["entities"]
    assert analysis["outcome"] == valid_analysis()["outcome"]


def test_language_is_null_when_whisper_does_not_report_one(
    client, db, employee, whisper, groq, mailer
):
    # The FakeWhisper fixture's DEFAULT_TRANSCRIPT has no "language" key —
    # this must degrade to None/unknown, never a fabricated language code.
    client.post(
        "/upload/audio",
        files=audio_files(("call.wav", "audio/wav")),
        headers=auth_headers(employee),
    )
    wait_for_pipeline()

    record = db.query(CallAnalysis).order_by(CallAnalysis.id.desc()).first()
    assert record.language is None


def test_manager_uploaded_report_records_manager_upload_as_source(
    client, db, employee, manager, whisper, groq, mailer
):
    client.post(
        "/upload/manager/audio",
        data={"employee_id": employee.id},
        files=audio_files(("call.wav", "audio/wav")),
        headers=auth_headers(manager),
    )
    wait_for_pipeline()

    record = db.query(CallAnalysis).order_by(CallAnalysis.id.desc()).first()
    assert record.source == "manager_upload"


def test_pii_in_transcript_is_redacted_before_reaching_the_model(
    client, db, employee, whisper, groq, mailer
):
    whisper.result = {
        "text": "Hello, my email is jane@example.com, please call me back.",
        "segments": [
            {"start": 0.0, "end": 4.0, "text": " Hello, my email is jane@example.com, please call me back."}
        ],
    }

    client.post(
        "/upload/audio",
        files=audio_files(("call.wav", "audio/wav")),
        headers=auth_headers(employee),
    )
    wait_for_pipeline()

    record = db.query(CallAnalysis).order_by(CallAnalysis.id.desc()).first()

    # Original transcript is preserved as before (existing product behaviour).
    assert "jane@example.com" in record.transcript
    # But the model-facing copy is redacted.
    assert "jane@example.com" not in record.redacted_transcript
    assert record.pii_detected is True
    assert record.pii_findings == [{"type": "EMAIL", "count": 1}]

    # The redacted text, not the raw one, is what the LLM actually received.
    prompt_sent_to_llm = groq.calls[0]["messages"][0]["content"]
    assert "jane@example.com" not in prompt_sent_to_llm
    assert "[EMAIL_REDACTED]" in prompt_sent_to_llm
