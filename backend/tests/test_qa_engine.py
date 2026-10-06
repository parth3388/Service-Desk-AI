"""
AutoQA scoring engine (Pillar 3): configurable scorecard, deterministic
weighted scoring (never trusting the LLM's own total), and evidence
verification (Pillar 3's "no invented evidence" rule).
"""

import json

from app.core import groq_client
from app.models.call_analysis import CallAnalysis, ProcessingStatus
from app.models.qa import QACriterionResult, QAEvaluation
from app.models.user import UserRole
from app.services.qa_defaults import ensure_default_scorecard
from app.services.qa_engine import (
    apply_human_override,
    compute_calibration_metrics,
    compute_weighted_score,
    get_latest_evaluation,
    list_evaluation_history,
    run_ai_qa_evaluation,
)
from conftest import make_user


def qa_response(items):
    """items: list of (criterion_id, score, pass_, evidence_quote)"""
    return json.dumps(
        {
            "criteria": [
                {
                    "criterion_id": criterion_id,
                    "score": score,
                    "pass": pass_,
                    "confidence": 90,
                    "rationale": "Because of what happened on the call.",
                    "evidence_quote": evidence_quote,
                    "evidence_segment": "00:00:01 - 00:00:02",
                }
                for criterion_id, score, pass_, evidence_quote in items
            ]
        }
    )


def make_record(db, employee, transcript="Hello, thanks for calling support."):
    record = CallAnalysis(
        employee_id=employee.id,
        original_filename="a.wav",
        stored_filename="a.wav",
        audio_path="a.wav",
        file_size=1,
        transcript=transcript,
        redacted_transcript=transcript,
        processing_status=ProcessingStatus.COMPLETED,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def all_criterion_ids(version):
    return [c.id for section in version.sections for c in section.criteria]


# ----------------------------------------------------------------------
# Deterministic weighted scoring (pure function)
# ----------------------------------------------------------------------

def test_weighted_score_matches_hand_calculation(db):
    version = ensure_default_scorecard(db)

    scores = {}
    passes = {}
    for section in version.sections:
        for criterion in section.criteria:
            scores[criterion.id] = 80.0
            passes[criterion.id] = True if criterion.is_critical else None

    total, passed = compute_weighted_score(version, scores, passes)

    # Every criterion scored 80 -> the weighted average must be exactly 80,
    # regardless of how weights are distributed across sections/criteria.
    assert total == 80.0
    assert passed is True


def test_missing_criterion_scores_are_treated_as_zero_not_dropped():
    pass  # covered end-to-end below (AI omits a criterion)


def test_critical_criterion_failure_fails_the_whole_evaluation(db):
    version = ensure_default_scorecard(db)

    critical_id = next(
        c.id for s in version.sections for c in s.criteria if c.is_critical
    )

    scores = {c.id: 100.0 for s in version.sections for c in s.criteria}
    passes = {c.id: True for s in version.sections for c in s.criteria if c.is_critical}
    passes[critical_id] = False  # this one failed the gate

    total, passed = compute_weighted_score(version, scores, passes)

    assert passed is False
    assert total == 100.0  # the numeric score is unaffected; pass/fail is separate


# ----------------------------------------------------------------------
# End-to-end AI evaluation
# ----------------------------------------------------------------------

def test_run_ai_qa_evaluation_persists_deterministic_score_and_verified_evidence(db, groq):
    employee = make_user(db, "emp1@example.com")
    transcript = "Hi, thanks for calling. I understand you need a password reset. I'll help right away."
    record = make_record(db, employee, transcript=transcript)

    version = ensure_default_scorecard(db)
    ids = all_criterion_ids(version)

    groq.content = qa_response(
        [(cid, 80, None, "I understand you need a password reset.") for cid in ids]
    )

    evaluation = run_ai_qa_evaluation(db, record)

    assert evaluation.status == "COMPLETED"
    assert evaluation.ai_total_score == 80.0
    # The configured model (app.core.config.GROQ_MODEL), not a hardcoded
    # literal — this must keep passing across future model migrations.
    assert evaluation.model == groq_client.MODEL_NAME

    results = (
        db.query(QACriterionResult)
        .filter(QACriterionResult.evaluation_id == evaluation.id)
        .all()
    )
    assert len(results) == len(ids)
    assert all(r.evidence_verified for r in results)
    assert all(r.ai_score == 80.0 for r in results)


def test_evidence_not_found_in_transcript_is_flagged_unverified(db, groq):
    employee = make_user(db, "emp2@example.com")
    record = make_record(db, employee, transcript="A short unrelated transcript.")

    version = ensure_default_scorecard(db)
    ids = all_criterion_ids(version)

    groq.content = qa_response(
        [(cid, 70, None, "This exact sentence never appeared in the call.") for cid in ids]
    )

    evaluation = run_ai_qa_evaluation(db, record)

    results = (
        db.query(QACriterionResult)
        .filter(QACriterionResult.evaluation_id == evaluation.id)
        .all()
    )
    assert all(r.evidence_verified is False for r in results)
    # The score is still stored — being unverified downgrades trust, it does
    # not silently discard the AI's answer.
    assert all(r.ai_score == 70.0 for r in results)


def test_ai_omitting_a_criterion_scores_it_zero_rather_than_fabricating(db, groq):
    employee = make_user(db, "emp3@example.com")
    record = make_record(db, employee)

    version = ensure_default_scorecard(db)
    ids = all_criterion_ids(version)
    missing_id = ids[0]
    present_ids = ids[1:]

    groq.content = qa_response([(cid, 100, None, "") for cid in present_ids])

    evaluation = run_ai_qa_evaluation(db, record)

    missing_result = (
        db.query(QACriterionResult)
        .filter(
            QACriterionResult.evaluation_id == evaluation.id,
            QACriterionResult.criterion_id == missing_id,
        )
        .first()
    )
    assert missing_result.ai_score is None
    assert missing_result.evidence_verified is False
    # Overall score must be less than 100 because the missing criterion
    # contributed 0, not because it vanished from the denominator.
    assert evaluation.ai_total_score < 100.0


def test_invalid_ai_response_marks_evaluation_failed_without_crashing(db, groq):
    employee = make_user(db, "emp4@example.com")
    record = make_record(db, employee)

    groq.content = "not valid json at all"

    evaluation = run_ai_qa_evaluation(db, record)

    assert evaluation.status == "FAILED"
    assert evaluation.error_reason
    assert evaluation.ai_total_score is None


def test_rerun_creates_a_new_version_and_keeps_the_previous_one(db, groq):
    employee = make_user(db, "emp5@example.com")
    record = make_record(db, employee)
    version = ensure_default_scorecard(db)
    ids = all_criterion_ids(version)

    groq.content = qa_response([(cid, 50, None, "") for cid in ids])
    first = run_ai_qa_evaluation(db, record)
    assert first.ai_total_score == 50.0
    assert first.version_number == 1
    assert first.is_latest is True

    groq.content = qa_response([(cid, 90, None, "") for cid in ids])
    second = run_ai_qa_evaluation(db, record)

    # A NEW row, not the same one — the first evaluation must survive untouched.
    assert second.id != first.id
    assert second.version_number == 2
    assert second.ai_total_score == 90.0

    db.refresh(first)
    assert first.ai_total_score == 50.0  # untouched by the rerun
    assert first.is_latest is False  # demoted, not deleted
    assert second.is_latest is True

    # Both rows genuinely exist — no evaluation is destroyed by a rerun.
    count = (
        db.query(QAEvaluation)
        .filter(QAEvaluation.call_analysis_id == record.id)
        .count()
    )
    assert count == 2

    # Evaluation #2 has its own independent criterion results, not a mutation
    # of #1's rows.
    first_result_ids = {r.id for r in first.criterion_results}
    second_result_ids = {r.id for r in second.criterion_results}
    assert first_result_ids.isdisjoint(second_result_ids)
    assert len(first_result_ids) == len(ids)
    assert len(second_result_ids) == len(ids)


def test_get_latest_evaluation_returns_the_most_recent_version(db, groq):
    employee = make_user(db, "emp5b@example.com")
    record = make_record(db, employee)
    version = ensure_default_scorecard(db)
    ids = all_criterion_ids(version)

    groq.content = qa_response([(cid, 40, None, "") for cid in ids])
    first = run_ai_qa_evaluation(db, record)

    groq.content = qa_response([(cid, 95, None, "") for cid in ids])
    second = run_ai_qa_evaluation(db, record)

    latest = get_latest_evaluation(db, record.id)
    assert latest.id == second.id
    assert latest.id != first.id

    history = list_evaluation_history(db, record.id)
    assert [e.id for e in history] == [first.id, second.id]
    assert [e.version_number for e in history] == [1, 2]


def test_human_override_on_an_old_evaluation_survives_a_rerun(db, groq):
    employee = make_user(db, "emp5c@example.com")
    manager = make_user(db, "mgr5c@example.com", role=UserRole.MANAGER)
    record = make_record(db, employee)
    version = ensure_default_scorecard(db)
    ids = all_criterion_ids(version)

    groq.content = qa_response([(cid, 50, None, "") for cid in ids])
    first = run_ai_qa_evaluation(db, record)

    first_result = first.criterion_results[0]
    apply_human_override(
        db, first_result, reviewer_id=manager.id, human_score=100, human_comment="Reviewed v1"
    )

    # Rerun AutoQA — this must NOT touch evaluation #1's human review.
    groq.content = qa_response([(cid, 60, None, "") for cid in ids])
    second = run_ai_qa_evaluation(db, record)

    db.refresh(first_result)
    db.refresh(first)

    assert first_result.human_score == 100
    assert first_result.human_comment == "Reviewed v1"
    assert first.overridden is True
    assert first.human_total_score is not None

    # The new evaluation starts completely fresh: no human review carried over.
    assert second.overridden is False
    assert second.human_total_score is None
    assert all(r.human_score is None for r in second.criterion_results)


# ----------------------------------------------------------------------
# Human override / calibration
# ----------------------------------------------------------------------

def test_human_override_never_touches_the_ai_score_and_recomputes_total(db, groq):
    employee = make_user(db, "emp6@example.com")
    manager = make_user(db, "mgr1@example.com", role=UserRole.MANAGER)
    record = make_record(db, employee)
    version = ensure_default_scorecard(db)
    ids = all_criterion_ids(version)

    groq.content = qa_response([(cid, 60, None, "") for cid in ids])
    evaluation = run_ai_qa_evaluation(db, record)

    first_result = evaluation.criterion_results[0]
    original_ai_score = first_result.ai_score

    updated = apply_human_override(
        db,
        first_result,
        reviewer_id=manager.id,
        human_score=100,
        human_comment="Actually handled perfectly.",
        disputed=True,
    )

    db.refresh(first_result)
    assert first_result.ai_score == original_ai_score  # AI result is untouched
    assert first_result.human_score == 100
    assert first_result.overridden is True
    assert first_result.disputed is True
    assert first_result.reviewer_id == manager.id

    # human_total_score must differ from ai_total_score now that one
    # criterion's effective score changed.
    assert updated.human_total_score != updated.ai_total_score
    assert updated.overridden is True


def test_calibration_reports_insufficient_data_with_no_overrides(db):
    metrics = compute_calibration_metrics(db)
    assert metrics["insufficient_data"] is True
    assert metrics["override_count"] == 0


def test_calibration_tracks_agreement_and_critical_disagreement(db, groq):
    employee = make_user(db, "emp7@example.com")
    manager = make_user(db, "mgr2@example.com", role=UserRole.MANAGER)
    record = make_record(db, employee)
    version = ensure_default_scorecard(db)

    critical_id = next(
        c.id for s in version.sections for c in s.criteria if c.is_critical
    )
    other_ids = [
        c.id for s in version.sections for c in s.criteria if c.id != critical_id
    ]

    groq.content = qa_response(
        [(critical_id, 90, True, "")] + [(cid, 80, None, "") for cid in other_ids]
    )
    evaluation = run_ai_qa_evaluation(db, record)

    results_by_id = {r.criterion_id: r for r in evaluation.criterion_results}

    # Agreement: human score close to AI score (within tolerance).
    apply_human_override(
        db, results_by_id[other_ids[0]], reviewer_id=manager.id, human_score=82
    )
    # Critical-fail disagreement: AI said pass, human says fail.
    apply_human_override(
        db, results_by_id[critical_id], reviewer_id=manager.id, human_pass=False
    )

    metrics = compute_calibration_metrics(db)

    assert metrics["insufficient_data"] is False
    assert metrics["override_count"] == 2
    assert metrics["critical_fail_disagreement_count"] == 1
    assert metrics["agreement_count"] == 1  # only the non-critical override
