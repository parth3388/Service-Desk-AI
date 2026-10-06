"""One supported format set, size cap, content types and safe filenames."""

import pytest

from app.core import config
from app.models.call_analysis import CallAnalysis
from app.services import upload_validation
from conftest import audio_files, auth_headers, make_wav


def store(client, user, *specs):
    """Store without processing, so only validation is exercised."""
    response = client.post(
        "/upload/library",
        files=audio_files(*specs),
        headers=auth_headers(user),
    )
    assert response.status_code == 200
    return response.json()["files"]


def test_supported_formats_are_exactly_mp3_wav_aac_m4a():
    assert upload_validation.ALLOWED_EXTENSIONS == (".mp3", ".wav", ".aac", ".m4a")


@pytest.mark.parametrize(
    "name,ctype",
    [
        ("call.mp3", "audio/mpeg"),
        ("call.wav", "audio/wav"),
        ("call.wav", "audio/x-wav"),
        ("call.aac", "audio/aac"),
        ("call.m4a", "audio/mp4"),
        ("call.m4a", "audio/x-m4a"),
        ("CALL.MP3", "audio/mpeg"),
        ("call.mp3", "application/octet-stream"),  # pickers that don't know the type
        ("call.wav", ""),
    ],
)
def test_valid_uploads_are_stored(client, db, employee, storage, name, ctype):
    (item,) = store(client, employee, (name, ctype))

    assert item["status"] == "stored"
    assert item["id"]
    assert len(list(storage.audio.iterdir())) == 1


@pytest.mark.parametrize(
    "name,ctype",
    [
        ("call.ogg", "audio/ogg"),
        ("call.flac", "audio/flac"),
        ("call.exe", "application/octet-stream"),
        ("call.mp3.exe", "audio/mpeg"),
        ("noextension", "audio/mpeg"),
        ("call.txt", "text/plain"),
    ],
)
def test_unsupported_extensions_are_rejected_and_nothing_is_stored(
    client, db, employee, storage, name, ctype
):
    (item,) = store(client, employee, (name, ctype))

    assert item["status"] == "failed"
    assert "Allowed formats: MP3, WAV, AAC, M4A" in item["error"]
    assert list(storage.audio.iterdir()) == []
    assert db.query(CallAnalysis).count() == 0


@pytest.mark.parametrize("ctype", ["image/png", "text/html", "application/pdf", "video/x-msvideo"])
def test_wrong_content_type_is_rejected_even_with_an_audio_extension(
    client, db, employee, storage, ctype
):
    (item,) = store(client, employee, ("call.mp3", ctype))

    assert item["status"] == "failed"
    assert list(storage.audio.iterdir()) == []


def test_oversized_upload_is_rejected_and_the_partial_file_removed(
    client, db, employee, storage, monkeypatch
):
    monkeypatch.setattr(config, "MAX_UPLOAD_MB", 1)
    too_big = make_wav(size=1024 * 1024 + 1)

    (item,) = store(client, employee, ("big.wav", "audio/wav", too_big))

    assert item["status"] == "failed"
    assert "too large" in item["error"]
    assert "1 MB" in item["error"]
    assert list(storage.audio.iterdir()) == []
    assert db.query(CallAnalysis).count() == 0


def test_upload_at_the_limit_is_accepted(client, employee, storage, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_MB", 1)

    (item,) = store(client, employee, ("ok.wav", "audio/wav", make_wav(size=1024 * 1024)))

    assert item["status"] == "stored"


def test_empty_file_is_rejected(client, db, employee, storage):
    (item,) = store(client, employee, ("empty.wav", "audio/wav", b""))

    assert item["status"] == "failed"
    assert "empty" in item["error"]
    assert list(storage.audio.iterdir()) == []


@pytest.mark.parametrize(
    "submitted,expected",
    [
        ("../../etc/evil.mp3", "evil.mp3"),
        ("..\\..\\windows\\evil.wav", "evil.wav"),
        ("C:\\Users\\x\\call.m4a", "call.m4a"),
        ("/abs/path/call.aac", "call.aac"),
    ],
)
def test_filenames_are_sanitized_and_files_stored_under_generated_names(
    client, db, employee, storage, submitted, expected
):
    (item,) = store(client, employee, (submitted, "application/octet-stream"))

    assert item["status"] == "stored"
    assert item["original_filename"] == expected

    (stored,) = list(storage.audio.iterdir())
    assert stored.parent == storage.audio                       # never escaped the directory
    assert stored.suffix == expected[expected.rindex("."):]
    assert stored.stem != "call" and len(stored.stem) == 36      # uuid4, not the client name


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("my call\r\n.mp3", "my call.mp3"),
        ("a\x00b\x1f.wav", "ab.wav"),
        ("  spaced.mp3  ", "spaced.mp3"),
        ("", ""),
        (None, ""),
    ],
)
def test_sanitize_filename_strips_control_characters(raw, expected):
    # Multipart encoding escapes CR/LF on the wire, so this is checked directly.
    assert upload_validation.sanitize_filename(raw) == expected


def test_overlong_filename_is_truncated_but_keeps_its_extension():
    name = upload_validation.sanitize_filename("a" * 500 + ".mp3")

    assert len(name) <= upload_validation.MAX_FILENAME_LENGTH
    assert name.endswith(".mp3")


def test_incident_number_is_single_line_and_bounded(client, db, employee):
    response = client.post(
        "/upload/library",
        files=audio_files(("a.wav", "audio/wav")),
        data={"incident_number": "INC-1\r\nBcc: evil@example.com"},
        headers=auth_headers(employee),
    )

    assert response.json()["files"][0]["incident_number"] == "INC-1  Bcc: evil@example.com"

    too_long = client.post(
        "/upload/library",
        files=audio_files(("a.wav", "audio/wav")),
        data={"incident_number": "x" * 101},
        headers=auth_headers(employee),
    )
    assert too_long.status_code == 422


def test_upload_requires_authentication(client):
    response = client.post("/upload/audio", files=audio_files(("a.wav", "audio/wav")))

    assert response.status_code == 401
