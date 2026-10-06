"""QA evaluation versioning (Pilot hardening, Phase 2).

Previously a rerun replaced the single QAEvaluation row for a report.
Every AutoQA run now creates its own row: adds `version_number` and
`is_latest`, and removes the one-evaluation-per-report unique constraint.

No data is destroyed: any existing qa_evaluation row is backfilled as
version 1 / is_latest=True, which is exactly what "the current evaluation"
already meant under the old one-row-per-report model.

Dialect-specific upgrade path (fixed after a live-Postgres failure):
Postgres supports every change here (add column, drop/add constraint,
drop/add index) as a plain, native ALTER TABLE — no table rebuild needed.
The first version of this migration used `batch_alter_table(...,
recreate="always")` unconditionally, which forces Alembic to
CREATE-a-new-table / COPY / DROP-the-old-table / RENAME even on Postgres.
That DROP TABLE qa_evaluation failed because qa_criterion_result has a
foreign key into it (`qa_criterion_result_evaluation_id_fkey`) — correctly
refused by Postgres since no CASCADE is used anywhere in this project.
SQLite still needs batch mode: `unique=True` on a column there bakes an
ANONYMOUS UNIQUE constraint into the table that reflection cannot target
by name, so batch mode is given the table's pre-migration shape explicitly
(`copy_from`) and rebuilds without carrying that constraint over. SQLite has
no incoming foreign keys into qa_evaluation enforced at the engine level in
the test/dev databases this runs against, so the rebuild is safe there.

The Postgres constraint/index names below (`qa_evaluation_call_analysis_id_key`,
`ix_qa_evaluation_call_analysis_id`) were confirmed against a real database
that had just run this migration's own upgrade() for 0001 — not guessed.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        _upgrade_postgresql()
    else:
        _upgrade_sqlite()


def _upgrade_postgresql() -> None:
    # Native ALTER TABLE only — qa_evaluation is never dropped or recreated,
    # so the qa_criterion_result.evaluation_id foreign key into it is
    # untouched throughout.
    op.add_column(
        "qa_evaluation",
        sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "qa_evaluation",
        sa.Column("is_latest", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    # Drop BOTH objects 0001 created on call_analysis_id: the auto-named
    # unique constraint (from the column's unique=True) and the explicitly
    # named unique index — confirmed via pg_constraint/pg_indexes to be two
    # distinct objects, not one.
    op.drop_constraint("qa_evaluation_call_analysis_id_key", "qa_evaluation", type_="unique")
    op.drop_index("ix_qa_evaluation_call_analysis_id", table_name="qa_evaluation")

    # Replace with a plain (non-unique) index — still useful for lookups by
    # report — plus the new versioning index and composite uniqueness rule.
    op.create_index("ix_qa_evaluation_call_analysis_id", "qa_evaluation", ["call_analysis_id"])
    op.create_index("ix_qa_evaluation_is_latest", "qa_evaluation", ["is_latest"])
    op.create_unique_constraint(
        "uq_qa_evaluation_call_analysis_version", "qa_evaluation", ["call_analysis_id", "version_number"]
    )


def _upgrade_sqlite() -> None:
    old_table = sa.Table(
        "qa_evaluation",
        sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("call_analysis_id", sa.Integer(), sa.ForeignKey("call_analysis.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scorecard_version_id", sa.Integer(), sa.ForeignKey("qa_scorecard_version.id"), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("prompt_version", sa.String(length=20), nullable=True),
        sa.Column("ai_total_score", sa.Float(), nullable=True),
        sa.Column("ai_passed", sa.Boolean(), nullable=True),
        sa.Column("human_total_score", sa.Float(), nullable=True),
        sa.Column("overridden", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("error_reason", sa.String(length=300), nullable=True),
        sa.Column("generated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    with op.batch_alter_table("qa_evaluation", copy_from=old_table, recreate="always") as batch_op:
        batch_op.add_column(
            sa.Column("version_number", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(
            sa.Column("is_latest", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.create_index("ix_qa_evaluation_call_analysis_id", ["call_analysis_id"])
        batch_op.create_index("ix_qa_evaluation_is_latest", ["is_latest"])
        batch_op.create_unique_constraint(
            "uq_qa_evaluation_call_analysis_version", ["call_analysis_id", "version_number"]
        )


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        _downgrade_postgresql()
    else:
        _downgrade_sqlite()


def _downgrade_postgresql() -> None:
    op.drop_constraint("uq_qa_evaluation_call_analysis_version", "qa_evaluation", type_="unique")
    op.drop_index("ix_qa_evaluation_is_latest", table_name="qa_evaluation")
    op.drop_index("ix_qa_evaluation_call_analysis_id", table_name="qa_evaluation")
    op.create_index("ix_qa_evaluation_call_analysis_id", "qa_evaluation", ["call_analysis_id"], unique=True)
    op.drop_column("qa_evaluation", "is_latest")
    op.drop_column("qa_evaluation", "version_number")


def _downgrade_sqlite() -> None:
    with op.batch_alter_table("qa_evaluation") as batch_op:
        batch_op.drop_constraint("uq_qa_evaluation_call_analysis_version", type_="unique")
        batch_op.drop_index("ix_qa_evaluation_is_latest")
        batch_op.drop_index("ix_qa_evaluation_call_analysis_id")
        batch_op.create_index("ix_qa_evaluation_call_analysis_id", ["call_analysis_id"], unique=True)
        batch_op.drop_column("is_latest")
        batch_op.drop_column("version_number")
