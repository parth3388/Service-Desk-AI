"""
Seeds the default IT Service Desk QA scorecard (Pillar 3) described in the
project brief. Idempotent: safe to call on every startup.
"""

from __future__ import annotations

from sqlalchemy.orm import Session, selectinload

from app.models.qa import QACriterion, QAScorecard, QAScorecardVersion, QASection

DEFAULT_SCORECARD_NAME = "IT Service Desk Default"

# (section name, section weight_pct, [(criterion text, weight_pct within section, is_critical)])
DEFAULT_SECTIONS = [
    (
        "Opening & verification",
        10,
        [
            ("Agent greeted the customer professionally and stated their name.", 50, False),
            ("Agent verified the customer's identity/account before discussing details.", 50, True),
        ],
    ),
    (
        "Issue understanding",
        15,
        [
            ("Agent accurately restated or summarized the customer's issue.", 50, False),
            ("Agent asked clarifying questions to fully understand the issue.", 50, False),
        ],
    ),
    (
        "Communication",
        10,
        [
            ("Agent used clear, jargon-free language.", 50, False),
            ("Agent maintained a professional tone throughout the call.", 50, False),
        ],
    ),
    (
        "Empathy",
        10,
        [
            ("Agent acknowledged the customer's frustration or concern.", 50, False),
            ("Agent expressed genuine willingness to help.", 50, False),
        ],
    ),
    (
        "Troubleshooting",
        20,
        [
            ("Agent followed a logical troubleshooting process.", 40, False),
            ("Agent used appropriate tools or knowledge resources.", 30, False),
            ("Agent avoided unnecessary escalation when the issue was resolvable.", 30, False),
        ],
    ),
    (
        "Process compliance",
        15,
        [
            ("Agent followed required verification/security procedures.", 50, True),
            ("Agent logged or documented the interaction per policy.", 50, False),
        ],
    ),
    (
        "Resolution",
        15,
        [
            ("The issue was resolved or a clear next step was provided.", 60, False),
            ("Agent set correct expectations about resolution/follow-up.", 40, False),
        ],
    ),
    (
        "Closure",
        5,
        [
            ("Agent confirmed the customer was satisfied before ending the call.", 50, False),
            ("Agent provided a clear closing summary.", 50, False),
        ],
    ),
]


def ensure_default_scorecard(db: Session) -> QAScorecardVersion:
    """
    Returns the active version of the default scorecard, creating it (and
    the scorecard) on first run. Never duplicates on repeated calls.
    """

    # Eager-load the whole versions -> sections -> criteria chain in one
    # extra round trip instead of N+1 lazy loads (11 separate queries,
    # measured against the real DB, every time a report's AutoQA runs) —
    # correctness-preserving, same rows, fewer round trips.
    scorecard = (
        db.query(QAScorecard)
        .options(
            selectinload(QAScorecard.versions)
            .selectinload(QAScorecardVersion.sections)
            .selectinload(QASection.criteria)
        )
        .filter(QAScorecard.name == DEFAULT_SCORECARD_NAME)
        .first()
    )

    if scorecard is not None:
        version = next((v for v in scorecard.versions if v.is_active), None)
        if version is not None:
            return version

    if scorecard is None:
        scorecard = QAScorecard(
            name=DEFAULT_SCORECARD_NAME,
            description=(
                "Default IT service desk quality scorecard covering opening, "
                "issue understanding, communication, empathy, troubleshooting, "
                "process compliance, resolution and closure."
            ),
            is_active=True,
        )
        db.add(scorecard)
        db.flush()

    version = QAScorecardVersion(
        scorecard_id=scorecard.id,
        version_number=len(scorecard.versions) + 1,
        is_active=True,
    )
    db.add(version)
    db.flush()

    for order, (section_name, section_weight, criteria) in enumerate(DEFAULT_SECTIONS):
        section = QASection(
            scorecard_version_id=version.id,
            name=section_name,
            weight_pct=section_weight,
            order_index=order,
        )
        db.add(section)
        db.flush()

        for c_order, (text, weight, is_critical) in enumerate(criteria):
            db.add(
                QACriterion(
                    section_id=section.id,
                    text=text,
                    weight_pct=weight,
                    is_critical=is_critical,
                    order_index=c_order,
                )
            )

    db.commit()
    db.refresh(version)

    return version
