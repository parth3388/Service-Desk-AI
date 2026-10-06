"""Only COMPLETED calls contribute to statistics and rankings."""

import pytest

from app.models.call_analysis import CallAnalysis, ProcessingStatus
from app.models.user import UserRole
from app.services import call_analysis_service as svc
from conftest import auth_headers, make_user

S = ProcessingStatus


def add_call(db, user, status, score=0.0, customer=None, agent=None, name="c.wav"):
    """A call row. Non-completed rows keep the column default score of 0."""
    row = CallAnalysis(
        employee_id=user.id,
        original_filename=name,
        stored_filename=f"{user.id}-{status.value}-{score}-{customer}-{agent}-{name}",
        audio_path="x",
        processing_status=status,
    )
    if status == S.COMPLETED:
        row.confidence_score = score
        row.customer_score = score if customer is None else customer
        row.agent_score = score if agent is None else agent
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def team(db):
    alice = make_user(db, "alice@example.com", full_name="Alice Actual")     # real scores
    bob = make_user(db, "bob@example.com", full_name="Bob Zero")             # genuine zero
    carol = make_user(db, "carol@example.com", full_name="Carol Failed")     # only failures
    dave = make_user(db, "dave@example.com", full_name="Dave Unprocessed")   # only uploads
    erin = make_user(db, "erin@example.com", full_name="Aaron NoCalls")      # nothing at all

    add_call(db, alice, S.COMPLETED, 80)
    add_call(db, alice, S.COMPLETED, 60, name="d.wav")
    add_call(db, alice, S.FAILED, name="e.wav")
    add_call(db, alice, S.UPLOADING, name="f.wav")
    add_call(db, alice, S.AI_ANALYZING, name="g.wav")

    add_call(db, bob, S.COMPLETED, 0)

    add_call(db, carol, S.FAILED)
    add_call(db, dave, S.UPLOADING)

    return dict(alice=alice, bob=bob, carol=carol, dave=dave, erin=erin)


def test_employee_stats_ignore_failed_and_unprocessed_calls(db, team):
    stats = svc.get_employee_dashboard_stats(db, team["alice"].id)

    assert stats["total_calls"] == 2
    assert stats["average_confidence_score"] == 70.0   # (80 + 60) / 2, not / 5
    assert stats["average_customer_score"] == 70.0
    assert stats["average_agent_score"] == 70.0


def test_a_genuine_zero_score_from_a_completed_call_is_kept(db, team):
    stats = svc.get_employee_dashboard_stats(db, team["bob"].id)

    assert stats["total_calls"] == 1
    assert stats["average_confidence_score"] == 0


def test_completed_zero_pulls_the_average_down_but_failures_do_not(db):
    user = make_user(db, "zed@example.com")
    add_call(db, user, S.COMPLETED, 100)
    add_call(db, user, S.COMPLETED, 0, name="z.wav")
    for i in range(5):
        add_call(db, user, S.FAILED, name=f"f{i}.wav")

    stats = svc.get_employee_dashboard_stats(db, user.id)

    assert stats["total_calls"] == 2
    assert stats["average_confidence_score"] == 50.0


def test_employee_with_only_failed_or_unprocessed_calls_has_no_calls_counted(db, team):
    for key in ("carol", "dave", "erin"):
        stats = svc.get_employee_dashboard_stats(db, team[key].id)
        assert stats["total_calls"] == 0
        assert stats["average_confidence_score"] == 0


def test_company_stats_only_count_completed_calls(db, team):
    stats = svc.get_company_dashboard_stats(db)

    assert stats["total_calls"] == 3                       # alice x2 + bob x1
    assert stats["average_confidence_score"] == round((80 + 60 + 0) / 3, 2)
    assert stats["total_employees"] == 5


def test_top_employee_is_the_best_completed_average(db, team):
    top = svc.get_top_employee(db)

    assert top.full_name == "Alice Actual"
    assert float(top.average_confidence_score) == 70.0


def test_top_employee_is_none_when_nothing_is_completed(db):
    user = make_user(db, "solo@example.com")
    add_call(db, user, S.FAILED)

    assert svc.get_top_employee(db) is None


def test_performance_ranking_puts_employees_with_data_first(db, team):
    ranked = svc.get_employee_performance(db)
    names = [r.full_name for r in ranked]

    # Alice (70) > Bob (genuine 0) > everyone without a completed call.
    assert names[:2] == ["Alice Actual", "Bob Zero"]
    assert set(names[2:]) == {"Carol Failed", "Dave Unprocessed", "Aaron NoCalls"}

    by_name = {r.full_name: r for r in ranked}
    assert by_name["Alice Actual"].total_calls == 2
    assert float(by_name["Alice Actual"].confidence_score) == 70.0
    assert by_name["Bob Zero"].total_calls == 1
    assert float(by_name["Bob Zero"].confidence_score) == 0.0
    for name in ("Carol Failed", "Dave Unprocessed", "Aaron NoCalls"):
        assert by_name[name].total_calls == 0
        assert by_name[name].confidence_score is None


def test_no_call_employee_never_outranks_a_real_performer_even_alphabetically(db, team):
    # "Aaron NoCalls" sorts before "Alice Actual" and has a NULL average, which
    # PostgreSQL would otherwise place first under DESC.
    names = [r.full_name for r in svc.get_employee_performance(db)]

    assert names.index("Alice Actual") < names.index("Aaron NoCalls")
    assert names.index("Bob Zero") < names.index("Aaron NoCalls")


def test_manager_endpoints_reflect_the_corrected_statistics(client, db, team, manager):
    headers = auth_headers(manager)

    dashboard = client.get("/manager/dashboard", headers=headers).json()
    assert dashboard["statistics"]["total_calls"] == 3
    assert dashboard["top_performer"]["employee_name"] == "Alice Actual"
    # Recent calls is a list, not a statistic: failed rows stay visible.
    assert len(dashboard["recent_calls"]) == 8

    employees = client.get("/manager/employees", headers=headers).json()["employees"]
    assert [e["employee_name"] for e in employees][:2] == ["Alice Actual", "Bob Zero"]
    assert employees[0]["total_calls"] == 2
    assert employees[0]["average_confidence_score"] == 70.0


def test_employee_dashboard_endpoint_reflects_the_corrected_statistics(client, team):
    response = client.get("/employee/dashboard", headers=auth_headers(team["alice"])).json()

    assert response["statistics"]["total_calls"] == 2
    assert response["statistics"]["average_confidence_score"] == 70.0
    assert len(response["recent_calls"]) == 5   # list still shows every attempt
