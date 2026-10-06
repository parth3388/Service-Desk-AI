"""
Pilot hardening, Phase 9 — focused IDOR audit for report resources
(detail, audio, PDF download, delete). The service-layer functions already
enforce ownership (report_service.get_downloadable_report /
get_employee_report); these tests prove it end-to-end through the API so a
future change to those endpoints can't silently reopen the hole.
"""

import pytest

from app.models.call_analysis import CallAnalysis, ProcessingStatus
from conftest import auth_headers, make_user, valid_analysis


@pytest.fixture
def other_employee(db):
    return make_user(db, "other-employee@example.com", full_name="Other Employee")


@pytest.fixture
def report(db, employee):
    row = CallAnalysis(
        employee_id=employee.id,
        original_filename="call.wav",
        stored_filename="owner-only.wav",
        audio_path="x",
        pdf_path="y",
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


def test_employee_cannot_view_another_employees_report_detail(client, other_employee, report):
    response = client.get(f"/report/{report.id}", headers=auth_headers(other_employee))
    assert response.status_code == 404


def test_employee_cannot_download_another_employees_audio(client, other_employee, report):
    response = client.get(f"/report/audio/{report.id}", headers=auth_headers(other_employee))
    assert response.status_code == 404


def test_employee_cannot_download_another_employees_pdf(client, other_employee, report):
    response = client.get(f"/report/download/{report.id}", headers=auth_headers(other_employee))
    assert response.status_code == 404


def test_employee_cannot_delete_another_employees_report(db, client, other_employee, report):
    response = client.delete(f"/report/{report.id}", headers=auth_headers(other_employee))
    assert response.status_code == 404

    db.expire_all()
    assert db.get(CallAnalysis, report.id) is not None  # nothing was deleted


def test_employee_cannot_resend_another_employees_report_email(client, other_employee, report):
    response = client.post(f"/report/{report.id}/resend-email", headers=auth_headers(other_employee))
    assert response.status_code == 404


def test_owner_can_view_and_download_their_own_report(client, employee, report):
    assert client.get(f"/report/{report.id}", headers=auth_headers(employee)).status_code == 200


def test_manager_can_view_any_employees_report(client, manager, report):
    assert client.get(f"/report/{report.id}", headers=auth_headers(manager)).status_code == 200


def test_manager_can_delete_any_employees_report(db, client, manager, employee):
    row = CallAnalysis(
        employee_id=employee.id,
        original_filename="call2.wav",
        stored_filename="manager-delete.wav",
        audio_path="x",
        processing_status=ProcessingStatus.COMPLETED,
    )
    db.add(row)
    db.commit()
    report_id = row.id

    response = client.delete(f"/manager/report/{report_id}", headers=auth_headers(manager))
    assert response.status_code == 200

    db.expire_all()
    assert db.get(CallAnalysis, report_id) is None


def test_employee_cannot_use_manager_only_report_endpoints(client, employee, report):
    assert client.get(f"/manager/report/{report.id}", headers=auth_headers(employee)).status_code == 403
    assert client.get("/manager/reports", headers=auth_headers(employee)).status_code == 403
    assert client.get("/manager/dashboard", headers=auth_headers(employee)).status_code == 403
    assert client.get("/manager/employees", headers=auth_headers(employee)).status_code == 403
