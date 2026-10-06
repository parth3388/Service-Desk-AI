import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_REVIEW, extractManagerReview } from "../src/lib/managerReview.mjs";

// Exactly what GET /manager/report/:id returns after a review was saved
// (backend/app/api/manager.py get_company_report).
const savedReportFromApi = () => ({
    id: 5,
    original_filename: "call.wav",
    confidence_score: 87,
    manager_review: {
        rating: 4,
        decision: "Good",
        feedback: "Handled the escalation calmly.",
        recommendation: "Share this call in training."
    }
});

test("save review -> reload report -> review fields are populated", () => {
    // The manager saves this payload (PUT /manager/report/:id/review)...
    const saved = { rating: 4, decision: "Good", feedback: "Handled the escalation calmly.", recommendation: "Share this call in training." };

    // ...and on reload the page receives it nested under manager_review.
    const { exists, review } = extractManagerReview(savedReportFromApi());

    assert.equal(exists, true);
    assert.deepEqual(review, saved);
});

test("editing and re-saving round-trips the edited values", () => {
    const first = extractManagerReview(savedReportFromApi()).review;
    const edited = { ...first, rating: 2, feedback: "Revised." };

    // Simulate the backend echoing the re-saved review on the next load.
    const reloaded = extractManagerReview({ manager_review: edited });

    assert.deepEqual(reloaded.review, edited);
});

test("a report without a review gives the form defaults and exists=false", () => {
    const empty = { manager_review: { rating: null, decision: null, feedback: null, recommendation: null } };

    assert.deepEqual(extractManagerReview(empty), { exists: false, review: { ...DEFAULT_REVIEW } });
    assert.equal(extractManagerReview({}).exists, false);
    assert.equal(extractManagerReview(undefined).exists, false);
    assert.equal(extractManagerReview(null).exists, false);
});

test("the old flat keys the page used to read are NOT what the manager API returns", () => {
    // Regression guard for the original bug: reading these from the manager
    // response always yields undefined, so the review never appeared.
    const report = savedReportFromApi();

    assert.equal(report.manager_rating, undefined);
    assert.equal(report.manager_feedback, undefined);
    assert.equal(extractManagerReview(report).exists, true);
});

test("the employee endpoint's flat shape is understood too", () => {
    const { exists, review } = extractManagerReview({
        manager_rating: 3,
        manager_decision: "Average",
        manager_feedback: "Fine.",
        manager_recommendation: "Practice."
    });

    assert.equal(exists, true);
    assert.deepEqual(review, { rating: 3, decision: "Average", feedback: "Fine.", recommendation: "Practice." });
});

test("a legitimate rating of 0 is kept, not replaced by the default", () => {
    const { exists, review } = extractManagerReview({ manager_review: { rating: 0, decision: null, feedback: null, recommendation: null } });

    assert.equal(exists, true);
    assert.equal(review.rating, 0);
});

test("a review with only a rating still counts as existing and fills the gaps", () => {
    const { exists, review } = extractManagerReview({ manager_review: { rating: 2, decision: null, feedback: null, recommendation: null } });

    assert.equal(exists, true);
    assert.deepEqual(review, { rating: 2, decision: DEFAULT_REVIEW.decision, feedback: "", recommendation: "" });
});

test("nested values win over flat ones", () => {
    const { review } = extractManagerReview({ manager_rating: 1, manager_review: { rating: 5, decision: "Excellent", feedback: "x", recommendation: "y" } });

    assert.equal(review.rating, 5);
});
