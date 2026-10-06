import test from "node:test";
import assert from "node:assert/strict";

import {
    buildOverridePayload,
    describeCalibration,
    effectiveCriterionPass,
    effectiveCriterionScore,
    effectiveTotalScore,
    evidenceIsTrustworthy,
    summarizePiiFindings,
    validateOverrideForm,
} from "../src/lib/qaDisplay.mjs";

test("effectiveTotalScore prefers the human score once one exists", () => {
    assert.equal(effectiveTotalScore({ ai_total_score: 70, human_total_score: 90 }), 90);
    assert.equal(effectiveTotalScore({ ai_total_score: 70, human_total_score: null }), 70);
    assert.equal(effectiveTotalScore(null), null);
});

test("effectiveCriterionScore prefers human_score over ai_score", () => {
    assert.equal(effectiveCriterionScore({ ai_score: 60, human_score: 20 }), 20);
    assert.equal(effectiveCriterionScore({ ai_score: 60, human_score: null }), 60);
    assert.equal(effectiveCriterionScore({ ai_score: null, human_score: null }), null);
});

test("effectiveCriterionPass distinguishes an explicit false override from 'not set'", () => {
    assert.equal(effectiveCriterionPass({ ai_pass: true, human_pass: false }), false);
    assert.equal(effectiveCriterionPass({ ai_pass: true, human_pass: null }), true);
    assert.equal(effectiveCriterionPass({ ai_pass: null, human_pass: null }), null);
});

test("evidenceIsTrustworthy requires a verified quote unless a human already reviewed it", () => {
    assert.equal(
        evidenceIsTrustworthy({ evidence_quote: "hi", evidence_verified: true, overridden: false }),
        true
    );
    assert.equal(
        evidenceIsTrustworthy({ evidence_quote: "hi", evidence_verified: false, overridden: false }),
        false
    );
    assert.equal(evidenceIsTrustworthy({ evidence_quote: null, evidence_verified: false, overridden: false }), false);
    // A human reviewing an unverified AI quote is enough to trust the row.
    assert.equal(
        evidenceIsTrustworthy({ evidence_quote: "hi", evidence_verified: false, overridden: true }),
        true
    );
});

test("validateOverrideForm rejects out-of-range scores and overlong comments", () => {
    assert.deepEqual(validateOverrideForm({ human_score: 50, human_comment: "ok" }), []);
    assert.deepEqual(validateOverrideForm({ human_score: "", human_comment: "" }), []);
    assert.equal(validateOverrideForm({ human_score: 150 }).length, 1);
    assert.equal(validateOverrideForm({ human_score: -1 }).length, 1);
    assert.equal(validateOverrideForm({ human_score: "abc" }).length, 1);
    assert.equal(validateOverrideForm({ human_comment: "x".repeat(2001) }).length, 1);
});

test("buildOverridePayload omits untouched fields so they don't clobber saved values", () => {
    assert.deepEqual(
        buildOverridePayload({ human_score: 80, human_pass: null, human_comment: "", disputed: undefined }),
        { human_score: 80 }
    );
    assert.deepEqual(
        buildOverridePayload({ human_score: "", human_pass: false, human_comment: "Missed a step", disputed: true }),
        { human_pass: false, human_comment: "Missed a step", disputed: true }
    );
    assert.deepEqual(buildOverridePayload({}), {});
});

test("summarizePiiFindings produces a readable, pluralized summary", () => {
    assert.equal(
        summarizePiiFindings([{ type: "EMAIL", count: 2 }, { type: "PHONE", count: 1 }]),
        "2 emails, 1 phone number"
    );
    assert.equal(summarizePiiFindings([]), null);
    assert.equal(summarizePiiFindings(null), null);
});

test("describeCalibration is honest about insufficient data", () => {
    assert.match(describeCalibration({ insufficient_data: true }), /not enough/i);
    assert.match(describeCalibration(null), /not enough/i);
    assert.equal(
        describeCalibration({ insufficient_data: false, agreement_rate: 0.75, override_count: 8 }),
        "75% agreement across 8 reviewed criteria."
    );
});
