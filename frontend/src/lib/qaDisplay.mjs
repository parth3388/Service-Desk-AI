/*
|--------------------------------------------------------------------------
| AutoQA display helpers (Pillar 3/4)
|--------------------------------------------------------------------------
| Pure functions used by the QA evaluation UI. Kept framework-free (like
| lib/managerReview.mjs, lib/processingPoll.mjs) so the display rules —
| "human overrides win, AI is the fallback", "never show a score without a
| reason", "critical failure gates the pass/fail badge" — are unit-tested
| without rendering React.
*/

/** The score actually shown for the whole evaluation: human review wins. */
export function effectiveTotalScore(evaluation) {
    if (!evaluation) return null;
    return evaluation.human_total_score ?? evaluation.ai_total_score ?? null;
}

/** The score shown for one criterion row: human override wins over AI. */
export function effectiveCriterionScore(criterion) {
    if (!criterion) return null;
    return criterion.human_score ?? criterion.ai_score ?? null;
}

/** True/False/null ("not scored"), human override wins over AI. */
export function effectiveCriterionPass(criterion) {
    if (!criterion) return null;
    if (criterion.human_pass !== null && criterion.human_pass !== undefined) {
        return criterion.human_pass;
    }
    return criterion.ai_pass ?? null;
}

/**
 * Whether the evidence for a criterion should be shown as trustworthy.
 * An AI score with no evidence, or evidence that couldn't be located in the
 * transcript, must never be presented as if it were confirmed.
 */
export function evidenceIsTrustworthy(criterion) {
    if (!criterion) return false;
    if (criterion.overridden) return true; // a human already reviewed it
    return Boolean(criterion.evidence_quote) && criterion.evidence_verified === true;
}

/**
 * Validates a human-override form before it is sent to the API. Mirrors
 * the backend's QACriterionOverrideRequest bounds (0-100, comment <= 2000).
 * Returns a list of user-facing error strings (empty = valid).
 */
export function validateOverrideForm({ human_score, human_comment }) {
    const errors = [];

    if (human_score !== null && human_score !== undefined && human_score !== "") {
        const score = Number(human_score);
        if (Number.isNaN(score) || score < 0 || score > 100) {
            errors.push("Score must be a number between 0 and 100.");
        }
    }

    if (typeof human_comment === "string" && human_comment.length > 2000) {
        errors.push("Comment must be 2000 characters or fewer.");
    }

    return errors;
}

/**
 * Builds the PUT body from raw form state, omitting fields the evaluator
 * left untouched so an empty score field never overwrites a saved one.
 */
export function buildOverridePayload({ human_score, human_pass, human_comment, disputed }) {
    const payload = {};

    if (human_score !== null && human_score !== undefined && human_score !== "") {
        payload.human_score = Number(human_score);
    }
    if (human_pass !== null && human_pass !== undefined) {
        payload.human_pass = human_pass;
    }
    if (typeof human_comment === "string" && human_comment.trim() !== "") {
        payload.human_comment = human_comment;
    }
    if (typeof disputed === "boolean") {
        payload.disputed = disputed;
    }

    return payload;
}

/** Turns the PII findings summary ([{type,count}]) into one readable line. */
export function summarizePiiFindings(findings) {
    if (!Array.isArray(findings) || findings.length === 0) return null;

    const labels = {
        EMAIL: "email",
        PHONE: "phone number",
        AADHAAR: "Aadhaar-like number",
        CREDIT_CARD: "card number",
        API_KEY: "API key/secret",
        SECRET: "secret",
        PASSWORD: "password",
    };

    return findings
        .map(({ type, count }) => {
            const label = labels[type] || type.toLowerCase();
            return `${count} ${label}${count === 1 ? "" : "s"}`;
        })
        .join(", ");
}

/** Human-readable calibration summary line, honest about "not enough data". */
export function describeCalibration(calibration) {
    if (!calibration || calibration.insufficient_data) {
        return "Not enough reviewed evaluations yet to show calibration.";
    }

    const pct = Math.round(calibration.agreement_rate * 100);
    return `${pct}% agreement across ${calibration.override_count} reviewed criteria.`;
}
