"""
"Uploaded Files" (the audio library, /upload/library*) — Call Audio and
Uploaded Files are two distinct workflows:

  Call Audio      = POST /upload/audio        -> upload a NEW recording and
                     process it immediately (unchanged by this feature).
  Uploaded Files  = GET  /upload/library       -> list the current user's
                     already-uploaded recordings, and
                     POST /upload/library/{id}/generate -> process/retry an
                     EXISTING one (never creates a new upload).

Both endpoints already scoped every query to `current_user.id` from the
auth dependency before this change; these tests prove that end-to-end so a
future change to them can't silently reopen an IDOR hole, and prove that
selecting an existing file never duplicates it.
"""

import pytest

from app.models.call_analysis import CallAnalysis, ProcessingStatus
from conftest import audio_files, auth_headers, make_user, wait_for_pipeline


def store(client, user, name="call.wav"):
    response = client.post(
        "/upload/library",
        files=audio_files((name, "audio/wav")),
        headers=auth_headers(user),
    )
    return response.json()["files"][0]["id"]


def generate(client, user, record_id):
    return client.post(f"/upload/library/{record_id}/generate", headers=auth_headers(user))


def list_library(client, user):
    return client.get("/upload/library", headers=auth_headers(user))


@pytest.fixture
def other_employee(db):
    return make_user(db, "other-library@example.com", full_name="Other Employee")


# ----------------------------------------------------------------------
# Ownership: listing
# ----------------------------------------------------------------------

def test_user_sees_their_own_uploaded_files_in_the_list(client, employee):
    record_id = store(client, employee)

    response = list_library(client, employee)

    assert response.status_code == 200
    ids = [f["id"] for f in response.json()["files"]]
    assert record_id in ids


def test_user_does_not_see_another_users_uploaded_files_in_the_list(
    client, employee, other_employee
):
    store(client, other_employee)  # belongs to other_employee only

    response = list_library(client, employee)

    assert response.status_code == 200
    assert response.json()["files"] == []


def test_a_user_supplied_id_query_param_cannot_widen_the_list(client, employee, other_employee):
    """The endpoint takes no such parameter, but prove it can't be smuggled in
    to defeat the server-side employee_id filter."""
    store(client, other_employee)

    response = client.get(
        "/upload/library",
        params={"employee_id": other_employee.id, "user_id": other_employee.id},
        headers=auth_headers(employee),
    )

    assert response.status_code == 200
    assert response.json()["files"] == []


# ----------------------------------------------------------------------
# Ownership: generate/select/retry
# ----------------------------------------------------------------------

def test_user_cannot_generate_a_report_from_another_users_file(
    client, db, employee, other_employee
):
    other_record_id = store(client, other_employee)

    response = generate(client, employee, other_record_id)

    assert response.status_code == 404

    db.expire_all()
    record = db.get(CallAnalysis, other_record_id)
    assert record.processing_status == ProcessingStatus.UPLOADING  # untouched


def test_user_can_generate_a_report_from_their_own_uploaded_file(
    client, employee, whisper, groq, mailer
):
    record_id = store(client, employee)

    response = generate(client, employee, record_id)
    assert response.status_code == 200

    wait_for_pipeline()

    status_response = client.get(
        f"/upload/status/{record_id}", headers=auth_headers(employee)
    )
    assert status_response.json()["report"]["state"] == "completed"


def test_user_cannot_view_another_users_uploaded_audio_metadata_via_report_detail(
    client, employee, other_employee
):
    other_record_id = store(client, other_employee)

    response = client.get(f"/report/{other_record_id}", headers=auth_headers(employee))
    assert response.status_code == 404


def test_user_cannot_download_another_users_uploaded_audio(client, employee, other_employee):
    other_record_id = store(client, other_employee)

    response = client.get(f"/report/audio/{other_record_id}", headers=auth_headers(employee))
    assert response.status_code == 404


# ----------------------------------------------------------------------
# Selecting an existing file must never duplicate it
# ----------------------------------------------------------------------

def test_selecting_an_existing_file_does_not_create_a_duplicate_record(
    client, db, employee, whisper, groq, mailer
):
    record_id = store(client, employee)

    before = db.query(CallAnalysis).filter(CallAnalysis.employee_id == employee.id).count()

    response = generate(client, employee, record_id)
    assert response.status_code == 200
    wait_for_pipeline()

    db.expire_all()
    after = db.query(CallAnalysis).filter(CallAnalysis.employee_id == employee.id).count()

    assert after == before  # same row processed in place, nothing new created

    record = db.get(CallAnalysis, record_id)
    assert record.processing_status == ProcessingStatus.COMPLETED


def test_retrying_a_failed_uploaded_file_does_not_create_a_duplicate_record(
    client, db, employee, whisper, groq, mailer
):
    groq.error = Exception("boom")
    record_id = store(client, employee)

    generate(client, employee, record_id)
    wait_for_pipeline()

    db.expire_all()
    assert db.get(CallAnalysis, record_id).processing_status == ProcessingStatus.FAILED

    before = db.query(CallAnalysis).filter(CallAnalysis.employee_id == employee.id).count()

    groq.error = None
    retry_response = generate(client, employee, record_id)
    assert retry_response.status_code == 200
    wait_for_pipeline()

    db.expire_all()
    after = db.query(CallAnalysis).filter(CallAnalysis.employee_id == employee.id).count()

    assert after == before
    assert db.get(CallAnalysis, record_id).processing_status == ProcessingStatus.COMPLETED


# ----------------------------------------------------------------------
# Call Audio (new upload) is unaffected by any of the above
# ----------------------------------------------------------------------

def test_call_audio_new_upload_still_works_end_to_end(client, employee, whisper, groq, mailer):
    response = client.post(
        "/upload/audio",
        files=audio_files(("new-call.wav", "audio/wav")),
        headers=auth_headers(employee),
    )
    assert response.status_code == 200
    assert response.json()["reports"][0]["status"] == "accepted"

    wait_for_pipeline()

    record_id = response.json()["reports"][0]["id"]
    status_response = client.get(
        f"/upload/status/{record_id}", headers=auth_headers(employee)
    )
    assert status_response.json()["report"]["state"] == "completed"


def test_manager_cannot_list_or_generate_from_employee_only_library_endpoints(
    client, manager
):
    # Uploaded Files is an employee-only concept, matching upload_to_library
    # / generate_report_from_library's existing employee_required guard.
    assert list_library(client, manager).status_code == 403
    assert generate(client, manager, 1).status_code == 403
