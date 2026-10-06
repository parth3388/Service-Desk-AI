import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.core import config
from app.core.config import APP_NAME, APP_VERSION
from app.core.database import Base, SessionLocal, engine

from app.models import (
    User,
    CallAnalysis,
    ReportEmailDelivery,
    AIExecutionLog,
    QAScorecard,
    QAScorecardVersion,
    QASection,
    QACriterion,
    QAEvaluation,
    QACriterionResult
)

from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.upload import router as upload_router
from app.api.report import router as report_router
from app.api.employee import router as employee_router
from app.api.manager import router as manager_router
from app.api.contact import router as contact_router
from app.api.qa import router as qa_router
from app.services.email_delivery import recover_pending_emails
from app.services.qa_defaults import ensure_default_scorecard

# Make application loggers (INFO and above) visible next to uvicorn's own.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

# NOTE ON SCHEMA: report_email_delivery (app/models/email_delivery.py) is a
# NEW TABLE, so the existing Base.metadata.create_all(...) mechanism above
# creates it on its own — no ad-hoc ALTER TABLE was needed or added for it.
# The one ad-hoc ALTER TABLE in this file (_run_schema_patches, below) predates
# this change and is left untouched; it only concerns an existing column on
# call_analysis, not this new table.
#
# WHY create_all() IS STILL HERE (Pilot hardening, Phase 10):
# Alembic (alembic/) is now the source of truth for schema changes on a
# database that already has data (see alembic/versions/ — additive columns
# + new tables, hand-verified upgrade/downgrade). create_all() is kept ONLY
# as a zero-friction bootstrap for a genuinely EMPTY database (e.g. a fresh
# local dev DB): it has no rows to protect, so building it straight from the
# current models is safe and requires no migration step to start coding.
# create_all() never touches a table that already exists, so it can never
# perform the kind of destructive/ad-hoc mutation this phase's brief warns
# against on a database with real data.
#
# The one real risk this created: if create_all() fully provisions a fresh
# database and someone LATER runs `alembic upgrade head` against that same
# database, the additive migrations try to add columns that already exist
# and crash. _stamp_fresh_database_at_alembic_head() below closes that gap by
# marking a create_all-provisioned database as already being at Alembic's
# head, so a later `alembic upgrade head` correctly sees "nothing to do"
# instead of erroring. A database Alembic already manages (has an
# alembic_version table) is left completely alone.


def _stamp_fresh_database_at_alembic_head():

    inspector = inspect(engine)

    if "alembic_version" in inspector.get_table_names():
        # Alembic already owns this database's migration state.
        return

    try:
        from alembic.command import stamp
        from alembic.config import Config as AlembicConfig

        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        alembic_cfg = AlembicConfig(os.path.join(backend_dir, "alembic.ini"))
        alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
        alembic_cfg.set_main_option("sqlalchemy.url", config.DATABASE_URL)

        stamp(alembic_cfg, "head")

        logger.info(
            "Fresh database provisioned by create_all(); stamped at Alembic "
            "head so `alembic upgrade head` is a safe no-op from here."
        )

    except Exception:
        logger.exception("Could not stamp fresh database at Alembic head")


_stamp_fresh_database_at_alembic_head()


# WHY THIS AD-HOC ALTER TABLE IS STILL NEEDED (Pilot hardening, Phase 10):
# incident_number predates Alembic entirely. It is only missing on a
# database created before that column existed in the model — and such a
# database is also old enough to predate every Pillar 1-4 column that
# Alembic's migration 0001 adds. Migration 0001 assumes incident_number
# already exists (it doesn't touch it), so this patch is what makes an
# old database migratable at all: it must run BEFORE `alembic upgrade head`
# is run against that database. On any database created after this column
# was added (which create_all() already provisions correctly), the check
# below is a no-op. Removing it would break upgrading that one specific
# vintage of pre-Alembic database — kept, not removed.
def _run_schema_patches():

    inspector = inspect(engine)

    existing_columns = [
        col["name"]
        for col in inspector.get_columns("call_analysis")
    ]

    with engine.connect() as connection:

        if "incident_number" not in existing_columns:

            logger.info("Adding missing column: call_analysis.incident_number")

            connection.execute(
                text(
                    "ALTER TABLE call_analysis ADD COLUMN incident_number VARCHAR"
                )
            )

            connection.commit()


_run_schema_patches()


def _seed_default_qa_scorecard():
    db = SessionLocal()
    try:
        ensure_default_scorecard(db)
    except Exception:
        logger.exception("Could not seed the default QA scorecard")
    finally:
        db.close()


_seed_default_qa_scorecard()


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(upload_router)
app.include_router(report_router)
app.include_router(employee_router)
app.include_router(manager_router)
app.include_router(contact_router)
app.include_router(qa_router)


# ---- Bounded email-delivery recovery (see services/email_delivery.py) -----
# One pass over reports whose email is PENDING/FAILED/stuck-SENDING, e.g.
# after a restart following a crash. Never loops or retries beyond this;
# each report is also capped at EMAIL_MAX_ATTEMPTS overall. Disabled in
# tests via EMAIL_RECOVERY_ON_STARTUP=false (set in tests/conftest.py)
# so a stray leftover row never dials real SMTP during a test run.

if config.EMAIL_RECOVERY_ON_STARTUP:

    try:
        recover_pending_emails()
    except Exception:
        logger.exception("Startup email recovery pass failed")