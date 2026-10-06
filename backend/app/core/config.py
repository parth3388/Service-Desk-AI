from dotenv import load_dotenv
import os

load_dotenv()

APP_NAME = os.getenv(
    "APP_NAME",
    "AI Service Desk"
)

APP_VERSION = os.getenv(
    "APP_VERSION",
    "1.0.0"
)

DEBUG = os.getenv(
    "DEBUG",
    "False"
).lower() == "true"

DATABASE_URL = os.getenv(
    "DATABASE_URL"
)

SECRET_KEY = os.getenv(
    "SECRET_KEY"
)

ALGORITHM = os.getenv(
    "ALGORITHM",
    "HS256"
)
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv(
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        30
    )
)

GROQ_API_KEY = os.getenv(
    "GROQ_API_KEY"
)

# The Groq-hosted model used for call analysis and AutoQA scoring. Kept
# configurable (rather than hardcoded) because Groq periodically retires
# models — llama-3.3-70b-versatile was retired for this tier, which is why
# this default points at a currently-supported model instead.
GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-120b"
)

# Validation

if not GROQ_API_KEY:
    raise ValueError(
        "GROQ_API_KEY not found in .env"
    )

if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY not found in .env"
    )

if not DATABASE_URL:
    raise ValueError(
        "DATABASE_URL not found in .env"
    )
# ---- Email (SMTP) settings ----

SMTP_HOST = os.getenv(
    "SMTP_HOST",
    "smtp.gmail.com"
)

SMTP_PORT = int(
    os.getenv(
        "SMTP_PORT",
        587
    )
)

SMTP_USERNAME = os.getenv(
    "SMTP_USERNAME"
)

SMTP_APP_PASSWORD = os.getenv(
    "SMTP_APP_PASSWORD"
)

FROM_NAME = os.getenv(
    "FROM_NAME",
    "AI Service Desk"
)

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000"
)

if not SMTP_USERNAME:
    raise ValueError(
        "SMTP_USERNAME not found in .env"
    )

if not SMTP_APP_PASSWORD:
    raise ValueError(
        "SMTP_APP_PASSWORD not found in .env"
    )
BACKEND_URL = os.getenv(
    "BACKEND_URL",
    "http://localhost:8000"
)

EMAIL_VERIFICATION_EXPIRE_MINUTES = int(
    os.getenv(
        "EMAIL_VERIFICATION_EXPIRE_MINUTES",
        1440
    )
)
PASSWORD_RESET_EXPIRE_MINUTES = 30

# Seconds to wait when connecting to / talking to the SMTP server.
SMTP_TIMEOUT = float(
    os.getenv(
        "SMTP_TIMEOUT",
        15
    )
)

# ---- Upload limits ----

MAX_UPLOAD_MB = int(
    os.getenv(
        "MAX_UPLOAD_MB",
        100
    )
)

# ---- Pipeline ----

# A record stuck in an in-progress status (e.g. the server was restarted
# mid-processing) may be claimed again after this many minutes.
PIPELINE_STALE_MINUTES = int(
    os.getenv(
        "PIPELINE_STALE_MINUTES",
        30
    )
)

# Background worker threads that run the AI pipeline. Transcription itself is
# serialized by a lock (Whisper is not thread-safe), so extra workers only
# overlap the network/PDF/email stages of different reports.
PIPELINE_WORKERS = int(
    os.getenv(
        "PIPELINE_WORKERS",
        2
    )
)

# ---- Report email delivery recovery ----

# Automatic attempts per report (the first attempt right after completion
# counts). Recovery never loops: once this is reached only an explicit
# "resend" from the report owner / a manager tries again.
EMAIL_MAX_ATTEMPTS = int(
    os.getenv(
        "EMAIL_MAX_ATTEMPTS",
        3
    )
)

# A SENDING claim older than this is treated as a crashed attempt.
EMAIL_STALE_MINUTES = int(
    os.getenv(
        "EMAIL_STALE_MINUTES",
        15
    )
)

# One bounded pass over PENDING/FAILED emails when the server starts.
EMAIL_RECOVERY_ON_STARTUP = os.getenv(
    "EMAIL_RECOVERY_ON_STARTUP",
    "true"
).lower() != "false"

# ---- Rate limiting (in-memory, per client IP) ----
# Each limit is "<max requests>/<window seconds>". Set RATE_LIMIT_ENABLED=false
# to switch the limiter off entirely (e.g. for load testing).

RATE_LIMIT_ENABLED = os.getenv(
    "RATE_LIMIT_ENABLED",
    "true"
).lower() != "false"

RATE_LIMITS = {
    "login": os.getenv("RATE_LIMIT_LOGIN", "10/60"),
    "register": os.getenv("RATE_LIMIT_REGISTER", "10/600"),
    "forgot_password": os.getenv("RATE_LIMIT_FORGOT_PASSWORD", "5/600"),
    "resend_verification": os.getenv("RATE_LIMIT_RESEND_VERIFICATION", "5/600"),
    "contact": os.getenv("RATE_LIMIT_CONTACT", "5/600"),
}