from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Form,
    Depends,
    HTTPException,
    Query,
    status
)
from typing import List, Optional
from datetime import datetime, timedelta

from groq import (
    APIError as GroqAPIError,
    APITimeoutError as GroqTimeoutError,
    AuthenticationError as GroqAuthenticationError,
    RateLimitError as GroqRateLimitError,
)

from app.core import config
from app.services.transcription import (
    transcribe_audio,
    format_timestamped_transcript,
    is_meaningful_transcript
)
from app.core.groq_client import generate_summary, CALL_ANALYSIS_PROMPT_VERSION
from app.schemas.ai_analysis import (
    AnalysisValidationError,
    parse_analysis_response
)
from app.services.pdf_generator import generate_pdf_report
from app.services.email_delivery import deliver_report_email
from app.services.job_runner import failure_reasons, runner as job_runner
from app.services.pii_redaction import redact_text
from app.services.ai_execution_log import log_execution
from app.services.qa_engine import run_ai_qa_evaluation
from app.services.upload_validation import (
    UploadValidationError,
    sanitize_filename,
    sanitize_single_line,
    save_upload_stream,
    validate_upload
)
import logging
import time
import uuid
from app.core.dependencies import (
    employee_required,
    get_current_user,
    manager_required
)

from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db


from app.models.user import User, UserRole
from app.services.call_analysis_service import (
    IN_PROGRESS_STATUSES,
    PipelineBusyError,
    claim_for_processing,
    create_call_record,
    update_call_record,
    update_processing_status
)
from app.models.call_analysis import CallAnalysis, ProcessingStatus

import os

logger = logging.getLogger(__name__)

# ======================================================================
# HOW PROCESSING WORKS (request -> job -> status)
#
#   POST /upload/audio | /upload/manager/audio | /upload/library/{id}/generate
#       validate + store the audio, create the report row, atomically CLAIM it
#       (claim_for_processing: UPLOADING/FAILED/stale -> TRANSCRIBING), queue a
#       background job and return immediately with the report id(s).
#
#   background job (services/job_runner.py, its own DB session)
#       transcribe (once) -> AI analysis -> validate -> PDF -> COMPLETED
#       (+ email-delivery row, same commit) -> send email.
#
#   GET /upload/status[/{id}]
#       the frontend polls this until a report is completed / failed.
#
# The database status column is the single source of truth. All handlers are
# plain `def` (FastAPI threadpool), Whisper is serialized by a lock in
# services/transcription.py, and a report can only ever be claimed by one
# request at a time, so repeated clicks / retries cannot double-run it.
# ======================================================================

router = APIRouter(
    prefix="/upload",
    tags=["Upload"]
)

UPLOAD_DIR = "storage/audio"
REPORT_DIR = "storage/reports"

os.makedirs(
    UPLOAD_DIR,
    exist_ok=True
)

os.makedirs(
    REPORT_DIR,
    exist_ok=True
)

MAX_STATUS_IDS = 50


class _PipelineFailure(Exception):
    """A pipeline step failed for a reason that is safe to show the user."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _mark_failed(
    db: Session,
    record: CallAnalysis,
    message: str = failure_reasons.DEFAULT_MESSAGE
) -> None:
    """
    Record the user-safe reason, then set FAILED. Best effort: never let
    bookkeeping hide the original failure.
    """

    failure_reasons.set(record.id, message)

    try:
        db.rollback()

        update_processing_status(
            db=db,
            record=record,
            status=ProcessingStatus.FAILED
        )

    except Exception:
        logger.exception(
            "Could not mark record as FAILED"
        )


# ======================================================================
# The pipeline (runs in a background worker)
#
# Lifecycle (unchanged):
#   UPLOADING -> TRANSCRIBING -> AI_ANALYZING -> GENERATING_REPORT
#             -> COMPLETED | FAILED
#
# Order of side effects: transcribe once -> analyse -> validate -> PDF ->
# commit COMPLETED together with the email-delivery row -> send email. The
# email is only ever attempted after the report is safely stored, and its
# outcome is tracked durably (services/email_delivery.py).
# ======================================================================

def _execute_pipeline(
    record: CallAnalysis,
    db: Session
) -> bool:
    """
    Runs the pipeline on a record that has ALREADY been claimed
    (status TRANSCRIBING). Returns True if it ended COMPLETED.
    On any failure the record is set FAILED with a user-safe reason.
    """

    record_id = record.id
    audio_path = record.audio_path
    stored_filename = record.stored_filename
    incident_number = record.incident_number

    employee = getattr(record, "employee", None)
    employee_name = employee.full_name if employee is not None else None

    # Temporary, log-only timing breakdown (never persisted/DB-backed) — added
    # to diagnose a reported processing-speed regression. Each stage's own
    # duration is logged as it completes, plus one summary line at the end.
    pipeline_started = time.perf_counter()
    stage_times: dict[str, float] = {}

    try:

        # ---- 1. Transcribe (exactly once) --------------------------------

        stage_started = time.perf_counter()

        transcription = transcribe_audio(
            audio_path
        )

        stage_times["whisper_transcription"] = time.perf_counter() - stage_started

        transcript = transcription["text"]
        segments = transcription["segments"]
        call_duration = transcription["duration"]
        language = transcription.get("language")

        if not is_meaningful_transcript(transcript):
            raise _PipelineFailure(
                "No speech could be detected in this recording, "
                "so no report was generated."
            )

        timestamped_transcript = (
            format_timestamped_transcript(segments)
            or transcript
        )

        # ---- 1b. PII redaction (Pillar 2) ---------------------------------
        # The model only ever sees the redacted transcript; the original is
        # kept (as before) for the employee/manager UI and PDF.

        stage_started = time.perf_counter()

        redaction = redact_text(timestamped_transcript)

        stage_times["pii_redaction"] = time.perf_counter() - stage_started

        # ---- 2. AI analysis ----------------------------------------------

        stage_started = time.perf_counter()

        update_processing_status(
            db=db,
            record=record,
            status=ProcessingStatus.AI_ANALYZING
        )

        try:
            summary_result = generate_summary(
                redaction.text
            )
        except GroqRateLimitError:
            # Distinct from a generic API error: the account's Groq capacity
            # (tokens-per-minute) is temporarily exhausted — retrying shortly
            # genuinely helps, unlike other failures here. Tell the employee
            # that plainly instead of the generic message below.
            logger.exception(
                "Groq rate limit hit for record %s", record_id
            )
            log_execution(
                db,
                use_case="call_analysis",
                model="unknown",
                status="error",
                call_analysis_id=record_id,
                prompt_version=CALL_ANALYSIS_PROMPT_VERSION,
                error_reason="GroqRateLimitError"
            )
            raise _PipelineFailure(
                "The AI service is temporarily at capacity. "
                "Please retry this file in a minute."
            )
        except GroqTimeoutError:
            # The request itself timed out (REQUEST_TIMEOUT in groq_client.py)
            # rather than being rejected outright — still worth retrying, but
            # a distinct cause from capacity exhaustion or a dead credential.
            logger.exception(
                "Groq request timed out for record %s", record_id
            )
            log_execution(
                db,
                use_case="call_analysis",
                model="unknown",
                status="error",
                call_analysis_id=record_id,
                prompt_version=CALL_ANALYSIS_PROMPT_VERSION,
                error_reason="GroqTimeoutError"
            )
            raise _PipelineFailure(
                "The AI service took too long to respond. "
                "Please try again in a moment."
            )
        except GroqAuthenticationError:
            # Not retry-worthy like the cases above: a dead/invalid API key
            # will fail identically on every future attempt until an
            # operator fixes the credential, so the message must not imply
            # retrying will help.
            logger.exception(
                "Groq authentication failed for record %s", record_id
            )
            log_execution(
                db,
                use_case="call_analysis",
                model="unknown",
                status="error",
                call_analysis_id=record_id,
                prompt_version=CALL_ANALYSIS_PROMPT_VERSION,
                error_reason="GroqAuthenticationError"
            )
            raise _PipelineFailure(
                "The AI service is not configured correctly. "
                "Please contact support."
            )
        except GroqAPIError as exc:
            # HTTP 413 has no dedicated exception class in the SDK, and the
            # SDK never retries it (unlike 429/5xx) — it means this single
            # request's own prompt+max_completion_tokens reservation exceeds
            # the account's entire per-minute capacity by itself, confirmed
            # live with a real ~16-minute call. Distinct from a transient
            # 429: retrying the *same* request immediately cannot help, but
            # it is capacity-related like 429, not a generic failure, so it
            # gets the same honest "at capacity" message and its own log
            # reason for diagnosability.
            request_too_large = getattr(exc, "status_code", None) == 413
            logger.exception(
                "Groq request failed for record %s", record_id
            )
            log_execution(
                db,
                use_case="call_analysis",
                model="unknown",
                status="error",
                call_analysis_id=record_id,
                prompt_version=CALL_ANALYSIS_PROMPT_VERSION,
                error_reason="GroqRequestTooLarge" if request_too_large else "GroqAPIError"
            )
            if request_too_large:
                raise _PipelineFailure(
                    "The AI service is temporarily at capacity. "
                    "Please retry this file in a minute."
                )
            raise _PipelineFailure(
                "The AI service could not process this request. "
                "Please try again in a moment."
            )

        try:
            analysis = parse_analysis_response(summary_result["content"])
        except AnalysisValidationError as validation_error:
            # Field paths only — never the model output (contains call PII).
            logger.warning(
                "AI analysis rejected for record %s: %s",
                record_id,
                validation_error
            )
            # finish_reason == "length" means max_completion_tokens cut the
            # JSON off mid-object — a distinct, known cause from the model
            # simply returning malformed JSON, worth telling the employee
            # and logging separately rather than folding into the generic
            # "invalid analysis" bucket. Likewise, "not valid JSON at all"
            # (the model's text didn't parse) is a different failure from
            # "parsed fine but failed the Pydantic schema" (e.g. a score out
            # of range) — both are logged under their own reason so the two
            # are never conflated when diagnosing a run of failures.
            truncated = summary_result.get("finish_reason") == "length"
            malformed_json = validation_error.problems[:1] in (
                ["empty response"],
                ["response is not valid JSON"],
                ["response is not a JSON object"],
            )
            if truncated:
                error_reason = "AnalysisTruncated"
            elif malformed_json:
                error_reason = "AnalysisMalformedJSON"
            else:
                error_reason = "AnalysisSchemaInvalid"
            log_execution(
                db,
                use_case="call_analysis",
                model=summary_result["model"],
                status="error",
                call_analysis_id=record_id,
                prompt_version=CALL_ANALYSIS_PROMPT_VERSION,
                latency_ms=summary_result["latency_ms"],
                prompt_tokens=summary_result["prompt_tokens"],
                completion_tokens=summary_result["completion_tokens"],
                estimated_cost_usd=summary_result["estimated_cost_usd"],
                error_reason=error_reason
            )
            if truncated:
                raise _PipelineFailure(
                    "The AI's analysis was too long to complete for this "
                    "recording. Please retry — if this keeps happening, "
                    "the call may need to be processed in shorter segments."
                )
            raise _PipelineFailure(
                "The AI returned an invalid analysis. Please retry."
            )

        log_execution(
            db,
            use_case="call_analysis",
            model=summary_result["model"],
            status="success",
            call_analysis_id=record_id,
            prompt_version=CALL_ANALYSIS_PROMPT_VERSION,
            latency_ms=summary_result["latency_ms"],
            prompt_tokens=summary_result["prompt_tokens"],
            completion_tokens=summary_result["completion_tokens"],
            estimated_cost_usd=summary_result["estimated_cost_usd"]
        )

        stage_times["groq_call_analysis"] = time.perf_counter() - stage_started

        # ---- 3. PDF ------------------------------------------------------

        stage_started = time.perf_counter()

        update_processing_status(
            db=db,
            record=record,
            status=ProcessingStatus.GENERATING_REPORT
        )

        pdf_filename = (
            os.path.splitext(
                stored_filename
            )[0]
            + "_report.pdf"
        )

        pdf_path = os.path.join(
            REPORT_DIR,
            pdf_filename
        )

        generate_pdf_report(
            transcript,
            analysis,
            pdf_path,
            meta={
                "call_id": incident_number or f"CALL-{record_id}",
                "agent_name": employee_name or "N/A"
                # "generated_on" is filled with the real time by the generator
            },
            # Real Whisper segment timestamps, grouped into readable blocks
            # for the transcript's visual presentation — never re-derived or
            # re-transcribed, and never shown redacted (this mirrors the
            # existing behaviour of passing the original, unredacted
            # `transcript` string above).
            segments=segments,
        )

        stage_times["pdf_generation"] = time.perf_counter() - stage_started

        # ---- 4. Persist (COMPLETED + email-delivery row, one commit) -----

        stage_started = time.perf_counter()

        scorecard = analysis["confidence_scorecard"]

        update_call_record(
            db=db,
            record=record,
            transcript=transcript,
            analysis_json=analysis,
            pdf_path=pdf_path,
            confidence_score=scorecard["overall_call_confidence_score"],
            customer_score=scorecard["customer_experience_score"],
            agent_score=scorecard["agent_performance_score"],
            call_duration=call_duration,
            status=ProcessingStatus.COMPLETED,
            email_pending=True,
            language=language,
            redacted_transcript=redaction.text,
            pii_detected=redaction.detected,
            pii_findings=redaction.findings,
            disposition=analysis.get("disposition") or None
        )

        stage_times["persist_completed"] = time.perf_counter() - stage_started

        stage_times["pipeline_total"] = time.perf_counter() - pipeline_started

        logger.info(
            "Pipeline timing for record %s (seconds): %s",
            record_id,
            {k: round(v, 2) for k, v in stage_times.items()}
        )

        # ---- 5. AutoQA (Pillar 3) -----------------------------------------
        # The report is already COMPLETED (committed above), so AutoQA can
        # never be why the frontend's poll loop sees "processing" for longer.
        # It is queued as its OWN background job (Perf fix: previously ran
        # inline here, holding this worker thread through its whole Groq
        # call — ~7s measured for a realistic transcript — before it could
        # pick up the next queued upload/retry. Decoupling it frees this
        # worker immediately, without changing what AutoQA does or when a
        # human can see/override it; still exactly one evaluation per
        # completed report, still retryable via POST /qa/evaluations/{id}/rerun).
        job_runner.submit(_autoqa_job, record_id)

        return True

    except _PipelineFailure as failure:

        logger.info(
            "Pipeline timing for record %s up to failure (seconds): %s",
            record_id,
            {k: round(v, 2) for k, v in stage_times.items()}
        )

        _mark_failed(db, record, failure.message)

        return False

    except Exception:

        logger.exception(
            "Processing failed for record %s", record_id
        )

        logger.info(
            "Pipeline timing for record %s up to crash (seconds): %s",
            record_id,
            {k: round(v, 2) for k, v in stage_times.items()}
        )

        _mark_failed(
            db,
            record,
            "Audio processing failed. Please try again."
        )

        return False


def _autoqa_job(record_id: int) -> None:
    """
    Runs AutoQA for an already-COMPLETED report as its OWN queued job (see
    the comment at its call site in _execute_pipeline for why it was split
    out). Own DB session, same crash-isolation guarantee as before: a
    failure here only ever leaves the QAEvaluation row FAILED — it can never
    touch the call analysis record.
    """

    db = SessionLocal()

    try:
        record = db.get(CallAnalysis, record_id)

        if record is None:
            return

        started = time.perf_counter()

        try:
            run_ai_qa_evaluation(db, record)
        except Exception:
            logger.exception(
                "AutoQA evaluation crashed for record %s", record_id
            )

        logger.info(
            "AutoQA timing for record %s: %.2fs",
            record_id,
            time.perf_counter() - started
        )

    finally:
        db.close()


def _pipeline_job(record_id: int) -> None:
    """
    Background entry point: own DB session (the request's session is closed
    once the response is sent), run the pipeline, then attempt the email.
    """

    db = SessionLocal()

    try:

        record = db.get(CallAnalysis, record_id)

        if record is None:
            return

        completed = _execute_pipeline(record, db)

        if completed:

            # The report is stored; an email problem must never affect it.
            try:
                deliver_report_email(
                    record_id,
                    automatic=True,
                    db=db
                )
            except Exception:
                logger.exception(
                    "Email step crashed for report %s", record_id
                )

    except Exception:

        logger.exception(
            "Pipeline job crashed for record %s", record_id
        )

        try:
            record = db.get(CallAnalysis, record_id)

            if record is not None:
                _mark_failed(db, record)
        except Exception:
            logger.exception("Could not recover after a crashed job")

    finally:

        db.close()


def _start_pipeline(
    record: CallAnalysis,
    db: Session
) -> None:
    """
    Claim the record atomically and queue its background job.

    Raises PipelineBusyError if the record is already being processed or is
    already completed — that check IS the duplicate-run guard. FAILED records
    (intentional retry) and records stuck in progress past
    PIPELINE_STALE_MINUTES can be claimed again.
    """

    if not claim_for_processing(db, record.id):
        raise PipelineBusyError()

    # A retry must not show the previous attempt's reason.
    failure_reasons.clear(record.id)

    db.refresh(record)

    job_runner.submit(_pipeline_job, record.id)


# ======================================================================
# Response shaping
# ======================================================================

def _accepted_result(record: CallAnalysis) -> dict:

    return {
        "id": record.id,
        "original_filename": record.original_filename,
        "status": "accepted",
        "processing_status": record.processing_status.value,
        "created_at": record.created_at
    }


def _rejected_result(
    filename: Optional[str],
    message: str
) -> dict:

    return {
        "original_filename": sanitize_filename(filename) or "unknown",
        "status": "failed",
        "error": message
    }


def _batch_response(results: list) -> dict:

    accepted = sum(
        1 for r in results if r["status"] == "accepted"
    )
    rejected = len(results) - accepted

    if rejected == 0:
        overall = "accepted"
    elif accepted == 0:
        overall = "failed"
    else:
        overall = "partial_success"

    return {
        "status": overall,
        "message": f"{accepted} file(s) accepted for processing, {rejected} rejected.",
        "reports": results
    }


def _stalled(record: CallAnalysis) -> bool:
    """In progress for longer than PIPELINE_STALE_MINUTES: the run likely died."""

    if record.processing_status not in IN_PROGRESS_STATUSES:
        return False

    if record.updated_at is None:
        return False

    return record.updated_at < (
        datetime.utcnow()
        - timedelta(minutes=config.PIPELINE_STALE_MINUTES)
    )


def _status_item(record: CallAnalysis) -> dict:
    """
    What the frontend needs to poll. Deliberately contains no filesystem
    paths, exception text, stack traces or raw model output.
    """

    current = record.processing_status

    if current == ProcessingStatus.COMPLETED:
        state = "completed"
    elif current == ProcessingStatus.FAILED:
        state = "failed"
    else:
        state = "processing"

    item = {
        "id": record.id,
        "original_filename": record.original_filename,
        "processing_status": current.value,
        "state": state,
        "stalled": _stalled(record),
        "error": (
            failure_reasons.get(record.id)
            if state == "failed" else None
        ),
        "updated_at": record.updated_at
    }

    if state == "completed":
        item["confidence_score"] = record.confidence_score
        item["email_status"] = (
            record.email_delivery.status
            if record.email_delivery is not None else None
        )

    return item


def _visible_reports(
    db: Session,
    user: User,
    ids: List[int]
) -> List[CallAnalysis]:
    """Employees see only their own reports; managers see any."""

    query = db.query(CallAnalysis).filter(CallAnalysis.id.in_(ids))

    if user.role != UserRole.MANAGER:
        query = query.filter(CallAnalysis.employee_id == user.id)

    return query.order_by(CallAnalysis.id).all()


# ======================================================================
# File storage
# ======================================================================

def _save_audio_file(
    file: UploadFile,
    employee_id: int,
    incident_number: Optional[str],
    db: Session,
    source: str = "self_upload"
):
    """
    Validates and stores an audio file WITHOUT running the AI pipeline.
    Creates a CallAnalysis record with status UPLOADING, which we treat
    as "stored, awaiting processing".
    Returns (record, None) on success or (None, error_dict) on failure.
    """

    try:
        extension, display_name = validate_upload(file)
    except UploadValidationError as error:
        return None, _rejected_result(file.filename, str(error))

    unique_filename = (
        f"{uuid.uuid4()}{extension}"
    )

    file_path = os.path.join(
        UPLOAD_DIR,
        unique_filename
    )

    try:
        file_size = save_upload_stream(
            file.file,
            file_path,
            config.MAX_UPLOAD_MB * 1024 * 1024
        )
    except UploadValidationError as error:
        return None, _rejected_result(file.filename, str(error))

    try:

        record = create_call_record(
            db=db,
            employee_id=employee_id,
            original_filename=display_name,
            stored_filename=unique_filename,
            audio_path=file_path,
            file_size=file_size,
            source=source
        )

        incident_number = sanitize_single_line(incident_number, 100)

        if incident_number:
            record.incident_number = incident_number
            db.commit()
            db.refresh(record)

    except Exception:

        # Don't leave an orphaned file behind if the DB write failed.
        if os.path.exists(file_path):
            os.remove(file_path)

        raise

    return record, None


def _accept_files(
    files: List[UploadFile],
    employee_id: int,
    db: Session,
    source: str = "self_upload"
) -> list:
    """
    Store every file, then queue each accepted one for background
    processing. Each file gets its own report id / status; one bad file
    never affects the others.
    """

    results = []

    for file in files:

        record, error = _save_audio_file(
            file=file,
            employee_id=employee_id,
            incident_number=None,
            db=db,
            source=source
        )

        if error:
            results.append(error)
            continue

        try:
            _start_pipeline(record, db)
        except PipelineBusyError:
            # Cannot happen for a brand-new record; report it, don't crash.
            results.append(
                _rejected_result(
                    record.original_filename,
                    "This file could not be queued for processing."
                )
            )
            continue

        results.append(_accepted_result(record))

    return results


# ======================================================================
# Endpoints
# ======================================================================

@router.post("/audio")
def upload_audio(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(employee_required),
    db: Session = Depends(get_db)
):
    """
    Accepts one or more audio files, stores them, and returns IMMEDIATELY
    with one item per file. Processing continues in the background; poll
    GET /upload/status?ids=... for the outcome.

    Each item: {"id", "original_filename", "status": "accepted",
    "processing_status"} or, for a file rejected before it was stored,
    {"original_filename", "status": "failed", "error"} (no id).
    """

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were uploaded."
        )

    return _batch_response(
        _accept_files(files, current_user.id, db)
    )


@router.get("/status")
def get_processing_status(
    ids: str = Query(
        ...,
        description="Comma-separated report ids (max 50)"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Processing status for several reports at once (batch polling).
    Employees only see their own reports; ids that do not exist or are not
    visible are simply absent from `reports`.
    """

    try:
        wanted = sorted({int(part) for part in ids.split(",") if part.strip()})
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ids must be a comma-separated list of integers."
        )

    if not wanted or len(wanted) > MAX_STATUS_IDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Provide between 1 and {MAX_STATUS_IDS} report ids."
        )

    return {
        "status": "success",
        "reports": [
            _status_item(r)
            for r in _visible_reports(db, current_user, wanted)
        ]
    }


@router.get("/status/{report_id}")
def get_report_processing_status(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Processing status of one report (employee: own; manager: any)."""

    reports = _visible_reports(db, current_user, [report_id])

    if not reports:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found."
        )

    return {
        "status": "success",
        "report": _status_item(reports[0])
    }


# ======================================================================
# Audio Library endpoints (two-step flow)
# Step 1: store the file only (no AI processing yet)
# Step 2: pick a stored file later and generate its report on demand
#         (also the retry path for a FAILED report)
# ======================================================================

@router.post("/library")
def upload_to_library(
    files: List[UploadFile] = File(...),
    incident_number: Optional[str] = Form(None, max_length=100),
    current_user: User = Depends(employee_required),
    db: Session = Depends(get_db)
):
    """
    Stores one or more audio files WITHOUT processing them.
    """

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were uploaded."
        )

    results = []

    for file in files:

        record, error = _save_audio_file(
            file=file,
            employee_id=current_user.id,
            incident_number=incident_number,
            db=db,
            source="library_generate"
        )

        if error:
            results.append(error)
            continue

        results.append({
            "id": record.id,
            "original_filename": record.original_filename,
            "incident_number": record.incident_number,
            "file_size": record.file_size,
            "processing_status": record.processing_status.value,
            "created_at": record.created_at,
            "status": "stored"
        })

    return {
        "status": "success",
        "files": results
    }


@router.get("/library")
def get_audio_library(
    pending_only: bool = False,
    current_user: User = Depends(employee_required),
    db: Session = Depends(get_db)
):
    """
    Lists the current employee's uploaded audio files.
    - pending_only=true  -> only files awaiting processing.
    - pending_only=false -> every file regardless of status.
    """

    query = db.query(CallAnalysis).filter(
        CallAnalysis.employee_id == current_user.id
    )

    if pending_only:
        query = query.filter(
            CallAnalysis.processing_status == ProcessingStatus.UPLOADING
        )

    records = query.order_by(
        CallAnalysis.created_at.desc()
    ).all()

    return {
        "status": "success",
        "files": [
            {
                "id": r.id,
                "original_filename": r.original_filename,
                "incident_number": r.incident_number,
                "file_size": r.file_size,
                "processing_status": r.processing_status.value,
                "confidence_score": r.confidence_score,
                "customer_score": r.customer_score,
                "agent_score": r.agent_score,
                "created_at": r.created_at
            }
            for r in records
        ]
    }


@router.post("/library/{record_id}/generate")
def generate_report_from_library(
    record_id: int,
    current_user: User = Depends(employee_required),
    db: Session = Depends(get_db)
):
    """
    Starts the AI pipeline for a stored file and returns immediately (poll
    GET /upload/status/{id}). Works for files that were never processed and
    for FAILED ones (retry).

    409 if the file is already being processed (e.g. a repeated click);
    400 if its report already exists.
    """

    record = (
        db.query(CallAnalysis)
        .filter(
            CallAnalysis.id == record_id,
            CallAnalysis.employee_id == current_user.id
        )
        .first()
    )

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio file not found."
        )

    if record.processing_status == ProcessingStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This report has already been generated."
        )

    try:
        _start_pipeline(record, db)
    except PipelineBusyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This file is already being processed."
        )

    return {
        "status": "accepted",
        "report": _accepted_result(record)
    }


@router.post("/manager/audio")
def manager_upload_audio(
    employee_id: int = Form(...),
    files: List[UploadFile] = File(...),
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db)
):
    """
    Manager uploads audio on behalf of an employee. Same job/status model as
    /upload/audio (returns immediately; poll /upload/status), but the reports
    belong to the employee picked by the manager.
    """

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were uploaded."
        )

    employee = db.query(User).filter(User.id == employee_id).first()

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found."
        )

    return _batch_response(
        _accept_files(files, employee.id, db, source="manager_upload")
    )
