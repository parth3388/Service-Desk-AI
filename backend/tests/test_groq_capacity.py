"""
Regression tests for the "15-minute audio stopped generating reports" bug.

Root cause (confirmed live against the real Groq API, see investigation):
openai/gpt-oss-120b is a *reasoning* model — part of every completion is
spent on hidden "thinking" tokens before the visible JSON answer, billed as
completion_tokens against the account's tokens-per-minute (TPM) quota. With
no reasoning_effort/max_completion_tokens set, a single ~15-minute call's
analysis request measured 1,468-2,301 completion tokens (up to 1,583 of
which were pure-reasoning overhead), on an account whose on-demand tier caps
usage at 8,000 TPM — close enough to the ceiling that the paired AutoQA call
for the same report (or any other recent usage) reliably tripped a real
`429 rate_limit_exceeded`. Short calls stayed well under the cap, which is
why they kept working while long calls started failing.

Fix: app/core/groq_client.py now passes reasoning_effort="low" (verified
live to cut reasoning tokens 7-20x with no loss of output quality/validity)
and a measured max_completion_tokens safety ceiling. app/api/upload.py now
reports GroqRateLimitError and a truncated (finish_reason="length") analysis
as distinct, honest failures instead of a generic message.

These tests use the FakeGroq fixture (no real network/API calls) and assert
on the application's observable behaviour: request parameters sent to Groq,
and how each failure mode surfaces to the employee and in the DB.
"""

import json

import httpx
import pytest
from groq import RateLimitError

from app.core import groq_client
from app.models.call_analysis import CallAnalysis, ProcessingStatus
from conftest import valid_analysis, wait_for_pipeline

from test_pipeline import WAV, rows, status_of, upload_and_wait


def _rate_limit_error():
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(
        status_code=429,
        request=request,
        json={"error": {"message": "Rate limit reached for model `openai/gpt-oss-120b` "
                                    "on tokens per minute (TPM): Limit 8000, Used 7000, "
                                    "Requested 2000.", "type": "tokens", "code": "rate_limit_exceeded"}},
    )
    return RateLimitError(message="rate_limit_exceeded", response=response, body=None)


# ----------------------------------------------------------------------
# 1. Every Groq request asks for low reasoning effort and a bounded
#    completion size — the actual fix, asserted directly on the outgoing
#    request rather than inferred from behaviour.
# ----------------------------------------------------------------------

def test_groq_requests_use_low_reasoning_effort_and_a_token_ceiling(
    client, employee, whisper, groq, mailer
):
    upload_and_wait(client, employee, WAV)

    assert len(groq.calls) >= 1
    for call in groq.calls:
        assert call["reasoning_effort"] == "low"
        assert call["max_completion_tokens"] == groq_client.MAX_COMPLETION_TOKENS
        assert call["max_completion_tokens"] > 0


# ----------------------------------------------------------------------
# 2. A short call still completes normally (no regression for the path
#    that was already working).
# ----------------------------------------------------------------------

def test_short_call_still_completes_end_to_end(client, db, employee, whisper, groq, mailer):
    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    assert status_of(client, employee, record_id).json()["report"]["state"] == "completed"
    assert rows(db)[0].processing_status == ProcessingStatus.COMPLETED
    assert len(mailer.sent) == 1


# ----------------------------------------------------------------------
# 3. A realistic large transcript (simulating a ~15-minute call) still
#    produces a valid, complete report — the actual regression path.
# ----------------------------------------------------------------------

def _long_transcript_segments(minutes=15):
    """A timestamped, two-speaker transcript long enough to realistically
    stand in for a ~15-minute call (the duration the user reported broke)."""
    segments = []
    t = 0.0
    lines = [
        ("Agent", "Thank you for calling IT support, how can I help you today?"),
        ("Customer", "Hi, my laptop won't connect to the office VPN."),
    ]
    for i in range(80):
        speaker = "Agent" if i % 2 == 0 else "Customer"
        lines.append((speaker, f"Turn {i}: let's keep troubleshooting this VPN issue."))
    for speaker, text in lines:
        segments.append({"start": t, "end": t + 4.0, "text": f" {text}"})
        t += 4.0 + (minutes * 60 / len(lines))
    return segments, t


def test_large_transcript_from_a_long_call_still_produces_a_complete_report(
    client, db, employee, whisper, groq, mailer
):
    segments, total_seconds = _long_transcript_segments()
    whisper.result = {
        "text": " ".join(s["text"] for s in segments),
        "segments": segments,
    }
    assert total_seconds > 14 * 60  # sanity: this really simulates ~15 minutes

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "completed"
    row = rows(db)[0]
    assert row.processing_status == ProcessingStatus.COMPLETED
    assert row.analysis_json is not None
    assert row.pdf_path is not None
    assert len(mailer.sent) == 1


# ----------------------------------------------------------------------
# 4. Rate-limit failures (the actual observed production failure mode) get
#    a distinct, honest, retry-worthy message — not the generic one — and
#    never leave the record stuck mid-processing.
# ----------------------------------------------------------------------

def test_groq_rate_limit_is_a_distinct_honest_failure_and_retry_succeeds(
    client, db, employee, whisper, groq, mailer
):
    groq.error = _rate_limit_error()

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "capacity" in report["error"].lower()
    assert "api.groq.com" not in json.dumps(report)
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED

    # Never stuck: a retry after the rate limit clears must be able to
    # complete normally, exactly like any other retryable failure.
    groq.error = None
    retry = client.post(f"/upload/library/{record_id}/generate", headers=_auth(employee))
    assert retry.status_code == 200
    wait_for_pipeline()

    assert status_of(client, employee, record_id).json()["report"]["state"] == "completed"
    assert rows(db)[0].processing_status == ProcessingStatus.COMPLETED


def _auth(user):
    from conftest import auth_headers
    return auth_headers(user)


# ----------------------------------------------------------------------
# 5. A response truncated by the max_completion_tokens ceiling
#    (finish_reason == "length") is reported as a distinct, specific
#    failure rather than a generic "invalid analysis" message, and the
#    record is correctly marked FAILED (never stuck).
# ----------------------------------------------------------------------

def test_truncated_response_is_reported_specifically_not_generically(
    client, db, employee, whisper, groq, mailer, monkeypatch
):
    from types import SimpleNamespace

    original_create = groq._create

    def truncated_create(**kwargs):
        original_create(**kwargs)
        groq.calls[-1] = kwargs
        return SimpleNamespace(
            choices=[SimpleNamespace(
                message=SimpleNamespace(content='{"executive_summary": "cut off mid'),
                finish_reason="length",
            )]
        )

    monkeypatch.setattr(groq, "_create", truncated_create)
    groq.chat.completions.create = truncated_create

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "too long" in report["error"].lower()
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED


# ----------------------------------------------------------------------
# 6. HTTP 413 "Request too large" (confirmed live: a single long call's own
#    prompt+max_completion_tokens reservation can exceed the account's
#    entire per-minute capacity, independent of any other activity — the
#    SDK never retries this, unlike 429) gets the same honest "at capacity"
#    message as a 429, with its own distinct internal log reason.
# ----------------------------------------------------------------------

def _request_too_large_error():
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(
        status_code=413,
        request=request,
        json={"error": {"message": "Request too large for model `openai/gpt-oss-120b` "
                                    "on tokens per minute (TPM): Limit 8000, Requested 10594.",
                         "type": "tokens", "code": "rate_limit_exceeded"}},
    )
    from groq import APIStatusError
    return APIStatusError(message="rate_limit_exceeded", response=response, body=None)


def test_request_too_large_is_reported_like_capacity_not_generic_failure(
    client, db, employee, whisper, groq, mailer
):
    groq.error = _request_too_large_error()

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "capacity" in report["error"].lower()
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED


# ----------------------------------------------------------------------
# 7. Authentication failures (dead/invalid API key) and request timeouts
#    are reported distinctly from each other and from a generic failure —
#    retrying a dead key is futile and must not say otherwise.
# ----------------------------------------------------------------------

def test_authentication_failure_does_not_claim_retrying_will_help(
    client, db, employee, whisper, groq, mailer
):
    from groq import AuthenticationError

    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(
        status_code=401, request=request,
        json={"error": {"message": "Invalid API Key", "code": "invalid_api_key"}},
    )
    groq.error = AuthenticationError(message="invalid_api_key", response=response, body=None)

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "retry" not in report["error"].lower() and "try again" not in report["error"].lower()
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED


def test_timeout_is_reported_distinctly_from_capacity_and_auth_failures(
    client, db, employee, whisper, groq, mailer
):
    from groq import APITimeoutError

    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    groq.error = APITimeoutError(request=request)

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "too long to respond" in report["error"].lower()
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED


# ----------------------------------------------------------------------
# 8. Concurrency: two reports' Groq calls must never be in flight on the
#    real network at the same instant — confirmed live that two genuinely
#    concurrent ~16-minute calls can collide against the account's shared
#    TPM budget (one got a non-retryable 413, the other's AutoQA call got
#    a transient 429). The app-level fix is a lock around just the Groq
#    network call, verified here by two threads whose FakeGroq calls each
#    take a measurable moment and asserting they never overlap in time.
# ----------------------------------------------------------------------

def test_concurrent_groq_calls_are_serialized_not_simultaneous(groq, monkeypatch):
    import threading
    import time as time_module

    from app.core import groq_client

    intervals = []
    call_lock = threading.Lock()

    original_create = groq._create

    def slow_create(**kwargs):
        start = time_module.perf_counter()
        time_module.sleep(0.05)
        result = original_create(**kwargs)
        end = time_module.perf_counter()
        with call_lock:
            intervals.append((start, end))
        return result

    monkeypatch.setattr(groq, "_create", slow_create)
    groq.chat.completions.create = slow_create

    threads = [
        threading.Thread(target=groq_client.run_chat_json, args=(f"prompt {i}",))
        for i in range(3)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(intervals) == 3
    intervals.sort()
    for (start_a, end_a), (start_b, end_b) in zip(intervals, intervals[1:]):
        assert end_a <= start_b, "two Groq calls overlapped in time"
