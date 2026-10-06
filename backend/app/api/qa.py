from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, manager_required
from app.models.call_analysis import CallAnalysis, ProcessingStatus
from app.models.qa import QACriterionResult, QAEvaluation
from app.models.user import User, UserRole
from app.schemas.qa_api import QACriterionOverrideRequest
from app.services.qa_defaults import ensure_default_scorecard
from app.services.qa_engine import (
    apply_human_override,
    compute_calibration_metrics,
    get_latest_evaluation,
    list_evaluation_history,
    run_ai_qa_evaluation,
)

router = APIRouter(prefix="/qa", tags=["QA"])


def _visible_report(db: Session, user: User, report_id: int) -> CallAnalysis:
    query = db.query(CallAnalysis).filter(CallAnalysis.id == report_id)

    if user.role != UserRole.MANAGER:
        query = query.filter(CallAnalysis.employee_id == user.id)

    report = query.first()

    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")

    return report


def _serialize_scorecard_version(version):
    return {
        "id": version.id,
        "version_number": version.version_number,
        "scorecard_name": version.scorecard.name,
        "sections": [
            {
                "id": section.id,
                "name": section.name,
                "weight_pct": section.weight_pct,
                "criteria": [
                    {
                        "id": criterion.id,
                        "text": criterion.text,
                        "weight_pct": criterion.weight_pct,
                        "is_critical": criterion.is_critical,
                    }
                    for criterion in section.criteria
                ],
            }
            for section in version.sections
        ],
    }


def _serialize_evaluation(evaluation: QAEvaluation) -> dict:
    if evaluation is None:
        return None

    results_by_criterion = {r.criterion_id: r for r in evaluation.criterion_results}

    sections = []

    for section in evaluation.scorecard_version.sections:
        criteria_out = []

        for criterion in section.criteria:
            result = results_by_criterion.get(criterion.id)

            criteria_out.append(
                {
                    "criterion_id": criterion.id,
                    "text": criterion.text,
                    "weight_pct": criterion.weight_pct,
                    "is_critical": criterion.is_critical,
                    "ai_score": result.ai_score if result else None,
                    "ai_pass": result.ai_pass if result else None,
                    "ai_confidence": result.ai_confidence if result else None,
                    "ai_rationale": result.ai_rationale if result else None,
                    "evidence_quote": result.evidence_quote if result else None,
                    "evidence_segment": result.evidence_segment if result else None,
                    "evidence_verified": result.evidence_verified if result else False,
                    "human_score": result.human_score if result else None,
                    "human_pass": result.human_pass if result else None,
                    "human_comment": result.human_comment if result else None,
                    "disputed": result.disputed if result else False,
                    "overridden": result.overridden if result else False,
                    "reviewer_id": result.reviewer_id if result else None,
                    "reviewed_at": result.reviewed_at if result else None,
                    "criterion_result_id": result.id if result else None,
                }
            )

        sections.append(
            {
                "id": section.id,
                "name": section.name,
                "weight_pct": section.weight_pct,
                "criteria": criteria_out,
            }
        )

    return {
        "id": evaluation.id,
        "call_analysis_id": evaluation.call_analysis_id,
        "version_number": evaluation.version_number,
        "is_latest": evaluation.is_latest,
        "scorecard_version_id": evaluation.scorecard_version_id,
        "scorecard_name": evaluation.scorecard_version.scorecard.name,
        "model": evaluation.model,
        "prompt_version": evaluation.prompt_version,
        "ai_total_score": evaluation.ai_total_score,
        "ai_passed": evaluation.ai_passed,
        "human_total_score": evaluation.human_total_score,
        "overridden": evaluation.overridden,
        "status": evaluation.status,
        "error_reason": evaluation.error_reason,
        "generated_at": evaluation.generated_at,
        "sections": sections,
    }


def _serialize_history_entry(evaluation: QAEvaluation) -> dict:
    return {
        "id": evaluation.id,
        "version_number": evaluation.version_number,
        "is_latest": evaluation.is_latest,
        "status": evaluation.status,
        "ai_total_score": evaluation.ai_total_score,
        "ai_passed": evaluation.ai_passed,
        "human_total_score": evaluation.human_total_score,
        "overridden": evaluation.overridden,
        "generated_at": evaluation.generated_at,
        "created_at": evaluation.created_at,
    }


@router.get("/scorecard")
def get_active_scorecard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    version = ensure_default_scorecard(db)

    return {"status": "success", "scorecard": _serialize_scorecard_version(version)}


@router.get("/evaluations/{report_id}")
def get_evaluation(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the LATEST AutoQA evaluation for this report (if any)."""

    report = _visible_report(db, current_user, report_id)

    evaluation = get_latest_evaluation(db, report.id)

    if evaluation is None:
        return {"status": "success", "evaluation": None}

    return {"status": "success", "evaluation": _serialize_evaluation(evaluation)}


@router.get("/evaluations/{report_id}/history")
def get_evaluation_history(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every AutoQA run for this report, oldest first, for a version picker."""

    report = _visible_report(db, current_user, report_id)

    history = list_evaluation_history(db, report.id)

    return {
        "status": "success",
        "history": [_serialize_history_entry(e) for e in history],
    }


@router.get("/evaluations/{report_id}/versions/{evaluation_id}")
def get_evaluation_version(
    report_id: int,
    evaluation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full detail for one specific past evaluation (evidence, overrides, ...)."""

    report = _visible_report(db, current_user, report_id)

    evaluation = (
        db.query(QAEvaluation)
        .filter(
            QAEvaluation.id == evaluation_id,
            QAEvaluation.call_analysis_id == report.id,
        )
        .first()
    )

    if evaluation is None:
        raise HTTPException(status_code=404, detail="QA evaluation not found.")

    return {"status": "success", "evaluation": _serialize_evaluation(evaluation)}


@router.post("/evaluations/{report_id}/rerun")
def rerun_evaluation(
    report_id: int,
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db),
):
    report = _visible_report(db, current_user, report_id)

    if report.processing_status != ProcessingStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="AutoQA can only run on a completed report.",
        )

    evaluation = run_ai_qa_evaluation(db, report)

    return {"status": "success", "evaluation": _serialize_evaluation(evaluation)}


@router.put("/evaluations/{report_id}/criteria/{criterion_result_id}")
def override_criterion(
    report_id: int,
    criterion_result_id: int,
    body: QACriterionOverrideRequest,
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db),
):
    report = _visible_report(db, current_user, report_id)

    criterion_result = (
        db.query(QACriterionResult)
        .join(QAEvaluation)
        .filter(
            QACriterionResult.id == criterion_result_id,
            QAEvaluation.call_analysis_id == report.id,
        )
        .first()
    )

    if criterion_result is None:
        raise HTTPException(status_code=404, detail="QA criterion result not found.")

    evaluation = apply_human_override(
        db,
        criterion_result,
        reviewer_id=current_user.id,
        human_score=body.human_score,
        human_pass=body.human_pass,
        human_comment=body.human_comment,
        disputed=body.disputed,
    )

    return {"status": "success", "evaluation": _serialize_evaluation(evaluation)}


@router.get("/calibration")
def get_calibration(
    current_user: User = Depends(manager_required),
    db: Session = Depends(get_db),
):
    return {"status": "success", "calibration": compute_calibration_metrics(db)}
