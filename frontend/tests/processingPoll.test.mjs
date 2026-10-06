import test from "node:test";
import assert from "node:assert/strict";

import {
    INVALID_RESPONSE_MESSAGE,
    allSettled,
    describeStage,
    itemFromAcceptResponse,
    itemFromStatusReport,
    itemsFromAcceptResponse,
    mergeStatusReports,
    pendingIds,
    resolvePollOutcome,
    stagePercent,
    toReportId,
} from "../src/lib/processingPoll.mjs";

const EMPLOYEE = { reportBasePath: "/employee/reports" };

// ---- exact shapes backend/app/api/upload.py returns ------------------------

const accepted = (overrides = {}) => ({
    id: 42,
    original_filename: "call.wav",
    status: "accepted",
    processing_status: "TRANSCRIBING",
    created_at: "2026-09-22T10:00:00",
    ...overrides,
});

const rejected = (overrides = {}) => ({
    original_filename: "call.ogg",
    status: "failed",
    error: "Unsupported audio format. Allowed formats: MP3, WAV, AAC, M4A.",
    ...overrides,
});

const processingStatus = (overrides = {}) => ({
    id: 42,
    original_filename: "call.wav",
    processing_status: "AI_ANALYZING",
    state: "processing",
    stalled: false,
    error: null,
    updated_at: "2026-09-22T10:00:01",
    ...overrides,
});

const completedStatus = (overrides = {}) => ({
    id: 42,
    original_filename: "call.wav",
    processing_status: "COMPLETED",
    state: "completed",
    stalled: false,
    error: null,
    confidence_score: 87,
    email_status: "SENT",
    ...overrides,
});

const failedStatus = (overrides = {}) => ({
    id: 42,
    original_filename: "call.wav",
    processing_status: "FAILED",
    state: "failed",
    stalled: false,
    error: "The AI returned an invalid analysis. Please retry.",
    ...overrides,
});

// ---- accept-response parsing ------------------------------------------------

test("an accepted item becomes a processing item with its id", () => {
    const item = itemFromAcceptResponse(accepted());

    assert.equal(item.outcome, "processing");
    assert.equal(item.id, 42);
    assert.equal(item.retryId, null);   // not retryable while still processing
});

test("a pre-storage rejection becomes a failed item with no id, unretryable", () => {
    const item = itemFromAcceptResponse(rejected());

    assert.equal(item.outcome, "failed");
    assert.equal(item.id, null);
    assert.equal(item.retryId, null);
    assert.match(item.error, /Unsupported audio format/);
});

test("an accepted item without a valid id is invalid, never treated as queued", () => {
    for (const bad of [undefined, null, 0, -1, "abc", "undefined", {}, []]) {
        const item = itemFromAcceptResponse(accepted({ id: bad }));
        assert.equal(item.outcome, "invalid");
        assert.notEqual(item.outcome, "processing");
    }
});

test("itemsFromAcceptResponse handles the batch shape", () => {
    const items = itemsFromAcceptResponse({
        status: "partial_success",
        reports: [accepted({ id: 1 }), rejected()],
    });

    assert.equal(items.length, 2);
    assert.equal(items[0].outcome, "processing");
    assert.equal(items[1].outcome, "failed");
});

test("itemsFromAcceptResponse handles the single-generate { report } shape", () => {
    const items = itemsFromAcceptResponse({ status: "accepted", report: accepted({ id: 9 }) });

    assert.equal(items.length, 1);
    assert.equal(items[0].id, 9);
});

for (const [label, body] of [
    ["undefined", undefined],
    ["null", null],
    ["empty object", {}],
    ["empty reports array", { reports: [] }],
    ["reports not an array", { reports: "nope" }],
    ["report is an array", { report: [] }],
]) {
    test(`itemsFromAcceptResponse(${label}) is null, never a phantom queued item`, () => {
        assert.equal(itemsFromAcceptResponse(body), null);
    });
}

// ---- status-report parsing ---------------------------------------------------

test("a processing status report stays processing and carries `stalled`", () => {
    const item = itemFromStatusReport(processingStatus({ stalled: true }));

    assert.equal(item.outcome, "processing");
    assert.equal(item.stalled, true);
});

test("a completed status report carries score and email status", () => {
    const item = itemFromStatusReport(completedStatus());

    assert.equal(item.outcome, "completed");
    assert.equal(item.confidenceScore, 87);
    assert.equal(item.emailStatus, "SENT");
    assert.equal(item.retryId, null);   // completed reports are not retryable
});

test("a failed status report is retryable via its id", () => {
    const item = itemFromStatusReport(failedStatus());

    assert.equal(item.outcome, "failed");
    assert.equal(item.retryId, 42);
});

test("an unrecognised state is treated as still processing, never as done", () => {
    const item = itemFromStatusReport(processingStatus({ state: "weird-future-state" }));

    assert.equal(item.outcome, "processing");
});

test("a status report with no id is invalid", () => {
    const item = itemFromStatusReport(completedStatus({ id: undefined }));

    assert.equal(item.outcome, "invalid");
});

// ---- merging polled updates into existing items -------------------------------

test("mergeStatusReports updates matching items by id and leaves others untouched", () => {
    const items = [
        itemFromAcceptResponse(accepted({ id: 1 })),
        itemFromAcceptResponse(accepted({ id: 2 })),
        itemFromAcceptResponse(rejected()),   // id: null
    ];

    const merged = mergeStatusReports(items, [
        completedStatus({ id: 1 }),
        // id 2 not included in this poll response — must stay untouched
    ]);

    assert.equal(merged[0].outcome, "completed");
    assert.equal(merged[1].outcome, "processing");   // unchanged
    assert.equal(merged[2].outcome, "failed");       // the id:null item, unchanged
});

test("mergeStatusReports on an already-settled item is a harmless no-op", () => {
    const items = [itemFromStatusReport(completedStatus({ id: 5 }))];

    const merged = mergeStatusReports(items, [completedStatus({ id: 5 })]);

    assert.equal(merged[0].outcome, "completed");
});

test("allSettled / pendingIds reflect the mix of outcomes", () => {
    const items = [
        itemFromAcceptResponse(accepted({ id: 1 })),
        itemFromStatusReport(completedStatus({ id: 2 })),
    ];

    assert.equal(allSettled(items), false);
    assert.deepEqual(pendingIds(items), [1]);

    const settled = mergeStatusReports(items, [completedStatus({ id: 1 })]);
    assert.equal(allSettled(settled), true);
    assert.deepEqual(pendingIds(settled), []);
});

// ---- resolvePollOutcome: single file ------------------------------------------

test("single file still processing -> kind processing, no navigation", () => {
    const items = [itemFromAcceptResponse(accepted())];

    assert.deepEqual(resolvePollOutcome(items, EMPLOYEE), { kind: "processing" });
});

test("single file completed -> navigate using the real id, never /undefined", () => {
    const items = mergeStatusReports(
        [itemFromAcceptResponse(accepted({ id: 42 }))],
        [completedStatus({ id: 42 })]
    );

    const outcome = resolvePollOutcome(items, EMPLOYEE);

    assert.equal(outcome.kind, "navigate");
    assert.equal(outcome.path, "/employee/reports/42");
    assert.doesNotMatch(outcome.path, /undefined|null|NaN/);
    assert.equal(outcome.notice, null);
});

test("single file completed but email failed -> still navigates, with a notice", () => {
    const items = [itemFromStatusReport(completedStatus({ email_status: "FAILED" }))];

    const outcome = resolvePollOutcome(items, EMPLOYEE);

    assert.equal(outcome.kind, "navigate");
    assert.match(outcome.notice, /email could not be sent/);
});

test("single file completed with email still PENDING/SENDING -> no false failure notice", () => {
    // The email-delivery row is created PENDING in the same commit that
    // marks the report COMPLETED; the actual send happens moments later.
    // A poll catching that in-flight window must not claim it "could not
    // be sent" — it hasn't failed, it just hasn't finished yet.
    for (const inFlightStatus of ["PENDING", "SENDING"]) {
        const items = [itemFromStatusReport(completedStatus({ email_status: inFlightStatus }))];

        const outcome = resolvePollOutcome(items, EMPLOYEE);

        assert.equal(outcome.kind, "navigate", inFlightStatus);
        assert.equal(outcome.notice, null, inFlightStatus);
    }
});

test("single file failed -> failure with the message and a retry id", () => {
    const items = [itemFromStatusReport(failedStatus())];

    const outcome = resolvePollOutcome(items, EMPLOYEE);

    assert.equal(outcome.kind, "failure");
    assert.equal(outcome.message, "The AI returned an invalid analysis. Please retry.");
    assert.equal(outcome.retryId, 42);
});

test("single file rejected before storage -> failure, no retry id, never navigates", () => {
    const items = [itemFromAcceptResponse(rejected())];

    const outcome = resolvePollOutcome(items, EMPLOYEE);

    assert.equal(outcome.kind, "failure");
    assert.equal(outcome.retryId, null);
});

test("an invalid single item is an error, never a navigation", () => {
    const items = [itemFromAcceptResponse(accepted({ id: "not-a-number" }))];

    const outcome = resolvePollOutcome(items, EMPLOYEE);

    assert.equal(outcome.kind, "error");
});

for (const [label, body] of [
    ["undefined", undefined],
    ["null", null],
    ["empty array", []],
]) {
    test(`resolvePollOutcome(${label}) is an error, never a navigation`, () => {
        const outcome = resolvePollOutcome(body, EMPLOYEE);
        assert.equal(outcome.kind, "error");
        assert.equal(outcome.message, INVALID_RESPONSE_MESSAGE);
    });
}

// ---- resolvePollOutcome: batch --------------------------------------------------

test("batch still has items processing -> kind processing, table not shown yet", () => {
    const items = [
        itemFromStatusReport(completedStatus({ id: 1 })),
        itemFromAcceptResponse(accepted({ id: 2 })),
    ];

    assert.deepEqual(resolvePollOutcome(items, EMPLOYEE), { kind: "processing" });
});

test("batch fully settled -> results with per-item outcomes and counts", () => {
    const items = mergeStatusReports(
        [
            itemFromAcceptResponse(accepted({ id: 1 })),
            itemFromAcceptResponse(accepted({ id: 2 })),
            itemFromAcceptResponse(rejected()),
        ],
        [completedStatus({ id: 1 }), failedStatus({ id: 2 })]
    );

    const outcome = resolvePollOutcome(items, EMPLOYEE);

    assert.equal(outcome.kind, "results");
    assert.deepEqual(
        outcome.items.map((i) => i.outcome),
        ["completed", "failed", "failed"]
    );
    assert.deepEqual(outcome.counts, { processing: 0, completed: 1, failed: 2, invalid: 0 });
});

test("in a settled batch, a failed item never appears as successful", () => {
    const items = mergeStatusReports(
        [itemFromAcceptResponse(accepted({ id: 1 })), itemFromAcceptResponse(accepted({ id: 2 }))],
        [failedStatus({ id: 1 }), failedStatus({ id: 2 })]
    );

    const outcome = resolvePollOutcome(items, EMPLOYEE);

    assert.equal(outcome.counts.completed, 0);
    assert.equal(outcome.counts.failed, 2);
});

// ---- describeStage: honest status text, never a fabricated percentage --------

test("describeStage shows the backend's real stage name for a single file", () => {
    const items = [itemFromAcceptResponse(accepted({ processing_status: "TRANSCRIBING" }))];

    assert.equal(describeStage(items), "Transcribing the audio");
});

test("describeStage updates as the real stage advances", () => {
    const item = itemFromStatusReport(processingStatus({ processing_status: "AI_ANALYZING" }));

    assert.equal(describeStage([item]), "Analyzing the conversation");
});

test("describeStage never contains a percent sign or a fabricated number", () => {
    const stages = ["UPLOADING", "TRANSCRIBING", "AI_ANALYZING", "GENERATING_REPORT", null, "unknown"];

    for (const processing_status of stages) {
        const label = describeStage([itemFromStatusReport(processingStatus({ processing_status }))]);
        assert.doesNotMatch(label, /%/);
        assert.doesNotMatch(label, /^\d+$/);
    }
});

test("describeStage summarises a batch as a real completed-so-far count", () => {
    const items = mergeStatusReports(
        [
            itemFromAcceptResponse(accepted({ id: 1 })),
            itemFromAcceptResponse(accepted({ id: 2 })),
            itemFromAcceptResponse(accepted({ id: 3 })),
        ],
        [completedStatus({ id: 1 })]
    );

    assert.equal(describeStage(items), "Processed 1 of 3 files");
});

test("describeStage settles once everything is done", () => {
    const item = itemFromStatusReport(completedStatus());

    assert.equal(describeStage([item]), "Finishing up");
});

// ---- stagePercent: truthful progress, never fake elapsed-time animation ----

test("stagePercent advances only through real backend stages, single file", () => {
    const expected = {
        UPLOADING: 10,
        TRANSCRIBING: 30,
        AI_ANALYZING: 65,
        GENERATING_REPORT: 90,
    };

    for (const [stage, percent] of Object.entries(expected)) {
        const item = itemFromStatusReport(processingStatus({ processing_status: stage }));
        assert.equal(stagePercent([item]), percent, `stage ${stage}`);
    }
});

test("stagePercent is 100 only once the item is actually completed", () => {
    const processing = itemFromStatusReport(processingStatus({ processing_status: "GENERATING_REPORT" }));
    assert.notEqual(stagePercent([processing]), 100);

    const completed = itemFromStatusReport(completedStatus());
    assert.equal(stagePercent([completed]), 100);
});

test("stagePercent never claims 100% for a failed item", () => {
    const failed = itemFromStatusReport(failedStatus());
    assert.equal(stagePercent([failed]), 0);
});

test("stagePercent for a batch is the real done-fraction, not a per-stage guess", () => {
    const items = [
        itemFromStatusReport(completedStatus({ id: 1 })),
        itemFromStatusReport(failedStatus({ id: 2 })),
        itemFromStatusReport(processingStatus({ id: 3, processing_status: "TRANSCRIBING" })),
        itemFromStatusReport(processingStatus({ id: 4, processing_status: "AI_ANALYZING" })),
    ];

    // 2 of 4 settled -> 50%, regardless of the two still-processing items'
    // individual stages (a batch percentage is a count, not a per-file guess).
    assert.equal(stagePercent(items), 50);
});

test("stagePercent is 0 for an empty or unknown item list", () => {
    assert.equal(stagePercent([]), 0);
    assert.equal(stagePercent(null), 0);
});

test("stagePercent handles an unrecognised processing_status without crashing", () => {
    const item = itemFromStatusReport(processingStatus({ processing_status: "SOMETHING_NEW" }));
    assert.equal(stagePercent([item]), 5);
});

// ---- helpers ----------------------------------------------------------------

test("toReportId only accepts positive integers", () => {
    assert.equal(toReportId(12), 12);
    assert.equal(toReportId("12"), 12);
    for (const bad of [0, -1, 1.2, "0", "01", "1.5", " 1", "", null, undefined, NaN, true, {}, []]) {
        assert.equal(toReportId(bad), null, `should reject ${JSON.stringify(bad)}`);
    }
});
