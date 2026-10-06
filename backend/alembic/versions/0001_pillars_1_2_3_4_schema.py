"""Pillar 1/2/3/4: canonical interaction fields, PII redaction columns,
AutoQA scorecard/evaluation tables, and the AI execution log.

Purely additive: new nullable columns (with safe backfill defaults) on the
existing call_analysis table, plus brand-new tables. No existing column is
altered or dropped, and no existing data is touched beyond the backfill
defaults below.

Revision ID: 0001
Revises:
Create Date: 2026-09-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- call_analysis: additive columns (Pillar 1 / Pillar 2) -----------
    with op.batch_alter_table("call_analysis") as batch_op:
        batch_op.add_column(
            sa.Column("channel", sa.String(length=30), nullable=False, server_default="voice_call")
        )
        batch_op.add_column(sa.Column("source", sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column("language", sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column("disposition", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("redacted_transcript", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("pii_detected", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(sa.Column("pii_findings", sa.JSON(), nullable=True))

    # ---- AI execution log (Pillar 9) --------------------------------------
    op.create_table(
        "ai_execution_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "call_analysis_id",
            sa.Integer(),
            sa.ForeignKey("call_analysis.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("use_case", sa.String(length=40), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("prompt_version", sa.String(length=20), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="success"),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=True),
        sa.Column("error_reason", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_ai_execution_log_call_analysis_id", "ai_execution_log", ["call_analysis_id"])
    op.create_index("ix_ai_execution_log_use_case", "ai_execution_log", ["use_case"])
    op.create_index("ix_ai_execution_log_created_at", "ai_execution_log", ["created_at"])

    # ---- QA scorecard hierarchy (Pillar 3) --------------------------------
    op.create_table(
        "qa_scorecard",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "qa_scorecard_version",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "scorecard_id", sa.Integer(), sa.ForeignKey("qa_scorecard.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("scorecard_id", "version_number"),
    )

    op.create_table(
        "qa_section",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "scorecard_version_id",
            sa.Integer(),
            sa.ForeignKey("qa_scorecard_version.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("weight_pct", sa.Float(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "qa_criterion",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "section_id", sa.Integer(), sa.ForeignKey("qa_section.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("weight_pct", sa.Float(), nullable=False),
        sa.Column("is_critical", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )

    # ---- QA evaluations + evidence-linked criterion results (Pillar 3/4) --
    op.create_table(
        "qa_evaluation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "call_analysis_id",
            sa.Integer(),
            sa.ForeignKey("call_analysis.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
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
    op.create_index("ix_qa_evaluation_call_analysis_id", "qa_evaluation", ["call_analysis_id"], unique=True)

    op.create_table(
        "qa_criterion_result",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "evaluation_id", sa.Integer(), sa.ForeignKey("qa_evaluation.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("criterion_id", sa.Integer(), sa.ForeignKey("qa_criterion.id"), nullable=False),
        sa.Column("ai_score", sa.Float(), nullable=True),
        sa.Column("ai_pass", sa.Boolean(), nullable=True),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("ai_rationale", sa.Text(), nullable=True),
        sa.Column("evidence_quote", sa.Text(), nullable=True),
        sa.Column("evidence_segment", sa.String(length=100), nullable=True),
        sa.Column("evidence_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("human_score", sa.Float(), nullable=True),
        sa.Column("human_pass", sa.Boolean(), nullable=True),
        sa.Column("human_comment", sa.Text(), nullable=True),
        sa.Column("disputed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("overridden", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("reviewer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_qa_criterion_result_evaluation_id", "qa_criterion_result", ["evaluation_id"])


def downgrade() -> None:
    op.drop_index("ix_qa_criterion_result_evaluation_id", table_name="qa_criterion_result")
    op.drop_table("qa_criterion_result")

    op.drop_index("ix_qa_evaluation_call_analysis_id", table_name="qa_evaluation")
    op.drop_table("qa_evaluation")

    op.drop_table("qa_criterion")
    op.drop_table("qa_section")
    op.drop_table("qa_scorecard_version")
    op.drop_table("qa_scorecard")

    op.drop_index("ix_ai_execution_log_created_at", table_name="ai_execution_log")
    op.drop_index("ix_ai_execution_log_use_case", table_name="ai_execution_log")
    op.drop_index("ix_ai_execution_log_call_analysis_id", table_name="ai_execution_log")
    op.drop_table("ai_execution_log")

    with op.batch_alter_table("call_analysis") as batch_op:
        batch_op.drop_column("pii_findings")
        batch_op.drop_column("pii_detected")
        batch_op.drop_column("redacted_transcript")
        batch_op.drop_column("disposition")
        batch_op.drop_column("language")
        batch_op.drop_column("source")
        batch_op.drop_column("channel")
