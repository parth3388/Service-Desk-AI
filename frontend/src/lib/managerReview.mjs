/*
|--------------------------------------------------------------------------
| Manager review <-> API mapping
|--------------------------------------------------------------------------
| GET /manager/report/:id returns the review NESTED:
|
|   report.manager_review = { rating, decision, feedback, recommendation }
|
| (GET /report/:id, used by employees, returns the same data FLAT as
|  manager_rating / manager_decision / manager_feedback / manager_recommendation.)
| Both shapes are understood here, nested first.
*/

export const DEFAULT_REVIEW = {
    rating: 5,
    decision: "Excellent",
    feedback: "",
    recommendation: ""
};

const pick = (nested, flat, nestedKey, flatKey) =>
    nested?.[nestedKey] ?? flat?.[flatKey] ?? null;

/**
 * Returns { exists, review } where `review` is always a complete form value
 * and `exists` says whether the manager has actually saved one before.
 */
export function extractManagerReview(report) {

    const nested =
        report?.manager_review && typeof report.manager_review === "object"
            ? report.manager_review
            : null;

    const rating = pick(nested, report, "rating", "manager_rating");
    const decision = pick(nested, report, "decision", "manager_decision");
    const feedback = pick(nested, report, "feedback", "manager_feedback");
    const recommendation = pick(nested, report, "recommendation", "manager_recommendation");

    const exists =
        rating !== null ||
        Boolean(decision) ||
        Boolean(feedback) ||
        Boolean(recommendation);

    if (!exists) {
        return { exists: false, review: { ...DEFAULT_REVIEW } };
    }

    return {
        exists: true,
        review: {
            rating: rating ?? DEFAULT_REVIEW.rating,
            decision: decision ?? DEFAULT_REVIEW.decision,
            feedback: feedback ?? "",
            recommendation: recommendation ?? ""
        }
    };

}
