/*
|--------------------------------------------------------------------------
| Upload accept + status-poll interpretation (Issue 1: async pipeline)
|--------------------------------------------------------------------------
| The backend no longer runs the AI pipeline inside the upload request. The
| upload/generate endpoints ACCEPT the file(s) and return almost instantly;
| the frontend must then poll GET /upload/status[/​:id] until every report
| reaches "completed" or "failed". This module holds the pure decision
| logic (data in -> data out); the pages own the actual setInterval /
| cleanup wiring, which cannot usefully be unit-tested without a DOM.
|
| Backend contracts (backend/app/api/upload.py):
|
|   POST /upload/audio | /upload/manager/audio
|     { status, message, reports: [
|         { id, original_filename, status: "accepted", processing_status } |
|         { original_filename, status: "failed", error }   (no id — never queued)
|     ]}
|
|   POST /upload/library/:id/generate
|     { status: "accepted"|"failed", report: <one item as above> }
|
|   GET /upload/status/:id            -> { status, report: <StatusReport> }
|   GET /upload/status?ids=1,2,3      -> { status, reports: [<StatusReport>] }
|
|   StatusReport = {
|     id, original_filename, processing_status,
|     state: "processing" | "completed" | "failed",
|     stalled, error,
|     confidence_score?, email_status?   (only when state === "completed")
|   }
*/

export const INVALID_RESPONSE_MESSAGE =
    "The server returned an unexpected response. Please try again.";

const GENERIC_FAILURE_MESSAGE = "Processing failed.";

export function toReportId(value) {

    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return value;
    }

    if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
        return Number(value);
    }

    return null;

}

/**
 * One row of frontend state, whichever stage it came from.
 * outcome: "processing" | "completed" | "failed" | "invalid"
 */
function makeItem({
    id = null,
    filename = null,
    outcome,
    error = null,
    confidenceScore = null,
    emailStatus = null,
    stalled = false,
    processingStatus = null
}) {

    return {
        id,
        filename,
        outcome,
        error,
        confidenceScore,
        emailStatus,
        stalled,
        // The backend's own stage name (e.g. "TRANSCRIBING"), so the UI can
        // show real progress instead of a fabricated percentage.
        processingStatus,
        // Only a stored (has an id), non-completed item can be retried.
        retryId: id !== null && outcome === "failed" ? id : null
    };

}

/**
 * Turn ONE item of an accept-time response (POST /upload/audio etc.) into
 * an Item. "accepted" -> processing (queued); "failed" here means the file
 * was rejected before it was ever stored (bad format, empty, too large...).
 */
export function itemFromAcceptResponse(raw) {

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return makeItem({ outcome: "invalid", error: INVALID_RESPONSE_MESSAGE });
    }

    const filename =
        typeof raw.original_filename === "string" ? raw.original_filename : null;

    if (raw.status === "accepted") {

        const id = toReportId(raw.id);

        if (id === null) {
            return makeItem({
                filename,
                outcome: "invalid",
                error: "The server accepted the file but did not return a report ID.",
            });
        }

        return makeItem({
            id,
            filename,
            outcome: "processing",
            processingStatus:
                typeof raw.processing_status === "string" ? raw.processing_status : null
        });

    }

    if (raw.status === "failed") {

        return makeItem({
            id: toReportId(raw.id),
            filename,
            outcome: "failed",
            error:
                typeof raw.error === "string" && raw.error.trim()
                    ? raw.error
                    : GENERIC_FAILURE_MESSAGE,
        });

    }

    return makeItem({ filename, outcome: "invalid", error: INVALID_RESPONSE_MESSAGE });

}

/**
 * Build the initial Item[] from a batch accept response
 * ({ reports: [...] }) or a single-generate accept response ({ report }).
 * Returns null if the response shape is unusable (never navigate/poll then).
 */
export function itemsFromAcceptResponse(data) {

    if (Array.isArray(data?.reports) && data.reports.length) {
        return data.reports.map(itemFromAcceptResponse);
    }

    if (data?.report && typeof data.report === "object" && !Array.isArray(data.report)) {
        return [itemFromAcceptResponse(data.report)];
    }

    return null;

}

/**
 * Turn one polled StatusReport into an Item.
 */
export function itemFromStatusReport(raw) {

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return makeItem({ outcome: "invalid", error: INVALID_RESPONSE_MESSAGE });
    }

    const id = toReportId(raw.id);
    const filename =
        typeof raw.original_filename === "string" ? raw.original_filename : null;

    if (id === null) {
        return makeItem({ filename, outcome: "invalid", error: INVALID_RESPONSE_MESSAGE });
    }

    if (raw.state === "completed") {
        return makeItem({
            id,
            filename,
            outcome: "completed",
            confidenceScore:
                typeof raw.confidence_score === "number" ? raw.confidence_score : null,
            emailStatus: typeof raw.email_status === "string" ? raw.email_status : null,
        });
    }

    if (raw.state === "failed") {
        return makeItem({
            id,
            filename,
            outcome: "failed",
            error:
                typeof raw.error === "string" && raw.error.trim()
                    ? raw.error
                    : GENERIC_FAILURE_MESSAGE,
        });
    }

    // "processing" (or any future/unknown state): keep polling rather than
    // guessing — an unrecognised state must never be treated as done.
    return makeItem({
        id,
        filename,
        outcome: "processing",
        stalled: raw.stalled === true,
        processingStatus:
            typeof raw.processing_status === "string" ? raw.processing_status : null
    });

}

/**
 * Merge freshly-polled StatusReports into the current Item[] by id.
 * Items with no id (rejected pre-storage) and items not present in this
 * poll response (e.g. a since-deleted report) are left exactly as they were.
 */
export function mergeStatusReports(items, statusReports) {

    const byId = new Map(
        (Array.isArray(statusReports) ? statusReports : [])
            .map((report) => [toReportId(report?.id), report])
    );

    return items.map((item) => {

        if (item.id === null || !byId.has(item.id)) {
            return item;
        }

        return itemFromStatusReport(byId.get(item.id));

    });

}

export function isSettled(item) {
    return item.outcome === "completed" || item.outcome === "failed" || item.outcome === "invalid";
}

/** True once nothing in the list still needs polling. */
export function allSettled(items) {
    return items.every(isSettled);
}

/** The ids that still need to be polled. */
export function pendingIds(items) {
    return items
        .filter((item) => item.outcome === "processing" && item.id !== null)
        .map((item) => item.id);
}

/**
 * Decide what the page should render for the CURRENT item list.
 *
 *   { kind: "processing" }                                   still waiting
 *   { kind: "navigate", path, notice }                        single success
 *   { kind: "failure", message, retryId, filename }           single failure
 *   { kind: "results", items, counts }                        batch, settled
 *   { kind: "error", message }                                unusable response
 *
 * `reportBasePath` is e.g. "/employee/reports" or "/manager/report".
 */
export function resolvePollOutcome(items, { reportBasePath }) {

    if (!Array.isArray(items) || items.length === 0) {
        return { kind: "error", message: INVALID_RESPONSE_MESSAGE };
    }

    if (items.length === 1) {

        const [only] = items;

        if (!isSettled(only)) {
            return { kind: "processing" };
        }

        if (only.outcome === "invalid") {
            return { kind: "error", message: only.error || INVALID_RESPONSE_MESSAGE };
        }

        if (only.outcome === "completed") {
            return {
                kind: "navigate",
                path: `${reportBasePath}/${only.id}`,
                // Only a genuine terminal failure is worth alarming the user
                // about. PENDING/SENDING are still in flight — the email
                // delivery row is created in the SAME commit that marks the
                // report COMPLETED, but the actual send happens moments
                // later in a separate step, so a poll can legitimately see
                // "not SENT yet" right before the email succeeds seconds
                // later. Treating that as "could not be sent" was a false
                // positive.
                notice:
                    only.emailStatus === "FAILED"
                        ? "The report was generated, but the email could not be sent."
                        : null,
            };
        }

        return {
            kind: "failure",
            message: only.error || GENERIC_FAILURE_MESSAGE,
            retryId: only.retryId,
            filename: only.filename,
        };

    }

    if (!allSettled(items)) {
        return { kind: "processing" };
    }

    return { kind: "results", items, counts: countOutcomes(items) };

}

const STAGE_LABELS = {
    UPLOADING: "Preparing your file",
    TRANSCRIBING: "Transcribing the audio",
    AI_ANALYZING: "Analyzing the conversation",
    GENERATING_REPORT: "Generating the report"
};

// Truthful stage -> percentage. These are the only stages the backend's
// blocking pipeline (backend/app/api/upload.py _execute_pipeline) ever
// reports while the user is on this screen — AutoQA runs afterward, in its
// own background job, once the report is already COMPLETED (see the perf
// fix that decoupled it), so it has no percentage of its own here: showing
// one would mean claiming a backend stage that isn't real at that moment.
const STAGE_PERCENT = {
    UPLOADING: 10,
    TRANSCRIBING: 30,
    AI_ANALYZING: 65,
    GENERATING_REPORT: 90
};

/**
 * A truthful 0-100 progress value — never a fabricated elapsed-time
 * animation. For a single file it's the real backend stage's percentage
 * (only advances when a poll actually reports that stage); for a batch it's
 * the real fraction of files that have settled. Never 100 before the item
 * is actually completed.
 */
export function stagePercent(items) {

    if (!Array.isArray(items) || items.length === 0) {
        return 0;
    }

    if (items.length === 1) {

        const [item] = items;

        if (item.outcome === "completed") {
            return 100;
        }

        if (item.outcome !== "processing") {
            // failed/invalid: the loading bar isn't shown for these outcomes
            // (a dedicated failure screen takes over), but never claim 100%.
            return 0;
        }

        return STAGE_PERCENT[item.processingStatus] ?? 5;

    }

    const counts = countOutcomes(items);
    const done = counts.completed + counts.failed + counts.invalid;

    return Math.round((done / items.length) * 100);

}

/**
 * A short, honest status line for the processing UI — the backend's own
 * stage name for a single file, or a "done so far" count for a batch.
 * Never a fabricated percentage: real progress within a stage isn't known.
 */
export function describeStage(items) {

    if (!Array.isArray(items) || items.length === 0) {
        return "Starting";
    }

    if (items.length === 1) {

        const [item] = items;

        if (item.outcome !== "processing") {
            return "Finishing up";
        }

        return STAGE_LABELS[item.processingStatus] || "Processing";

    }

    const counts = countOutcomes(items);
    const done = counts.completed + counts.failed + counts.invalid;

    return `Processed ${done} of ${items.length} files`;

}


export function countOutcomes(items) {

    return items.reduce(
        (counts, item) => {
            counts[item.outcome] = (counts[item.outcome] || 0) + 1;
            return counts;
        },
        { processing: 0, completed: 0, failed: 0, invalid: 0 }
    );

}
