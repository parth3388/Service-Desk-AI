"""
Upload -> background pipeline -> status polling -> DB.

Since Issue 1 (long HTTP requests): upload endpoints ACCEPT the file and
return immediately; the AI pipeline (Whisper -> Groq -> PDF -> DB -> email)
runs in a background worker (services/job_runner.py). The frontend is
expected to poll GET /upload/status[/​{id}] until "completed"/"failed".
"""

import inspect
import json
import threading
import time
from datetime import datetime, timedelta

import httpx
import pytest
from groq import APIConnectionError

import app.api.upload as upload_module
from app.core.database import SessionLocal
from app.main import app
from app.models.call_analysis import CallAnalysis, ProcessingStatus
from app.models.email_delivery import EmailStatus
from app.models.user import UserRole
from app.services.call_analysis_service import claim_for_processing, create_call_record
from conftest import (
    audio_files,
    auth_headers,
    make_user,
    valid_analysis,
    wait_for_pipeline,
)

WAV = ("call.wav", "audio/wav")


def upload(client, user, *specs):
    return client.post(
        "/upload/audio",
        files=audio_files(*specs),
        headers=auth_headers(user),
    )


def rows(db):
    db.expire_all()
    return db.query(CallAnalysis).order_by(CallAnalysis.id).all()


def store(client, user, name="call.wav"):
    """Store a file WITHOUT processing it; returns the new record id."""
    response = client.post(
        "/upload/library",
        files=audio_files((name, "audio/wav")),
        headers=auth_headers(user),
    )
    return response.json()["files"][0]["id"]


def generate(client, user, record_id):
    return client.post(
        f"/upload/library/{record_id}/generate", headers=auth_headers(user)
    )


def status_of(client, user, record_id):
    response = client.get(f"/upload/status/{record_id}", headers=auth_headers(user))
    return response


def upload_and_wait(client, user, *specs):
    """Upload, drain the background job, return the accept-time response."""
    response = upload(client, user, *specs)
    wait_for_pipeline()
    return response


def raiser(exc):
    def _raise():
        raise exc

    return _raise


def raiser_with_args(exc):
    def _raise(*args, **kwargs):
        raise exc

    return _raise


# ----------------------------------------------------------------------
# Issue 1 — the request does not wait for the pipeline
# ----------------------------------------------------------------------

def test_upload_endpoints_are_not_coroutines_so_they_run_in_the_threadpool():
    for endpoint in (
        upload_module.upload_audio,
        upload_module.upload_to_library,
        upload_module.generate_report_from_library,
        upload_module.manager_upload_audio,
    ):
        assert not inspect.iscoroutinefunction(endpoint), endpoint.__name__


def test_upload_returns_before_the_pipeline_has_finished(client, employee, whisper, groq, mailer):
    entered = threading.Event()
    release = threading.Event()
    whisper.side_effect = lambda: (entered.set(), release.wait(15))

    response = upload(client, employee, WAV)   # must NOT block on the job

    assert response.status_code == 200
    assert entered.wait(2), "the background job never started"

    body = response.json()
    assert body["status"] == "accepted"
    (item,) = body["reports"]
    assert item["status"] == "accepted"
    assert item["processing_status"] == "TRANSCRIBING"   # claimed synchronously
    assert "confidence_score" not in item                # the pipeline hasn't run yet
    assert groq.calls == [] and mailer.sent == []         # nothing downstream has happened

    release.set()
    wait_for_pipeline()


def test_the_request_thread_claims_the_record_before_returning(client, db, employee, whisper):
    """The claim (UPLOADING -> TRANSCRIBING) happens synchronously in the
    request, so a duplicate request right after the response is already
    correctly rejected — it does not depend on the job having started."""
    release = threading.Event()
    whisper.side_effect = lambda: release.wait(15)

    response = upload(client, employee, WAV)
    record_id = response.json()["reports"][0]["id"]

    row = db.query(CallAnalysis).get(record_id)
    assert row.processing_status == ProcessingStatus.TRANSCRIBING  # claimed already

    assert generate(client, employee, record_id).status_code == 409  # busy, not COMPLETED

    release.set()
    wait_for_pipeline()


def test_slow_pipeline_does_not_block_the_event_loop(employee, whisper):
    """
    A many-minutes-long pipeline run must not freeze unrelated requests.

    This is now doubly true: the upload request itself returns almost
    instantly (Issue 1), and even the brief moment it IS on the event loop
    (queuing the job) must not block other requests — proven with a real
    ASGI transport, not just by checking the handler isn't `async def`.
    """
    import asyncio

    entered = threading.Event()
    release = threading.Event()
    whisper.side_effect = lambda: (entered.set(), release.wait(15))

    async def measure():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:

            task = asyncio.create_task(
                ac.post(
                    "/upload/audio",
                    files=audio_files(WAV),
                    headers=auth_headers(employee),
                )
            )

            deadline = time.monotonic() + 15
            while not entered.is_set() and time.monotonic() < deadline:
                await asyncio.sleep(0.02)
            assert entered.is_set(), "pipeline never reached transcription"

            started = time.perf_counter()
            health = await ac.get("/")
            latency = time.perf_counter() - started

            response = await task
            return latency, health.status_code, response

    latency, health_status, response = asyncio.run(measure())

    release.set()
    wait_for_pipeline()

    assert health_status == 200
    assert latency < 0.5, f"event loop was blocked for {latency:.2f}s"
    assert response.json()["reports"][0]["status"] == "accepted"


# ----------------------------------------------------------------------
# Success paths
# ----------------------------------------------------------------------

def test_successful_single_upload(client, db, employee, whisper, groq, mailer, storage):
    response = upload_and_wait(client, employee, WAV)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "accepted"

    (accepted,) = body["reports"]
    assert accepted["status"] == "accepted"
    assert isinstance(accepted["id"], int) and accepted["id"] > 0

    (row,) = rows(db)
    assert row.id == accepted["id"]
    assert row.processing_status == ProcessingStatus.COMPLETED
    assert row.analysis_json["executive_summary"]
    assert row.confidence_score == 87.0
    assert row.transcript.startswith("Hello this is support")
    assert (storage.reports / (row.stored_filename.rsplit(".", 1)[0] + "_report.pdf")).exists()

    assert len(mailer.sent) == 1
    assert mailer.sent[0]["to"] == employee.email

    final = status_of(client, employee, accepted["id"]).json()["report"]
    assert final["state"] == "completed"
    assert final["processing_status"] == "COMPLETED"
    assert final["confidence_score"] == 87.0
    assert final["email_status"] == EmailStatus.SENT


def test_exactly_one_whisper_call_per_upload(client, employee, whisper, groq):
    upload_and_wait(client, employee, WAV)

    assert whisper.calls == 1
    # 2 Groq calls per completed report: call analysis + AutoQA evaluation.
    assert len(groq.calls) == 2


def test_the_llm_receives_the_timestamped_transcript_from_that_one_transcription(
    client, employee, whisper, groq
):
    upload_and_wait(client, employee, WAV)

    prompt = groq.calls[0]["messages"][0]["content"]
    assert "[00:00:00 - 00:00:03]\nHello this is support." in prompt
    assert "[00:00:03 - 00:00:06]\nHow can I help you today?" in prompt


def test_successful_batch_upload(client, db, employee, whisper, groq, mailer):
    response = upload_and_wait(client, employee, ("a.wav", "audio/wav"), ("b.mp3", "audio/mpeg"))

    body = response.json()
    assert body["status"] == "accepted"
    assert [r["status"] for r in body["reports"]] == ["accepted", "accepted"]
    assert len({r["id"] for r in body["reports"]}) == 2

    assert whisper.calls == 2
    # 2 Groq calls per completed report: call analysis + AutoQA evaluation.
    assert len(groq.calls) == 4
    assert len(mailer.sent) == 2
    assert all(r.processing_status == ProcessingStatus.COMPLETED for r in rows(db))


def test_batch_with_one_bad_file_is_partial_and_the_bad_item_is_marked_failed(
    client, employee, whisper
):
    response = upload_and_wait(client, employee, ("a.wav", "audio/wav"), ("b.ogg", "audio/ogg"))

    body = response.json()
    assert body["status"] == "partial_success"

    good, bad = body["reports"]
    assert good["status"] == "accepted" and good["id"]
    assert bad["status"] == "failed"
    assert "Unsupported audio format" in bad["error"]
    assert "id" not in bad  # nothing was stored, so nothing to retry/poll

    assert whisper.calls == 1


def test_manager_upload_for_employee_processes_and_emails_the_employee(
    client, db, employee, manager, whisper, mailer
):
    response = client.post(
        "/upload/manager/audio",
        data={"employee_id": str(employee.id)},
        files=audio_files(WAV),
        headers=auth_headers(manager),
    )
    wait_for_pipeline()

    (report,) = response.json()["reports"]
    assert report["status"] == "accepted"
    assert rows(db)[0].employee_id == employee.id
    assert mailer.sent[0]["to"] == employee.email


# ----------------------------------------------------------------------
# GET /upload/status — polling contract
# ----------------------------------------------------------------------

def test_status_reports_processing_while_the_job_is_running(client, employee, whisper):
    entered = threading.Event()
    release = threading.Event()
    whisper.side_effect = lambda: (entered.set(), release.wait(15))

    record_id = upload(client, employee, WAV).json()["reports"][0]["id"]
    assert entered.wait(2)

    mid = status_of(client, employee, record_id).json()["report"]
    assert mid["state"] == "processing"
    assert mid["processing_status"] in ("TRANSCRIBING", "AI_ANALYZING", "GENERATING_REPORT")
    assert mid["stalled"] is False
    assert "confidence_score" not in mid

    release.set()
    wait_for_pipeline()

    done = status_of(client, employee, record_id).json()["report"]
    assert done["state"] == "completed"


def test_status_reports_completed(client, employee):
    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    body = status_of(client, employee, record_id).json()
    assert body["status"] == "success"
    report = body["report"]
    assert report["state"] == "completed"
    assert report["processing_status"] == "COMPLETED"
    assert isinstance(report["confidence_score"], float)


def test_status_reports_failed_with_a_safe_message(client, employee, groq):
    groq.content = "not json"

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert report["processing_status"] == "FAILED"
    assert "invalid analysis" in report["error"]
    assert "not json" not in json.dumps(report)   # no raw model output leaked


def test_status_batch_endpoint_returns_several_reports_at_once(client, employee):
    ids = []
    for name in ("a.wav", "b.wav"):
        r = upload(client, employee, (name, "audio/wav"))
        ids.append(r.json()["reports"][0]["id"])
    wait_for_pipeline()

    response = client.get(f"/upload/status?ids={ids[0]},{ids[1]}", headers=auth_headers(employee))

    assert response.status_code == 200
    reported = {r["id"]: r["state"] for r in response.json()["reports"]}
    assert reported == {ids[0]: "completed", ids[1]: "completed"}


def test_status_batch_endpoint_rejects_bad_or_too_many_ids(client, employee):
    assert client.get("/upload/status?ids=abc", headers=auth_headers(employee)).status_code == 422
    assert client.get("/upload/status?ids=", headers=auth_headers(employee)).status_code == 422

    too_many = ",".join(str(n) for n in range(1, 60))
    assert client.get(f"/upload/status?ids={too_many}", headers=auth_headers(employee)).status_code == 422


def test_status_hides_reports_that_are_not_the_caller_s(client, db, employee):
    other = make_user(db, "other@example.com", UserRole.EMPLOYEE)
    other_id = store(client, other)

    assert status_of(client, employee, other_id).status_code == 404

    body = client.get(f"/upload/status?ids={other_id}", headers=auth_headers(employee)).json()
    assert body["reports"] == []


def test_status_never_exposes_paths_or_raw_exceptions(client, employee, whisper):
    whisper.side_effect = raiser(RuntimeError("C:/secret/server/path exploded"))

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    text = status_of(client, employee, record_id).text
    assert "secret" not in text and "RuntimeError" not in text


def test_manager_can_poll_any_employee_s_status(client, db, employee, manager):
    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    response = status_of(client, manager, record_id)

    assert response.status_code == 200
    assert response.json()["report"]["state"] == "completed"


# ----------------------------------------------------------------------
# Failure paths (all must be explicit failures, never fake successes)
# ----------------------------------------------------------------------

@pytest.mark.parametrize(
    "transcript",
    [
        {"text": "", "segments": []},
        {"text": "   \n ", "segments": []},
        {"text": "... ... ...", "segments": [{"start": 0, "end": 1, "text": "..."}]},
        {"text": "Thank you.", "segments": [{"start": 0, "end": 1, "text": "Thank you."}]},
    ],
    ids=["empty", "whitespace", "punctuation-only", "two-words"],
)
def test_empty_or_meaningless_transcript_never_reaches_the_llm(
    client, db, employee, whisper, groq, mailer, transcript
):
    whisper.result = transcript

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "No speech could be detected" in report["error"]

    assert groq.calls == []
    assert mailer.sent == []
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED
    assert rows(db)[0].analysis_json is None


def test_malformed_ai_json_fails_cleanly(client, db, employee, groq, mailer, storage):
    groq.content = "this is not json"

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "invalid analysis" in report["error"]
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED
    assert mailer.sent == []
    assert list(storage.reports.iterdir()) == []  # no PDF generated


@pytest.mark.parametrize(
    "content",
    [
        json.dumps(valid_analysis(confidence_scorecard=None)),
        json.dumps(valid_analysis(confidence_scorecard={
            "customer_experience_score": 150,
            "agent_performance_score": 1,
            "overall_call_confidence_score": 1,
        })),
        json.dumps(valid_analysis(executive_summary=None)),
        json.dumps([valid_analysis()]),
    ],
    ids=["null-scorecard", "score-out-of-range", "null-summary", "json-array"],
)
def test_invalid_ai_output_never_reaches_pdf_db_or_email(
    client, db, employee, groq, mailer, storage, content
):
    groq.content = content

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    row = rows(db)[0]
    assert row.processing_status == ProcessingStatus.FAILED
    assert row.analysis_json is None and row.pdf_path is None
    assert mailer.sent == []
    assert list(storage.reports.iterdir()) == []


def test_groq_outage_is_a_friendly_failure_and_retry_succeeds(
    client, db, employee, whisper, groq, mailer
):
    groq.error = APIConnectionError(request=httpx.Request("POST", "https://api.groq.com/x"))

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "AI service" in report["error"]
    assert "api.groq.com" not in json.dumps(report)
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED

    # Intentional retry path: the failed item's id goes to the generate endpoint.
    groq.error = None
    retry = generate(client, employee, record_id)
    assert retry.status_code == 200
    assert retry.json()["report"]["status"] == "accepted"
    wait_for_pipeline()

    assert status_of(client, employee, record_id).json()["report"]["state"] == "completed"
    assert rows(db)[0].processing_status == ProcessingStatus.COMPLETED
    assert len(mailer.sent) == 1  # the failed attempt never emailed

    # The failed attempt never reached AutoQA (it happens after COMPLETED),
    # so the successful retry must produce exactly ONE QA evaluation —
    # never zero, never a duplicate from some retry interaction.
    from app.models.qa import QAEvaluation

    evaluations = db.query(QAEvaluation).filter(QAEvaluation.call_analysis_id == record_id).all()
    assert len(evaluations) == 1
    assert evaluations[0].version_number == 1
    assert evaluations[0].status == "COMPLETED"


def test_unexpected_errors_do_not_leak_internals_to_the_client(
    client, db, employee, whisper
):
    whisper.side_effect = raiser(RuntimeError("C:/secret/server/path exploded"))

    response = upload_and_wait(client, employee, WAV)

    assert response.status_code == 200
    assert "secret" not in response.text
    record_id = response.json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["error"] == "Audio processing failed. Please try again."
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED


def test_db_failure_while_saving_the_report_means_no_email(
    client, db, employee, mailer, monkeypatch
):
    monkeypatch.setattr(upload_module, "update_call_record", raiser_with_args(RuntimeError("db exploded")))

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "db exploded" not in json.dumps(report)
    assert mailer.sent == []  # email is only sent AFTER the report is stored
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED


def test_pdf_generation_failure_fails_cleanly_and_a_retry_recovers(
    client, db, employee, groq, mailer, monkeypatch
):
    """PDF generation failing before the report is stored must not leave a
    partial report, must not run AutoQA, and must not block a later retry."""
    from app.models.qa import QAEvaluation

    monkeypatch.setattr(
        upload_module, "generate_pdf_report", raiser_with_args(RuntimeError("pdf backend exploded"))
    )

    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "failed"
    assert "pdf backend exploded" not in json.dumps(report)
    assert rows(db)[0].processing_status == ProcessingStatus.FAILED
    assert mailer.sent == []

    # A failed-before-COMPLETED run must never have triggered AutoQA.
    assert db.query(QAEvaluation).filter(QAEvaluation.call_analysis_id == record_id).count() == 0

    # Fix the fault and retry: the original audio is still there, so the
    # retry must complete normally with exactly one QA evaluation. Restore
    # the real function directly (not monkeypatch.undo(), which would also
    # revert the other autouse fixtures' patches for this same test, e.g.
    # the fake Whisper/Groq/mailer).
    from app.services.pdf_generator import generate_pdf_report as real_generate_pdf_report

    monkeypatch.setattr(upload_module, "generate_pdf_report", real_generate_pdf_report)
    retry = generate(client, employee, record_id)
    assert retry.status_code == 200
    wait_for_pipeline()

    assert status_of(client, employee, record_id).json()["report"]["state"] == "completed"
    assert len(mailer.sent) == 1
    evaluations = db.query(QAEvaluation).filter(QAEvaluation.call_analysis_id == record_id).all()
    assert len(evaluations) == 1


# ----------------------------------------------------------------------
# Email ordering / duplicates
# ----------------------------------------------------------------------

def test_email_is_sent_only_after_the_report_is_committed(client, employee, mailer):
    upload_and_wait(client, employee, WAV)

    assert mailer.status_at_send == ["COMPLETED"]


def test_email_failure_is_reported_but_keeps_the_stored_report(
    client, db, employee, mailer
):
    mailer.error = RuntimeError("smtp is down")

    response = upload_and_wait(client, employee, WAV)
    record_id = response.json()["reports"][0]["id"]

    report = status_of(client, employee, record_id).json()["report"]
    assert report["state"] == "completed"       # the report exists and is usable
    assert report["email_status"] == EmailStatus.FAILED
    assert "smtp is down" not in status_of(client, employee, record_id).text
    assert rows(db)[0].processing_status == ProcessingStatus.COMPLETED


def test_completed_report_cannot_be_regenerated_or_emailed_again(
    client, employee, whisper, groq, mailer
):
    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]

    again = generate(client, employee, record_id)

    assert again.status_code == 400
    assert whisper.calls == 1 and len(groq.calls) == 2 and len(mailer.sent) == 1


# ----------------------------------------------------------------------
# Concurrency / idempotency guard
# ----------------------------------------------------------------------

def test_claim_is_atomic_only_one_of_many_threads_wins(db, employee):
    record = create_call_record(
        db=db, employee_id=employee.id, original_filename="a.wav",
        stored_filename="a.wav", audio_path="a.wav", file_size=1,
    )
    outcomes = []
    barrier = threading.Barrier(8)

    def worker():
        session = SessionLocal()
        try:
            barrier.wait()
            outcomes.append(claim_for_processing(session, record.id))
        finally:
            session.close()

    threads = [threading.Thread(target=worker) for _ in range(8)]
    [t.start() for t in threads]
    [t.join(30) for t in threads]

    assert len(outcomes) == 8
    assert outcomes.count(True) == 1


def test_repeated_generate_while_running_gets_409_and_runs_the_pipeline_once(
    client, employee, whisper, groq, mailer
):
    record_id = store(client, employee)
    entered, release = threading.Event(), threading.Event()
    whisper.side_effect = lambda: (entered.set(), release.wait(15))

    first = generate(client, employee, record_id)
    assert entered.wait(15), "the pipeline never started"
    assert first.status_code == 200 and first.json()["report"]["status"] == "accepted"

    duplicate = generate(client, employee, record_id)
    assert duplicate.status_code == 409

    release.set()
    wait_for_pipeline()

    assert status_of(client, employee, record_id).json()["report"]["state"] == "completed"
    assert whisper.calls == 1
    assert len(groq.calls) == 2
    assert len(mailer.sent) == 1


def test_burst_of_concurrent_generate_requests_yields_one_run(
    client, employee, whisper, groq, mailer
):
    from fastapi.testclient import TestClient

    record_id = store(client, employee)
    whisper.side_effect = lambda: time.sleep(0.3)
    codes = []

    def request():
        codes.append(generate(TestClient(app), employee, record_id).status_code)

    threads = [threading.Thread(target=request) for _ in range(5)]
    [t.start() for t in threads]
    [t.join(60) for t in threads]
    wait_for_pipeline()

    assert len(codes) == 5
    assert codes.count(200) == 1
    assert set(codes) <= {200, 400, 409}
    assert whisper.calls == 1 and len(groq.calls) == 2 and len(mailer.sent) == 1


def test_fresh_in_progress_record_is_busy(client, db, employee, whisper):
    record_id = store(client, employee)
    row = db.query(CallAnalysis).get(record_id)
    row.processing_status = ProcessingStatus.AI_ANALYZING
    db.commit()

    response = generate(client, employee, record_id)

    assert response.status_code == 409
    assert whisper.calls == 0


def test_record_stuck_in_progress_for_too_long_can_be_reclaimed(
    client, db, employee, whisper
):
    record_id = store(client, employee)
    db.query(CallAnalysis).filter(CallAnalysis.id == record_id).update(
        {
            "processing_status": ProcessingStatus.TRANSCRIBING,
            "updated_at": datetime.utcnow() - timedelta(hours=3),
        }
    )
    db.commit()

    response = generate(client, employee, record_id)
    wait_for_pipeline()

    assert response.status_code == 200
    assert status_of(client, employee, record_id).json()["report"]["state"] == "completed"
    assert whisper.calls == 1


def test_failed_record_can_be_retried_after_the_cause_is_fixed(
    client, db, employee, whisper, groq
):
    whisper.result = {"text": "", "segments": []}
    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]
    assert status_of(client, employee, record_id).json()["report"]["state"] == "failed"

    whisper.result = {
        "text": "Hello this is support how can I help",
        "segments": [{"start": 0, "end": 2, "text": "Hello this is support how can I help"}],
    }
    retry = generate(client, employee, record_id)
    wait_for_pipeline()

    assert retry.json()["report"]["status"] == "accepted"
    assert status_of(client, employee, record_id).json()["report"]["state"] == "completed"
    assert rows(db)[0].processing_status == ProcessingStatus.COMPLETED
    assert len(rows(db)) == 1  # retried the same record, no duplicate row


def test_a_retry_clears_the_previous_failure_reason(client, employee, whisper, groq):
    whisper.result = {"text": "", "segments": []}
    record_id = upload_and_wait(client, employee, WAV).json()["reports"][0]["id"]
    assert "No speech" in status_of(client, employee, record_id).json()["report"]["error"]

    whisper.result = {
        "text": "Hello this is support how can I help",
        "segments": [{"start": 0, "end": 2, "text": "Hello this is support how can I help"}],
    }
    generate(client, employee, record_id)
    wait_for_pipeline()

    assert status_of(client, employee, record_id).json()["report"]["error"] is None


def test_cannot_generate_someone_elses_recording(client, db, employee):
    other = make_user(db, "other@example.com", UserRole.EMPLOYEE)
    record_id = store(client, other)

    assert generate(client, employee, record_id).status_code == 404


def test_two_uploads_of_the_same_employee_are_accepted_independently(
    client, db, employee, whisper
):
    """
    A second upload made while the first is still queued must not be
    rejected, merged into the first, or wait for it at the HTTP layer — it
    gets its own report id and is claimed (TRANSCRIBING) independently.

    It will still, correctly, wait its turn at the actual transcription
    step: Whisper itself is not thread-safe, so services/transcription.py
    serializes real transcribe() calls with a lock, which this test does
    not fight — it only asserts both complete once the first is released.
    """
    entered_first = threading.Event()
    release_first = threading.Event()
    calls = {"n": 0}

    def side_effect():
        calls["n"] += 1
        if calls["n"] == 1:
            entered_first.set()
            release_first.wait(15)

    whisper.side_effect = side_effect

    r1 = upload(client, employee, ("a.wav", "audio/wav"))
    assert entered_first.wait(2)
    assert r1.json()["reports"][0]["status"] == "accepted"

    r2 = upload(client, employee, ("b.wav", "audio/wav"))   # must not be blocked by r1
    assert r2.status_code == 200
    item2 = r2.json()["reports"][0]
    assert item2["status"] == "accepted"
    assert item2["processing_status"] == "TRANSCRIBING"     # claimed independently

    id1, id2 = r1.json()["reports"][0]["id"], item2["id"]
    assert id1 != id2

    release_first.set()
    wait_for_pipeline()

    assert status_of(client, employee, id1).json()["report"]["state"] == "completed"
    assert status_of(client, employee, id2).json()["report"]["state"] == "completed"
    assert whisper.calls == 2
