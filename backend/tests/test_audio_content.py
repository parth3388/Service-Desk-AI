"""Uploads are validated by CONTENT (file signature), not just name/content type."""

import random

import pytest

from app.core import config
from app.models.call_analysis import CallAnalysis
from app.services.audio_signature import detect_audio_format
from conftest import (
    audio_files,
    auth_headers,
    make_adts,
    make_m4a,
    make_mp3,
    make_wav,
)


def store(client, user, name, ctype, content):
    response = client.post(
        "/upload/library",
        files=audio_files((name, ctype, content)),
        headers=auth_headers(user),
    )
    assert response.status_code == 200
    return response.json()["files"][0]


# ---- detector ---------------------------------------------------------------------

@pytest.mark.parametrize(
    "content,expected",
    [
        (make_wav(), "wav"),
        (make_mp3(), "mp3"),
        (make_mp3(id3=True), "mp3"),
        (make_adts(), "aac"),
        (make_m4a(), "m4a"),
        (make_m4a(brand=b"isom"), "m4a"),
        (make_m4a(brand=b"mp42"), "m4a"),
        (make_m4a(brand=b"3gp4"), "m4a"),
    ],
    ids=["wav", "mp3", "mp3-id3", "aac-adts", "m4a", "isom", "mp42", "3gp"],
)
def test_supported_containers_are_recognised(content, expected):
    assert detect_audio_format(content) == expected


@pytest.mark.parametrize(
    "content",
    [
        b"",
        b"\x00" * 4096,
        b"just some plain text pretending to be an mp3\n" * 50,
        b"<html><body>not audio</body></html>",
        b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n",
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
        b"\xff\xd8\xff\xe0" + b"\x00" * 64,                       # JPEG
        b"PK\x03\x04" + b"\x00" * 64,                            # zip
        b"MZ" + b"\x90\x00" * 64,                                # Windows executable
        b"\x7fELF" + b"\x00" * 64,
        b"OggS" + b"\x00" * 64,                                  # OGG: unsupported container
        b"fLaC" + b"\x00" * 64,                                  # FLAC: unsupported container
        b"RIFF\x24\x00\x00\x00AVI LIST" + b"\x00" * 32,          # RIFF but not WAVE
        b"RIFF\x24\x00\x00\x00WAVE" + b"\x00" * 3,               # truncated after WAVE
        b"RIFF\x24\x00\x00\x00WAVEjunk" + b"\x00" * 40,          # no fmt chunk
        b"RIFF\x24\x00\x00\x00WAVEfmt fake-audio-bytes",         # garbage fmt size
        make_m4a(brand=b"heic"),                                 # HEIC image, not audio
        make_m4a(brand=b"avif"),
        b"\x00\x00\x00\x18ftypM4A ",                             # truncated ftyp
        b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"not audio at all" * 8,   # ID3 prefix, junk after
        b"\xff\xfb",                                             # 2-byte fragment
    ],
    ids=[
        "empty", "zeros", "text", "html", "pdf", "png", "jpeg", "zip", "exe", "elf", "ogg",
        "flac", "riff-avi", "wave-truncated", "wave-no-fmt", "wave-garbage-fmt", "heic",
        "avif", "ftyp-truncated", "id3-junk", "fragment",
    ],
)
def test_non_audio_and_corrupt_content_is_rejected(content):
    assert detect_audio_format(content) is None


def test_random_binary_is_never_mistaken_for_audio():
    rng = random.Random(1234)

    for _ in range(3000):
        blob = rng.randbytes(rng.choice([16, 128, 1024, 8192]))
        assert detect_audio_format(blob) is None


def test_random_data_starting_with_valid_sync_bytes_still_fails_the_chain_check():
    rng = random.Random(99)

    for _ in range(500):
        # A plausible first MPEG/ADTS header followed by noise: no second frame.
        blob = bytes([0xFF, 0xFB, 0x90, 0x00]) + rng.randbytes(1000)
        assert detect_audio_format(blob) is None or blob[421:425] == b"\xff\xfb\x90\x00"


# ---- through the upload endpoint ---------------------------------------------------

@pytest.mark.parametrize(
    "name,ctype,content",
    [
        ("call.wav", "audio/wav", make_wav()),
        ("call.mp3", "audio/mpeg", make_mp3()),
        ("call.mp3", "audio/mpeg", make_mp3(id3=True)),
        ("call.aac", "audio/aac", make_adts()),
        ("call.m4a", "audio/mp4", make_m4a()),
        # A valid file is accepted whichever supported container it really is:
        ("voice.aac", "audio/aac", make_m4a()),          # .aac that is really MP4/M4A
        ("voice.m4a", "audio/x-m4a", make_adts()),       # .m4a that is really ADTS AAC
        ("renamed.wav", "audio/wav", make_mp3()),        # mislabelled but still valid audio
    ],
    ids=["wav", "mp3", "mp3-id3", "aac", "m4a", "aac-is-m4a", "m4a-is-adts", "wav-is-mp3"],
)
def test_valid_audio_is_accepted_and_stored(client, db, employee, storage, name, ctype, content):
    item = store(client, employee, name, ctype, content)

    assert item["status"] == "stored" and item["id"]
    (stored,) = list(storage.audio.iterdir())
    assert stored.read_bytes() == content                     # stored byte-for-byte
    assert db.query(CallAnalysis).count() == 1


@pytest.mark.parametrize(
    "name,ctype,content",
    [
        ("notes.mp3", "audio/mpeg", b"This is definitely not audio.\n" * 200),
        ("page.wav", "audio/wav", b"<html><script>alert(1)</script></html>"),
        ("doc.m4a", "audio/mp4", b"%PDF-1.4\n" + b"0" * 500),
        ("image.mp3", "audio/mpeg", b"\x89PNG\r\n\x1a\n" + b"\x00" * 200),
        ("run.aac", "audio/aac", b"MZ" + b"\x90" * 300),
        ("song.mp3", "audio/mpeg", b"OggS" + b"\x00" * 300),
        ("song.wav", "audio/wav", b"fLaC" + b"\x00" * 300),
        ("junk.mp3", "audio/mpeg", random.Random(7).randbytes(4096)),
        ("junk.m4a", "audio/mp4", random.Random(8).randbytes(70000)),
        ("zeros.wav", "audio/wav", b"\x00" * 100000),
        ("tiny.mp3", "audio/mpeg", b"\xff\xfb"),
    ],
    ids=["text-as-mp3", "html-as-wav", "pdf-as-m4a", "png-as-mp3", "exe-as-aac", "ogg-as-mp3",
         "flac-as-wav", "random-4k", "random-70k", "zeros", "tiny"],
)
def test_renamed_or_corrupt_files_are_rejected_without_storing_anything(
    client, db, employee, storage, name, ctype, content
):
    item = store(client, employee, name, ctype, content)

    assert item["status"] == "failed"
    assert "not valid MP3, WAV, AAC, M4A audio" in item["error"]
    assert "id" not in item
    assert list(storage.audio.iterdir()) == []                # nothing written to disk
    assert db.query(CallAnalysis).count() == 0                # no orphan DB row


def test_oversized_valid_file_is_rejected_and_partial_file_removed(
    client, db, employee, storage, monkeypatch
):
    monkeypatch.setattr(config, "MAX_UPLOAD_MB", 1)

    item = store(client, employee, "big.wav", "audio/wav", make_wav(size=3 * 1024 * 1024))

    assert item["status"] == "failed" and "too large" in item["error"]
    assert list(storage.audio.iterdir()) == []
    assert db.query(CallAnalysis).count() == 0


def test_valid_file_within_limit_still_accepted(client, employee, storage, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_MB", 1)

    item = store(client, employee, "ok.wav", "audio/wav", make_wav(size=1024 * 1024))

    assert item["status"] == "stored"


def test_upload_audio_endpoint_rejects_renamed_files_before_any_processing(
    client, employee, whisper, groq, storage
):
    response = client.post(
        "/upload/audio",
        files=audio_files(("fake.mp3", "audio/mpeg", b"plain text, not audio " * 40)),
        headers=auth_headers(employee),
    )

    (item,) = response.json()["reports"]
    assert item["status"] == "failed"
    assert whisper.calls == 0 and groq.calls == []            # no expensive work for bad input
    assert list(storage.audio.iterdir()) == []


def test_batch_mixes_valid_and_invalid_independently(client, db, employee, storage):
    response = client.post(
        "/upload/library",
        files=audio_files(
            ("good.wav", "audio/wav", make_wav()),
            ("bad.mp3", "audio/mpeg", b"nope" * 100),
            ("good.m4a", "audio/mp4", make_m4a()),
        ),
        headers=auth_headers(employee),
    )

    statuses = [f["status"] for f in response.json()["files"]]
    assert statuses == ["stored", "failed", "stored"]
    assert len(list(storage.audio.iterdir())) == 2


def test_error_messages_do_not_expose_paths_or_the_client_filename(client, employee, storage):
    item = store(client, employee, "../../secret/evil.mp3", "audio/mpeg", b"not audio" * 50)

    text = str(item)
    assert str(storage.audio) not in text and "\\" not in item["error"]
    assert item["original_filename"] == "evil.mp3"            # sanitised, never a path


def test_stored_name_is_a_generated_uuid_not_the_client_name(client, employee, storage):
    store(client, employee, "customer-call-7.wav", "audio/wav", make_wav())

    (stored,) = list(storage.audio.iterdir())
    assert "customer-call-7" not in stored.name
    assert len(stored.stem) == 36 and stored.suffix == ".wav"
