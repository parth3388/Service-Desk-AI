"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../../../../components/DashboardLayout";
import CallIllustration from "../../../../components/CallIllustration";
import api from "../../../../services/api";
import {
    generateReportFromLibrary,
    getUploadStatuses
} from "../../../../services/employeeService";
import {
    getPendingUpload,
    clearPendingUpload
} from "../../../../lib/uploadStore";
import { getErrorMessage } from "../../../../lib/apiError.mjs";
import {
    describeStage,
    itemsFromAcceptResponse,
    mergeStatusReports,
    pendingIds,
    resolvePollOutcome,
    stagePercent
} from "../../../../lib/processingPoll.mjs";
import {
    FiCheckCircle,
    FiXCircle,
    FiCpu,
    FiFolder
} from "react-icons/fi";

// The AI pipeline now runs in the background (see backend/app/api/upload.py);
// the upload/generate request only QUEUES it. This page polls
// GET /upload/status for real progress instead of waiting on that request.
const POLL_INTERVAL_MS = 1500;

/* ------------------------------------------------------------------ */
/* Processing-only illustration — distinct radar/scan style loader     */
/* ------------------------------------------------------------------ */

function ProcessingIllustration({ stage, batch }) {

    return (

        <div className="relative mx-auto flex h-56 w-56 items-center justify-center">

            <style jsx>{`
                @keyframes spinSlow {
                    to { transform: rotate(360deg); }
                }
                @keyframes spinReverse {
                    to { transform: rotate(-360deg); }
                }
                @keyframes corePulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                .ring-spin {
                    animation: spinSlow 3s linear infinite;
                }
                .ring-spin-reverse {
                    animation: spinReverse 4.5s linear infinite;
                }
                .core-pulse {
                    animation: corePulse 2s ease-in-out infinite;
                }
            `}</style>

            <div className="ring-spin absolute h-full w-full rounded-full border-4 border-dashed border-indigo-200" />

            <div

                className="ring-spin-reverse absolute h-44 w-44 rounded-full opacity-70"

                style={{

                    background:
                        "conic-gradient(from 0deg, #4f46e5, #06b6d4 35%, transparent 70%)",

                    WebkitMaskImage:
                        "radial-gradient(closest-side, transparent 78%, black 80%)",

                    maskImage:
                        "radial-gradient(closest-side, transparent 78%, black 80%)"

                }}

            />

            <div className="core-pulse relative flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white shadow-xl px-3 text-center">

                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white">

                    {

                        batch ? (

                            <FiFolder size={18} />

                        ) : (

                            <FiCpu size={18} />

                        )

                    }

                </div>

                <span className="mt-2 text-xs font-semibold leading-snug text-slate-800">

                    {stage}

                </span>

            </div>

        </div>

    );

}

export default function UploadProcessingPage() {

    const router = useRouter();

    // "loading" | "results" | "failure" | "empty"
    const [status, setStatus] = useState("loading");

    const [mode, setMode] = useState("single");

    // Live poll.mjs Item[] — drives both the single-file and batch views.
    const [items, setItems] = useState([]);

    // { message, retryId, filename } for a failed single upload
    const [failure, setFailure] = useState(null);

    // id of the item currently being retried (batch table)
    const [retryingId, setRetryingId] = useState(null);

    const itemsRef = useRef([]);

    const pollTimerRef = useRef(null);

    const pollInFlightRef = useRef(false);

    const startedRef = useRef(false);

    const mountedRef = useRef(false);

    const navTimerRef = useRef(null);

    const modeRef = useRef("single");

    const stopPolling = () => {

        if (pollTimerRef.current) {

            clearInterval(pollTimerRef.current);

            pollTimerRef.current = null;

        }

    };

    const setItemsState = (next) => {

        itemsRef.current = next;

        if (mountedRef.current) {
            setItems(next);
        }

    };

    // Decide what to show for the CURRENT item list. Navigation happens ONLY
    // when the backend reported completion with a valid report id.
    const applyOutcome = (outcome) => {

        if (!mountedRef.current) return;

        if (outcome.kind === "processing") {
            return; // keep polling
        }

        stopPolling();
        clearPendingUpload();

        if (outcome.kind === "navigate") {

            if (outcome.notice) {
                alert(outcome.notice);
            }

            navTimerRef.current = setTimeout(() => {

                router.replace(outcome.path);

            }, 400);

            return;

        }

        if (outcome.kind === "results") {

            setStatus("results");

            return;

        }

        // "failure" (one file failed) or "error" (unusable response)
        setFailure({
            message: outcome.message,
            retryId: outcome.retryId ?? null,
            filename: outcome.filename ?? null
        });

        setStatus("failure");

    };

    // One poll tick: fetch the latest status for every still-processing
    // item, merge it in, and decide whether to navigate/show results/stop.
    const pollOnce = async () => {

        // A poll already in flight, or nothing left to poll — never start
        // a second overlapping request.
        if (pollInFlightRef.current) return;

        const ids = pendingIds(itemsRef.current);

        if (ids.length === 0) {
            stopPolling();
            return;
        }

        pollInFlightRef.current = true;

        try {

            const data = await getUploadStatuses(ids);

            if (!mountedRef.current) return;

            const merged = mergeStatusReports(itemsRef.current, data?.reports);

            setItemsState(merged);

            applyOutcome(
                resolvePollOutcome(merged, {
                    reportBasePath: "/employee/reports"
                })
            );

        }

        catch (error) {

            // A transient polling failure (network blip) should not abort
            // the whole flow — it will simply try again on the next tick.
            console.error(error);

        }

        finally {

            pollInFlightRef.current = false;

        }

    };

    const startPolling = () => {

        stopPolling();

        pollTimerRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);

        // Don't wait a full interval for the first check.
        pollOnce();

    };

    const applyRequestError = (error) => {

        console.error(error);

        applyOutcome({
            kind: "failure",
            message: getErrorMessage(error, "Processing failed. Please try again."),
            retryId: null,
            filename: null
        });

    };

    const runLibraryGenerate = async (recordId) => {

        try {

            const data = await generateReportFromLibrary(recordId);

            const initial = itemsFromAcceptResponse(data);

            if (!initial) {
                applyRequestError(new Error("Invalid response"));
                return;
            }

            setItemsState(initial);

            const outcome = resolvePollOutcome(initial, {
                reportBasePath: "/employee/reports"
            });

            if (outcome.kind === "processing") {
                startPolling();
            } else {
                applyOutcome(outcome);
            }

        }

        catch (error) {

            applyRequestError(error);

        }

    };

    const runFileUpload = async (uploadMode, uploadFiles) => {

        try {

            const formData = new FormData();

            uploadFiles.forEach((f) => {

                formData.append(
                    "files",
                    f
                );

            });

            const response = await api.post(

                "/upload/audio",

                formData,

                {

                    headers: {

                        "Content-Type":
                            "multipart/form-data"

                    }

                    // No long timeout needed: this request only queues the
                    // pipeline and returns almost immediately.

                }

            );

            const initial = itemsFromAcceptResponse(response.data);

            if (!initial) {
                applyRequestError(new Error("Invalid response"));
                return;
            }

            setItemsState(initial);

            const outcome = resolvePollOutcome(initial, {
                reportBasePath: "/employee/reports"
            });

            if (outcome.kind === "processing") {
                startPolling();
            } else {
                applyOutcome(outcome);
            }

        }

        catch (error) {

            applyRequestError(error);

        }

    };

    // Retry of a single failed upload (failure card). The audio was stored
    // by the first attempt, so only the pipeline runs again.
    const retrySingle = () => {

        if (!failure?.retryId) return;

        const recordId = failure.retryId;

        setFailure(null);

        setStatus("loading");

        setItemsState([]);

        runLibraryGenerate(recordId);

    };

    // Retry of one failed row in the batch table. Runs independently of the
    // (already stopped) main poll loop, then patches just that row in.
    const retryRow = async (recordId) => {

        setRetryingId(recordId);

        try {

            const data = await generateReportFromLibrary(recordId);
            const [restarted] = itemsFromAcceptResponse(data) || [];

            if (restarted && restarted.outcome === "processing") {

                // Poll just this one row until it settles.
                let attempts = 0;

                while (attempts < 200 && mountedRef.current) {

                    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

                    const statusData = await getUploadStatuses([recordId]);
                    const [updated] = mergeStatusReports([restarted], statusData?.reports);

                    if (updated.outcome !== "processing") {

                        if (mountedRef.current) {
                            patchResultRow(recordId, updated);
                        }

                        break;

                    }

                    attempts += 1;

                }

            } else if (restarted) {

                if (mountedRef.current) {
                    patchResultRow(recordId, restarted);
                }

            }

        }

        catch (error) {

            console.error(error);

            if (mountedRef.current) {

                patchResultRow(recordId, {
                    id: recordId,
                    filename: null,
                    outcome: "failed",
                    error: getErrorMessage(error, "Processing failed. Please try again."),
                    retryId: recordId
                });

            }

        }

        finally {

            if (mountedRef.current) {
                setRetryingId(null);
            }

        }

    };

    const patchResultRow = (recordId, updated) => {

        setItemsState(
            itemsRef.current.map((item) =>
                (item.id === recordId || item.retryId === recordId)
                    ? { ...updated, filename: updated.filename || item.filename }
                    : item
            )
        );

    };

    const downloadPdf = async (reportId) => {

        try {

            const response = await api.get(

                `/report/download/${reportId}`,

                {

                    responseType: "blob"

                }

            );

            const url = window.URL.createObjectURL(

                new Blob([response.data])

            );

            const link = document.createElement("a");

            link.href = url;

            link.download = `Report_${reportId}.pdf`;

            document.body.appendChild(link);

            link.click();

            link.remove();

            window.URL.revokeObjectURL(url);

        }

        catch (error) {

            console.error(error);

            alert("Unable to download report.");

        }

    };

    useEffect(() => {

        mountedRef.current = true;

        const pending = getPendingUpload();

        if (!pending) {

            setStatus("empty");

            return () => {
                mountedRef.current = false;
            };

        }

        if (pending.kind === "files" && !pending.files?.length) {

            setStatus("empty");

            return () => {
                mountedRef.current = false;
            };

        }

        if (pending.kind !== "library" && pending.kind !== "files") {

            setStatus("empty");

            return () => {
                mountedRef.current = false;
            };

        }

        // React StrictMode (dev) mounts effects twice. The upload / generate
        // request — and the polling it kicks off — must only ever start once.
        if (!startedRef.current) {

            startedRef.current = true;

            if (pending.kind === "library") {

                setMode("single");
                modeRef.current = "single";

                runLibraryGenerate(pending.recordId);

            }

            else {

                setMode(pending.mode);
                modeRef.current = pending.mode;

                runFileUpload(pending.mode, pending.files);

            }

        }

        return () => {

            mountedRef.current = false;

            stopPolling();

            if (navTimerRef.current) clearTimeout(navTimerRef.current);

        };

        // Only ever run once on mount — the pending payload is consumed here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (status === "empty") {

        return (

            <DashboardLayout title="Processing">

                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-md">

                    <p className="text-slate-500">

                        No file was selected. Please start a new upload.

                    </p>

                    <a

                        href="/employee/dashboard"

                        className="mt-4 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"

                    >

                        Go to Upload

                    </a>

                </div>

            </DashboardLayout>

        );

    }

    return (

        <DashboardLayout title="Processing">

            {

                status === "loading" && (

                    <div className="rounded-2xl border border-slate-200 bg-white p-12 shadow-md">

                        <div className="mx-auto max-w-md text-center">

                            <ProcessingIllustration

                                stage={describeStage(items)}

                                batch={mode === "multiple"}

                            />

                            <div className="mt-8 h-2 w-full overflow-hidden rounded-full bg-slate-100">

                                {/* Real backend-stage percentage (lib/processingPoll.mjs) — it
                                    only advances when a poll actually reports that stage, and
                                    is never 100% before the item is truly completed. */}
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 transition-all duration-500 ease-out"
                                    style={{ width: `${stagePercent(items)}%` }}
                                />

                            </div>

                            <p className="mt-2 text-xs font-medium text-slate-400">
                                {stagePercent(items)}%
                            </p>

                            <p className="mt-6 text-sm text-slate-500">

                                {

                                    mode === "single"

                                        ? "Converting call audio to a summary with sentiment analysis and AI-based insights. You'll be redirected to your report automatically."

                                        : "Each file goes through transcription, AI analysis, and PDF report generation — this may take a few minutes."

                                }

                            </p>

                        </div>

                    </div>

                )

            }

            {

                status === "failure" && failure && (

                    <div
                        role="alert"
                        className="rounded-2xl border border-red-200 bg-white p-10 text-center shadow-md"
                    >

                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">

                            <FiXCircle size={28} />

                        </div>

                        <h2 className="mt-5 text-2xl font-semibold text-slate-800">

                            Report could not be generated

                        </h2>

                        {
                            failure.filename && (

                                <p className="mt-1 text-sm text-slate-500">

                                    {failure.filename}

                                </p>

                            )
                        }

                        <p className="mx-auto mt-4 max-w-lg text-slate-600">

                            {failure.message}

                        </p>

                        <div className="mt-6 flex flex-wrap justify-center gap-3">

                            {
                                failure.retryId && (

                                    <button

                                        onClick={retrySingle}

                                        className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"

                                    >

                                        Try again

                                    </button>

                                )
                            }

                            <a

                                href="/employee/upload"

                                className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-600 transition hover:bg-slate-50"

                            >

                                Back to upload

                            </a>

                        </div>

                    </div>

                )

            }

            {

                status === "results" && items.length > 0 && (

                    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md">

                        <h2 className="mb-5 text-2xl font-semibold text-slate-800">

                            Batch Processing Results

                        </h2>

                        <div className="overflow-x-auto">

                            <table className="min-w-full">

                                <thead className="bg-slate-50">

                                    <tr>

                                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">File</th>

                                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Status</th>

                                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Confidence Score</th>

                                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Details</th>

                                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Actions</th>

                                    </tr>

                                </thead>

                                <tbody>

                                    {items.map((r, index) => (

                                        <tr key={r.id ?? `rejected-${index}`} className="border-t border-slate-100">

                                            <td className="px-4 py-3">

                                                {r.filename || "Unknown file"}

                                            </td>

                                            <td className="px-4 py-3">

                                                {

                                                    r.outcome === "completed" ? (

                                                        <span className="flex w-fit items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">

                                                            <FiCheckCircle size={12} />

                                                            Success

                                                        </span>

                                                    ) : (

                                                        <span className="flex w-fit items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">

                                                            <FiXCircle size={12} />

                                                            Failed

                                                        </span>

                                                    )

                                                }

                                            </td>

                                            <td className="px-4 py-3">

                                                {

                                                    r.outcome === "completed"

                                                        ? (r.confidenceScore ?? "—")

                                                        : "—"

                                                }

                                            </td>

                                            <td className="px-4 py-3 text-sm text-slate-500">

                                                {

                                                    r.outcome === "completed"

                                                        ? (
                                                            !r.emailStatus || r.emailStatus === "SENT"
                                                                ? "Processed successfully"
                                                                : "Processed successfully. The email could not be sent."
                                                        )

                                                        : r.error

                                                }

                                            </td>

                                            <td className="px-4 py-3">

                                                {

                                                    r.outcome === "completed" && (

                                                        <div className="flex gap-3">

                                                            <a

                                                                href={`/employee/reports/${r.id}`}

                                                                className="text-sm font-semibold text-blue-600 hover:underline"

                                                            >

                                                                View

                                                            </a>

                                                            <button

                                                                onClick={() => downloadPdf(r.id)}

                                                                className="text-sm font-semibold text-green-600 hover:underline"

                                                            >

                                                                Download

                                                            </button>

                                                        </div>

                                                    )

                                                }

                                                {

                                                    r.outcome !== "completed" && r.retryId && (

                                                        <button

                                                            onClick={() => retryRow(r.retryId)}

                                                            disabled={retryingId !== null}

                                                            className="text-sm font-semibold text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"

                                                        >

                                                            {retryingId === r.retryId ? "Retrying..." : "Retry"}

                                                        </button>

                                                    )

                                                }

                                            </td>

                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                        </div>

                    </div>

                )

            }

        </DashboardLayout>

    );

}
