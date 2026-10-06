#!/usr/bin/env python
"""
Pilot-readiness environment verification (Phase 4).

Run from backend/:  python scripts/verify_environment.py [--live]

This is a MANUAL/LIVE check of the actual configured environment. It is
deliberately separate from the automated test suite, which mocks Whisper,
Groq and SMTP on purpose (see tests/conftest.py) — that suite proves the
application logic is correct, not that a given deployment's credentials
and infrastructure are reachable. This script proves the latter.

SAFETY: this script NEVER prints a secret value. Every check reports only
PASS / FAIL / NOT CONFIGURED plus a short, generic reason. API keys,
passwords, JWT secrets, SMTP credentials and database passwords are read
only to test them, never echoed, logged, or included in output — including
in error messages (only the exception TYPE is shown, never str(exception),
since driver error text can sometimes embed connection details).

By default this only checks presence/shape of configuration (fast, no
network calls). Pass --live to additionally attempt real, side-effect-free
connections: a DB "SELECT 1", an SMTP login (no email sent), and a minimal
Groq API call. --live is what you run against a real pilot environment
before go-live; the default (no --live) is safe to run anywhere, anytime.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

PASS = "PASS"
FAIL = "FAIL"
NOT_CONFIGURED = "NOT CONFIGURED"

_results: list[tuple[str, str, str]] = []


def check(name: str, status: str, detail: str = "") -> None:
    _results.append((name, status, detail))


def _placeholder(value: str | None, *placeholders: str) -> bool:
    return bool(value) and value.strip() in placeholders


# ----------------------------------------------------------------------
# PostgreSQL
# ----------------------------------------------------------------------

def check_database(live: bool) -> None:
    url = os.getenv("DATABASE_URL")

    if not url:
        check("Database: DATABASE_URL", NOT_CONFIGURED)
        return

    if url.startswith("sqlite"):
        check(
            "Database: DATABASE_URL",
            FAIL,
            "Points at SQLite, not PostgreSQL — fine for local dev, not for a pilot deployment.",
        )
    elif url.startswith("postgresql"):
        check("Database: DATABASE_URL", PASS, "PostgreSQL DSN configured.")
    else:
        check("Database: DATABASE_URL", FAIL, "Unrecognised database scheme.")

    if _placeholder(url, "postgresql://postgres:your_password@postgres:5432/aiservicedesk"):
        check("Database: not using example placeholder", FAIL, "DATABASE_URL is still the .env.example value.")
    else:
        check("Database: not using example placeholder", PASS)

    if not live:
        check("Database: live connection", NOT_CONFIGURED, "Run with --live to test connectivity.")
        return

    try:
        from sqlalchemy import create_engine, text

        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        check("Database: live connection", PASS)
    except Exception as exc:
        check("Database: live connection", FAIL, f"Could not connect ({type(exc).__name__}).")


# ----------------------------------------------------------------------
# Alembic
# ----------------------------------------------------------------------

def check_alembic(live: bool) -> None:
    alembic_ini = BACKEND_DIR / "alembic.ini"
    versions_dir = BACKEND_DIR / "alembic" / "versions"

    if not alembic_ini.exists():
        check("Alembic: configured", FAIL, "alembic.ini missing.")
        return

    check("Alembic: configured", PASS)

    revisions = sorted(p.name for p in versions_dir.glob("*.py")) if versions_dir.exists() else []
    check("Alembic: migration files present", PASS if revisions else FAIL, f"{len(revisions)} revision(s) found.")

    if not live:
        check("Alembic: database is at head", NOT_CONFIGURED, "Run with --live to compare against the database.")
        return

    url = os.getenv("DATABASE_URL")
    if not url:
        check("Alembic: database is at head", NOT_CONFIGURED, "DATABASE_URL not set.")
        return

    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from sqlalchemy import create_engine, text

        cfg = Config(str(alembic_ini))
        cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
        script = ScriptDirectory.from_config(cfg)
        head = script.get_current_head()

        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as conn:
            try:
                current = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            except Exception:
                current = None

        if current is None:
            check(
                "Alembic: database is at head",
                FAIL,
                "No alembic_version table — database was not migrated with Alembic.",
            )
        elif current == head:
            check("Alembic: database is at head", PASS, f"At revision {current}.")
        else:
            check(
                "Alembic: database is at head",
                FAIL,
                f"Database is at {current}, latest revision is {head} — run `alembic upgrade head`.",
            )
    except Exception as exc:
        check("Alembic: database is at head", FAIL, f"Could not check ({type(exc).__name__}).")


# ----------------------------------------------------------------------
# Groq
# ----------------------------------------------------------------------

def check_groq(live: bool) -> None:
    key = os.getenv("GROQ_API_KEY")

    if not key:
        check("Groq: GROQ_API_KEY", NOT_CONFIGURED)
        return

    if _placeholder(key, "your_groq_api_key_here"):
        check("Groq: GROQ_API_KEY", FAIL, "Still the .env.example placeholder value.")
        return

    check("Groq: GROQ_API_KEY", PASS, "Key is set (not shown).")

    if not live:
        check("Groq: live API call", NOT_CONFIGURED, "Run with --live to test the key against the real API.")
        return

    try:
        from groq import Groq

        client = Groq(api_key=key, timeout=15.0, max_retries=0)
        client.models.list()
        check("Groq: live API call", PASS)
    except Exception as exc:
        check("Groq: live API call", FAIL, f"Call failed ({type(exc).__name__}).")


# ----------------------------------------------------------------------
# Whisper
# ----------------------------------------------------------------------

def check_whisper(live: bool) -> None:
    try:
        import whisper  # noqa: F401

        check("Whisper: package installed", PASS)
    except Exception as exc:
        check("Whisper: package installed", FAIL, f"Import failed ({type(exc).__name__}).")
        return

    try:
        import torch

        check("Whisper: torch available", PASS, f"device={'cuda' if torch.cuda.is_available() else 'cpu'}")
    except Exception as exc:
        check("Whisper: torch available", FAIL, f"Import failed ({type(exc).__name__}).")

    if not live:
        check("Whisper: model loads", NOT_CONFIGURED, "Run with --live to actually load the model (slow, ~150MB).")
        return

    try:
        import whisper

        whisper.load_model("base")
        check("Whisper: model loads", PASS)
    except Exception as exc:
        check("Whisper: model loads", FAIL, f"Load failed ({type(exc).__name__}).")


# ----------------------------------------------------------------------
# SMTP
# ----------------------------------------------------------------------

def check_smtp(live: bool) -> None:
    host = os.getenv("SMTP_HOST")
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_APP_PASSWORD")

    if not (host and username and password):
        check("SMTP: configuration", NOT_CONFIGURED, "SMTP_HOST/SMTP_USERNAME/SMTP_APP_PASSWORD not fully set.")
        return

    if _placeholder(username, "your_gmail_address_here") or _placeholder(password, "your_gmail_app_password_here"):
        check("SMTP: configuration", FAIL, "Still the .env.example placeholder value(s).")
        return

    check("SMTP: configuration", PASS, "Host/username/password are set (not shown).")

    if not live:
        check("SMTP: live login", NOT_CONFIGURED, "Run with --live to test login (no email is sent).")
        return

    try:
        import smtplib

        port = int(os.getenv("SMTP_PORT", 587))
        timeout = float(os.getenv("SMTP_TIMEOUT", 15))

        with smtplib.SMTP(host, port, timeout=timeout) as server:
            server.starttls()
            server.login(username, password)

        check("SMTP: live login", PASS)
    except Exception as exc:
        check("SMTP: live login", FAIL, f"Login failed ({type(exc).__name__}).")


# ----------------------------------------------------------------------
# JWT / auth
# ----------------------------------------------------------------------

def check_jwt() -> None:
    secret = os.getenv("SECRET_KEY")

    if not secret:
        check("Auth: SECRET_KEY", NOT_CONFIGURED)
        return

    if _placeholder(secret, "your_secret_key_here"):
        check("Auth: SECRET_KEY", FAIL, "Still the .env.example placeholder value.")
        return

    if len(secret) < 32:
        check("Auth: SECRET_KEY", FAIL, "Set, but shorter than the recommended 32 characters.")
        return

    check("Auth: SECRET_KEY", PASS, f"Set ({len(secret)} characters, not shown).")

    algorithm = os.getenv("ALGORITHM", "HS256")
    check("Auth: ALGORITHM", PASS, algorithm)


# ----------------------------------------------------------------------
# Storage directories
# ----------------------------------------------------------------------

def check_storage() -> None:
    for rel in ("storage/audio", "storage/reports"):
        path = BACKEND_DIR / rel

        if not path.exists():
            check(f"Storage: {rel} exists", FAIL, "Directory is missing (created automatically on first upload).")
            continue

        probe = path / ".write_test"
        try:
            probe.write_text("ok")
            probe.unlink()
            check(f"Storage: {rel} writable", PASS)
        except Exception as exc:
            check(f"Storage: {rel} writable", FAIL, f"{type(exc).__name__}")


# ----------------------------------------------------------------------
# Frontend / CORS
# ----------------------------------------------------------------------

def check_frontend_and_cors() -> None:
    frontend_env = BACKEND_DIR.parent / "frontend" / ".env.local"
    api_url = None

    if frontend_env.exists():
        for line in frontend_env.read_text().splitlines():
            if line.strip().startswith("NEXT_PUBLIC_API_URL="):
                api_url = line.split("=", 1)[1].strip()
                break

    if api_url:
        # NEXT_PUBLIC_* values are baked into the client bundle and are not
        # secret, so this one is safe to show.
        check("Frontend: NEXT_PUBLIC_API_URL", PASS, api_url)
    else:
        check("Frontend: NEXT_PUBLIC_API_URL", NOT_CONFIGURED, "Falls back to http://127.0.0.1:8000 in code.")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # main.py's CORS allow_origins is currently a hardcoded list — flag it
    # if the configured FRONTEND_URL wouldn't actually be allowed, since
    # that mismatch is a known, previously-documented deployment gap.
    hardcoded_origins = {"http://localhost:3000", "http://127.0.0.1:3000"}
    if frontend_url in hardcoded_origins:
        check("CORS: FRONTEND_URL is in the allowed origins", PASS)
    else:
        check(
            "CORS: FRONTEND_URL is in the allowed origins",
            FAIL,
            f"app/main.py only allows {sorted(hardcoded_origins)}; FRONTEND_URL={frontend_url} would be blocked.",
        )


# ----------------------------------------------------------------------
# Production secrets hygiene
# ----------------------------------------------------------------------

def check_production_hygiene() -> None:
    debug = os.getenv("DEBUG", "False").lower() == "true"
    check("Config: DEBUG is off", FAIL if debug else PASS)

    env_file = BACKEND_DIR / ".env"
    if env_file.exists():
        check("Secrets: .env file present locally", PASS, "(never commit this file)")
    else:
        check("Secrets: .env file present locally", NOT_CONFIGURED)

    gitignore = BACKEND_DIR / ".gitignore"
    ignored = gitignore.exists() and ".env" in gitignore.read_text().splitlines()
    check("Secrets: .env is gitignored", PASS if ignored else FAIL)


# ----------------------------------------------------------------------
# Runner
# ----------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live", action="store_true", help="Also attempt real connections (DB, SMTP login, Groq, Whisper model load)."
    )
    args = parser.parse_args()

    check_database(args.live)
    check_alembic(args.live)
    check_groq(args.live)
    check_whisper(args.live)
    check_smtp(args.live)
    check_jwt()
    check_storage()
    check_frontend_and_cors()
    check_production_hygiene()

    width = max(len(name) for name, _, _ in _results) + 2
    failures = 0

    for name, status, detail in _results:
        marker = {"PASS": "[PASS]", "FAIL": "[FAIL]", "NOT CONFIGURED": "[----]"}[status]
        print(f"{marker} {name.ljust(width)} {detail}")
        if status == FAIL:
            failures += 1

    print()
    print(f"{len(_results)} checks, {failures} failing.")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
