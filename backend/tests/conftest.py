"""
Shared test setup.

SAFETY: the environment is configured BEFORE the app is imported and the
database URL is forced to a throwaway SQLite file, so tests can never reach
the real Postgres database, real SMTP, the real Groq API or the real Whisper
model. `load_dotenv()` in app.core.config never overrides variables that are
already set, which is what makes this work even with a real backend/.env.
"""

import io
import json
import os
import pathlib
import smtplib
import struct
import sys
import types
import wave
from types import SimpleNamespace

_BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent
_TMP_DIR = _BACKEND_DIR / ".test_tmp"
_TMP_DIR.mkdir(exist_ok=True)

os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{(_TMP_DIR / 'test.db').as_posix()}",
        "SECRET_KEY": "test-secret-key-not-for-real-use-0123456789",
        "GROQ_API_KEY": "test-groq-key",
        "SMTP_USERNAME": "test@example.invalid",
        "SMTP_APP_PASSWORD": "test-password",
        "RATE_LIMIT_ENABLED": "false",
        # Safety: never let a leftover row from a previous test run make
        # app.main's startup recovery pass dial real SMTP on import.
        "EMAIL_RECOVERY_ON_STARTUP": "false",
    }
)

if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# The real module loads a ~150 MB model at import time.
_fake_whisper = types.ModuleType("whisper")
_fake_whisper.load_model = lambda name: SimpleNamespace(
    transcribe=lambda *a, **k: (_ for _ in ()).throw(
        AssertionError("real Whisper must not run in tests")
    )
)
sys.modules["whisper"] = _fake_whisper

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core import config, groq_client, rate_limit  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.services import email_delivery, transcription  # noqa: E402
from app.services.job_runner import failure_reasons, runner as job_runner  # noqa: E402
import app.api.upload as upload_module  # noqa: E402


# ----------------------------------------------------------------------
# Database / app
# ----------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    rate_limit.reset()
    failure_reasons.clear()
    monkeypatch.setattr(config, "RATE_LIMIT_ENABLED", False)

    yield

    # Drain any background pipeline job THIS test started before the fakes
    # it used (whisper/groq/mailer, all monkeypatch-based) are reverted and
    # before the next test's drop_all/create_all touches the same tables —
    # otherwise a slow-to-finish job could dial the real Whisper/Groq/SMTP
    # or write to tables that are being torn down.
    if not job_runner.wait_idle(timeout=30):
        raise AssertionError(
            "a background pipeline job did not finish within 30s of the "
            "test ending — see services/job_runner.py"
        )

    engine.dispose()


@pytest.fixture(autouse=True)
def _block_real_smtp(monkeypatch):
    def _refuse(*args, **kwargs):
        raise AssertionError("a test tried to open a real SMTP connection")

    monkeypatch.setattr(smtplib, "SMTP", _refuse)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


# ----------------------------------------------------------------------
# Users / auth
# ----------------------------------------------------------------------

def make_user(
    db,
    email="user@example.com",
    role=UserRole.EMPLOYEE,
    password="Password123",
    verified=True,
    active=True,
    full_name="Test User",
):
    user = User(
        full_name=full_name,
        email=email,
        hashed_password=hash_password(password),
        role=role,
        is_verified=verified,
        is_active=active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def auth_headers(user):
    token = create_access_token(
        user_id=user.id, email=user.email, role=user.role.value
    )
    return {"Authorization": f"Bearer {token}"}


def wait_for_pipeline(timeout=10):
    """
    Block until every queued background pipeline job (services/job_runner.py)
    has finished. The fakes (whisper/groq/mailer) do no real I/O, so this
    returns almost immediately; it exists so tests can assert on DB/response
    state right after an upload without a real-time sleep-based poll loop.
    """
    if not job_runner.wait_idle(timeout=timeout):
        raise AssertionError(f"pipeline job(s) did not finish within {timeout}s")


@pytest.fixture
def employee(db):
    return make_user(db, "employee@example.com", UserRole.EMPLOYEE, full_name="Erin Employee")


@pytest.fixture
def manager(db):
    return make_user(db, "manager@example.com", UserRole.MANAGER, full_name="Max Manager")


# ----------------------------------------------------------------------
# External services (all faked)
# ----------------------------------------------------------------------

def valid_analysis(**overrides):
    analysis = {
        "executive_summary": "The customer called about a billing error and it was resolved.",
        "intent": "Dispute a duplicate charge",
        "topics": ["Billing"],
        "entities": ["Order #12345"],
        "outcome": "Resolved",
        "disposition": "Resolved",
        "customer_sentiment": {
            "overall": "Positive",
            "journey": "Improved",
            "confidence_score": 88,
            "detailed_analysis": "Started frustrated, ended satisfied.",
        },
        "agent_sentiment": {
            "overall": "Positive",
            "confidence_score": 90,
            "detailed_analysis": "Calm and helpful.",
        },
        "customer_behavior": {
            "frustration_level": "Medium",
            "cooperation_level": "High",
            "satisfaction_level": "High",
            "communication_quality": "High",
            "detailed_analysis": "Cooperative.",
        },
        "agent_behavior": {
            "professionalism": "High",
            "empathy": "High",
            "resolution_focus": "High",
            "communication_quality": "High",
            "detailed_analysis": "Professional.",
        },
        "key_customer_concerns": ["Double charge"],
        "emotional_cues": ["Frustration"],
        "action_items": ["Refund the duplicate charge"],
        "confidence_scorecard": {
            "customer_experience_score": 82,
            "agent_performance_score": 91,
            "overall_call_confidence_score": 87,
        },
        "risk_assessment": "Low risk.",
        "root_cause_analysis": "Payment gateway retry.",
        "positive_observations": ["Agent apologised"],
        "critical_conversation_moments": [
            {
                "start_time": "00:00:03",
                "speaker": "Customer",
                "category": "Escalation",
                "severity": "Medium",
                "quote": "I was charged twice!",
            }
        ],
    }
    analysis.update(overrides)
    return analysis


DEFAULT_TRANSCRIPT = {
    "text": "Hello this is support. How can I help you today?",
    "segments": [
        {"start": 0.0, "end": 3.2, "text": " Hello this is support."},
        {"start": 3.2, "end": 6.0, "text": " How can I help you today?"},
    ],
}


class FakeWhisper:
    """Stands in for the Whisper model; counts transcribe() calls."""

    def __init__(self):
        self.calls = 0
        self.result = dict(DEFAULT_TRANSCRIPT)
        self.side_effect = None

    def transcribe(self, path, **kwargs):
        self.calls += 1
        if self.side_effect:
            self.side_effect()
        return self.result


class FakeGroq:
    """Stands in for the Groq client; counts and records API calls.

    Each pipeline run makes 2 calls (call analysis, then AutoQA). `content`
    is used for every call that isn't served from `queue` (a list of
    responses consumed front-to-back, for tests that need the two calls to
    return different JSON).
    """

    def __init__(self):
        self.calls = []
        self.content = json.dumps(valid_analysis())
        self.queue: list[str] = []
        self.error = None
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=self._create)
        )

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        content = self.queue.pop(0) if self.queue else self.content
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )


class Mailer:
    """Records report emails; remembers the DB status at send time."""

    def __init__(self):
        self.sent = []
        self.error = None
        self.status_at_send = []

    def __call__(self, to_email, subject, summary_text, pdf_path):
        if self.error:
            raise self.error
        session = SessionLocal()
        try:
            from app.models.call_analysis import CallAnalysis

            row = session.query(CallAnalysis).order_by(CallAnalysis.id.desc()).first()
            self.status_at_send.append(row.processing_status.value if row else None)
        finally:
            session.close()
        self.sent.append(
            {"to": to_email, "subject": subject, "summary": summary_text, "pdf": pdf_path}
        )


@pytest.fixture(autouse=True)
def groq(monkeypatch):
    fake = FakeGroq()
    monkeypatch.setattr(groq_client, "client", fake)
    return fake


@pytest.fixture(autouse=True)
def whisper(monkeypatch):
    fake = FakeWhisper()
    monkeypatch.setattr(transcription, "model", fake)
    return fake


@pytest.fixture(autouse=True)
def mailer(monkeypatch):
    fake = Mailer()
    # Email is sent from services/email_delivery.py (not upload.py) — see
    # its "PENDING -> SENDING -> SENT/FAILED" state machine.
    monkeypatch.setattr(email_delivery, "send_report_email", fake)
    return fake


@pytest.fixture(autouse=True)
def storage(tmp_path, monkeypatch):
    audio = tmp_path / "audio"
    reports = tmp_path / "reports"
    audio.mkdir()
    reports.mkdir()
    monkeypatch.setattr(upload_module, "UPLOAD_DIR", str(audio))
    monkeypatch.setattr(upload_module, "REPORT_DIR", str(reports))
    return SimpleNamespace(audio=audio, reports=reports)


# ----------------------------------------------------------------------
# Real (minimal) audio containers. Upload validation now inspects file
# CONTENT, so tests must send bytes that genuinely are WAV/MP3/AAC/M4A.
# ----------------------------------------------------------------------

def make_wav(size=None, seconds=0.05):
    """A valid mono 8 kHz 16-bit WAV; optionally padded to exactly `size` bytes."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"\x00\x00" * int(8000 * seconds))
    data = buffer.getvalue()
    if size is not None:
        data = data[:size] if size < len(data) else data + b"\x00" * (size - len(data))
    return data


def make_mp3(frames=6, id3=False):
    """MPEG-1 Layer III, 128 kbps, 44.1 kHz frames (417 bytes each)."""
    frame = b"\xff\xfb\x90\x00" + b"\x00" * (417 - 4)
    tag = b"ID3\x03\x00\x00\x00\x00\x00\x00" if id3 else b""
    return tag + frame * frames


def make_adts(frames=6):
    """Raw AAC-LC ADTS stream: 44.1 kHz mono, 32-byte frames."""
    header = bytes([0xFF, 0xF1, 0x50, 0x40, 0x04, 0x1F, 0xFC])
    return (header + b"\x00" * (32 - len(header))) * frames


def make_m4a(brand=b"M4A "):
    """ISO base media file: ftyp + moov + mdat boxes."""
    ftyp = struct.pack(">I4s4sI4s4s", 24, b"ftyp", brand, 0, brand, b"mp42")
    moov = struct.pack(">I4s", 16, b"moov") + b"\x00" * 8
    mdat = struct.pack(">I4s", 16, b"mdat") + b"\x00" * 8
    return ftyp + moov + mdat


VALID_WAV = make_wav()


def audio_files(*specs):
    """Build the `files=` argument for TestClient uploads.

    Each spec is (filename, content_type) or (filename, content_type, bytes).
    Without explicit bytes a small valid WAV is sent.
    """
    out = []
    for spec in specs:
        name, ctype, *rest = spec
        content = rest[0] if rest else VALID_WAV
        out.append(("files", (name, content, ctype)))
    return out
