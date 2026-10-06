"""Manager reviews persist and are returned in the shape the UI reads."""

import pytest

from app.models.call_analysis import CallAnalysis, ProcessingStatus
from conftest import auth_headers, valid_analysis

REVIEW = {
    "rating": 4,
    "decision": "Good",
    "feedback": "Handled the escalation calmly.",
    "recommendation": "Share this call in training.",
}


@pytest.fixture
def report(db, employee):
    row = CallAnalysis(
        employee_id=employee.id,
        original_filename="call.wav",
        stored_filename="abc.wav",
        audio_path="x",
        transcript="hello there this is a call",
        analysis_json=valid_analysis(),
        confidence_score=87,
        customer_score=82,
        agent_score=91,
        processing_status=ProcessingStatus.COMPLETED,
    )
    db.add(row)
    db.commit()
    return row


def save(client, manager, report, **overrides):
    return client.put(
        f"/manager/report/{report.id}/review",
        json={**REVIEW, **overrides},
        headers=auth_headers(manager),
    )


def load(client, manager, report):
    return client.get(f"/manager/report/{report.id}", headers=auth_headers(manager)).json()["report"]


def test_report_without_a_review_returns_empty_manager_review(client, manager, report):
    assert load(client, manager, report)["manager_review"] == {
        "rating": None,
        "decision": None,
        "feedback": None,
        "recommendation": None,
    }


def test_saved_review_is_returned_when_the_report_is_reloaded(client, manager, report):
    saved = save(client, manager, report)

    assert saved.status_code == 200

    reloaded = load(client, manager, report)      # a fresh page load

    assert reloaded["manager_review"] == {
        "rating": 4.0,
        "decision": "Good",
        "feedback": "Handled the escalation calmly.",
        "recommendation": "Share this call in training.",
    }


def test_editing_and_resaving_replaces_the_review(client, manager, report):
    save(client, manager, report)
    save(client, manager, report, rating=2, feedback="Revised after listening again.")

    review = load(client, manager, report)["manager_review"]

    assert review["rating"] == 2.0
    assert review["feedback"] == "Revised after listening again."
    assert review["decision"] == "Good"           # untouched fields survive the round trip


def test_review_is_visible_to_the_employee_on_their_own_report(client, manager, employee, report):
    save(client, manager, report)

    mine = client.get(f"/report/{report.id}", headers=auth_headers(employee)).json()["report"]

    assert mine["manager_feedback"] == "Handled the escalation calmly."
    assert mine["manager_rating"] == 4.0


@pytest.mark.parametrize("bad", [{"rating": -1}, {"rating": 6}, {"rating": "great"}, {"feedback": "x" * 5001}])
def test_invalid_reviews_are_rejected_and_nothing_is_saved(client, manager, report, bad):
    assert save(client, manager, report, **bad).status_code == 422
    assert load(client, manager, report)["manager_review"]["rating"] is None


def test_employees_cannot_write_reviews(client, employee, report):
    response = client.put(
        f"/manager/report/{report.id}/review",
        json=REVIEW,
        headers=auth_headers(employee),
    )

    assert response.status_code == 403
