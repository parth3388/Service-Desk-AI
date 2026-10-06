"""
QA API: evaluation retrieval, human override, rerun, calibration.
Authorization: employees see only their own report's evaluation (read-only);
only managers can override, rerun, or view calibration (Pillar 11: no IDOR,
authorization on every resource).
"""

import json

import pytest

from app.models.call_analysis import CallAnalysis, ProcessingStatus
from app.services.qa_defaults import ensure_default_scorecard
from app.services.qa_engine import run_ai_qa_evaluation
from conftest import auth_headers, make_user


def qa_response(criterion_ids, score=75):
    return json.dumps(
        {
            "criteria": [
                {
                    "criterion_id": cid,
                    "score": score,
                    "pass": None,
                    "confidence": 90,
                    "rationale": "Reasonable handling of the call.",
                    "evidence_quote": "Hello, thanks for calling support.",
                    "evidence_segment": "",
                }
                for cid in criterion_ids
            ]
        }
    )


@pytest.fixture
def report_with_evaluation(db, employee, groq):
    record = CallAnalysis(
        employee_id=employee.id,
        original_filename="call.wav",
        stored_filename="abc.wav",
        audio_path="x",
        transcript="Hello, thanks for calling support.",
        redacted_transcript="Hello, thanks for calling support.",
        processing_status=ProcessingStatus.COMPLETED,
    )
    db.add(record)
    db.commit()

    version = ensure_default_scorecard(db)
    ids = [c.id for s in version.sections for c in s.criteria]
    groq.content = qa_response(ids)

    run_ai_qa_evaluation(db, record)
    db.refresh(record)

    return record


def test_manager_can_fetch_full_evaluation_with_evidence(client, manager, report_with_evaluation):
    response = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(manager)
    )

    assert response.status_code == 200
    evaluation = response.json()["evaluation"]

    assert evaluation["status"] == "COMPLETED"
    assert evaluation["ai_total_score"] == 75.0

    all_criteria = [c for section in evaluation["sections"] for c in section["criteria"]]
    assert len(all_criteria) > 0
    for criterion in all_criteria:
        assert criterion["ai_score"] == 75.0
        assert criterion["evidence_quote"]
        assert criterion["ai_rationale"]


def test_employee_can_view_their_own_evaluation_read_only(client, employee, report_with_evaluation):
    response = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(employee)
    )
    assert response.status_code == 200
    assert response.json()["evaluation"]["status"] == "COMPLETED"


def test_employee_cannot_view_another_employees_evaluation(db, client, report_with_evaluation):
    other = make_user(db, "other@example.com")

    response = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(other)
    )
    assert response.status_code == 404


def test_report_with_no_evaluation_yet_returns_null(client, manager, db, employee):
    record = CallAnalysis(
        employee_id=employee.id,
        original_filename="call.wav",
        stored_filename="xyz.wav",
        audio_path="x",
        processing_status=ProcessingStatus.UPLOADING,
    )
    db.add(record)
    db.commit()

    response = client.get(f"/qa/evaluations/{record.id}", headers=auth_headers(manager))
    assert response.status_code == 200
    assert response.json()["evaluation"] is None


def test_manager_can_override_a_criterion_and_ai_score_is_preserved(
    client, manager, report_with_evaluation
):
    evaluation = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(manager)
    ).json()["evaluation"]

    criterion = evaluation["sections"][0]["criteria"][0]
    result_id = criterion["criterion_result_id"]
    original_ai_score = criterion["ai_score"]

    response = client.put(
        f"/qa/evaluations/{report_with_evaluation.id}/criteria/{result_id}",
        json={"human_score": 40, "human_comment": "Missed a step.", "disputed": True},
        headers=auth_headers(manager),
    )

    assert response.status_code == 200
    updated = response.json()["evaluation"]
    updated_criterion = updated["sections"][0]["criteria"][0]

    assert updated_criterion["ai_score"] == original_ai_score
    assert updated_criterion["human_score"] == 40
    assert updated_criterion["overridden"] is True
    assert updated_criterion["disputed"] is True
    assert updated["overridden"] is True
    assert updated["human_total_score"] != updated["ai_total_score"]


def test_employee_cannot_override_a_criterion(client, employee, report_with_evaluation):
    evaluation = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(employee)
    ).json()["evaluation"]
    result_id = evaluation["sections"][0]["criteria"][0]["criterion_result_id"]

    response = client.put(
        f"/qa/evaluations/{report_with_evaluation.id}/criteria/{result_id}",
        json={"human_score": 10},
        headers=auth_headers(employee),
    )
    assert response.status_code == 403


def test_employee_cannot_rerun_or_view_calibration(client, employee, report_with_evaluation):
    assert client.post(
        f"/qa/evaluations/{report_with_evaluation.id}/rerun", headers=auth_headers(employee)
    ).status_code == 403
    assert client.get("/qa/calibration", headers=auth_headers(employee)).status_code == 403


def test_manager_can_rerun_autoqa(client, manager, report_with_evaluation, groq):
    version = ensure_default_scorecard  # noqa: F841 (documents intent)

    response = client.post(
        f"/qa/evaluations/{report_with_evaluation.id}/rerun", headers=auth_headers(manager)
    )
    assert response.status_code == 200
    assert response.json()["evaluation"]["status"] == "COMPLETED"


def test_calibration_endpoint_reports_insufficient_data_before_any_override(client, manager):
    response = client.get("/qa/calibration", headers=auth_headers(manager))
    assert response.status_code == 200
    assert response.json()["calibration"]["insufficient_data"] is True


def test_scorecard_endpoint_returns_default_scorecard_with_weights_summing_to_100(client, employee):
    response = client.get("/qa/scorecard", headers=auth_headers(employee))
    assert response.status_code == 200

    scorecard = response.json()["scorecard"]
    total_weight = sum(section["weight_pct"] for section in scorecard["sections"])
    assert total_weight == 100

    for section in scorecard["sections"]:
        criteria_weight = sum(c["weight_pct"] for c in section["criteria"])
        assert criteria_weight == 100


# ----------------------------------------------------------------------
# Evaluation versioning / history (Pilot hardening, Phase 2)
# ----------------------------------------------------------------------

def test_get_evaluation_returns_the_latest_version_after_a_rerun(
    client, manager, report_with_evaluation, groq
):
    first = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(manager)
    ).json()["evaluation"]
    assert first["version_number"] == 1

    rerun = client.post(
        f"/qa/evaluations/{report_with_evaluation.id}/rerun", headers=auth_headers(manager)
    )
    assert rerun.status_code == 200
    assert rerun.json()["evaluation"]["version_number"] == 2

    latest = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(manager)
    ).json()["evaluation"]
    assert latest["version_number"] == 2
    assert latest["id"] != first["id"]


def test_evaluation_history_lists_every_version_oldest_first(
    client, manager, report_with_evaluation, groq
):
    client.post(f"/qa/evaluations/{report_with_evaluation.id}/rerun", headers=auth_headers(manager))
    client.post(f"/qa/evaluations/{report_with_evaluation.id}/rerun", headers=auth_headers(manager))

    response = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}/history", headers=auth_headers(manager)
    )
    assert response.status_code == 200

    history = response.json()["history"]
    assert [h["version_number"] for h in history] == [1, 2, 3]
    assert [h["is_latest"] for h in history] == [False, False, True]


def test_a_specific_old_version_remains_fetchable_with_its_own_override(
    client, manager, report_with_evaluation, groq
):
    first_id = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(manager)
    ).json()["evaluation"]["id"]

    first_criterion = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(manager)
    ).json()["evaluation"]["sections"][0]["criteria"][0]

    client.put(
        f"/qa/evaluations/{report_with_evaluation.id}/criteria/{first_criterion['criterion_result_id']}",
        json={"human_score": 33},
        headers=auth_headers(manager),
    )

    client.post(f"/qa/evaluations/{report_with_evaluation.id}/rerun", headers=auth_headers(manager))

    # Fetching version #1 directly must still show the override untouched.
    response = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}/versions/{first_id}",
        headers=auth_headers(manager),
    )
    assert response.status_code == 200
    old_version = response.json()["evaluation"]
    assert old_version["version_number"] == 1
    assert old_version["is_latest"] is False
    assert old_version["sections"][0]["criteria"][0]["human_score"] == 33

    # And the report's "current" view is the fresh, un-overridden rerun.
    latest = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}", headers=auth_headers(manager)
    ).json()["evaluation"]
    assert latest["version_number"] == 2
    assert latest["overridden"] is False


def test_employee_cannot_view_another_employees_evaluation_history(
    db, client, report_with_evaluation
):
    other = make_user(db, "other-history@example.com")

    response = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}/history", headers=auth_headers(other)
    )
    assert response.status_code == 404


def test_employee_cannot_view_another_employees_specific_evaluation_version(
    db, client, report_with_evaluation
):
    other = make_user(db, "other-version@example.com")

    evaluation_id = report_with_evaluation.qa_evaluations[0].id

    response = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}/versions/{evaluation_id}",
        headers=auth_headers(other),
    )
    assert response.status_code == 404


def test_fetching_a_version_id_that_belongs_to_a_different_report_is_rejected(
    db, client, manager, employee, report_with_evaluation, groq
):
    # A second, unrelated report with its own evaluation.
    other_record = CallAnalysis(
        employee_id=employee.id,
        original_filename="other.wav",
        stored_filename="other.wav",
        audio_path="x",
        transcript="A different call entirely.",
        redacted_transcript="A different call entirely.",
        processing_status=ProcessingStatus.COMPLETED,
    )
    db.add(other_record)
    db.commit()

    version = ensure_default_scorecard(db)
    ids = [c.id for s in version.sections for c in s.criteria]
    groq.content = qa_response(ids)
    other_evaluation = run_ai_qa_evaluation(db, other_record)

    # Trying to fetch report A's URL with report B's evaluation id must 404,
    # not leak report B's data.
    response = client.get(
        f"/qa/evaluations/{report_with_evaluation.id}/versions/{other_evaluation.id}",
        headers=auth_headers(manager),
    )
    assert response.status_code == 404
