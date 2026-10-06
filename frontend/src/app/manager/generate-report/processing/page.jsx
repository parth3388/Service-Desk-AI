"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../../../../components/DashboardLayout";
import {
    generateReportForEmployee,
    getUploadStatuses
} from "../../../../services/managerService";
import {
    getPendingManagerUpload,
    clearPendingManagerUpload
} from "../../../../lib/managerUploadStore";
import { getErrorMessage } from "../../../../lib/apiError.mjs";
import {
    describeStage,
    itemsFromAcceptResponse,
    mergeStatusReports,
    pendingIds,
    resolvePollOutcome
} from "../../../../lib/processingPoll.mjs";
import {
    FiCheckCircle,
    FiXCircle,
    FiCpu,
    FiFolder
} from "react-icons/fi";

// The AI pipeline now runs in the background (see backend/app/api/upload.py);
// the manager-upload request only QUEUES it. This page polls
// GET /upload/status for real progress instead of waiting on that request.
const POLL_INTERVAL_MS = 1500;

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
                @keyframes indeterminateSlide {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(250%); }
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
                .indeterminate-bar {
                    animation: indeterminateSlide 1.4s ease-in-out infinite;
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

export default function ManagerGenerateReportProcessingPage() {

    const router = useRouter();

    // "loading" | "results" | "failure" | "empty"
    const [status, setStatus] = useState("loading");
    const [mode, setMode] = useState("single");
    const [items, setItems] = useState([]);
    const [failure, setFailure] = useState(null);

    const itemsRef = useRef([]);
    const pollTimerRef = useRef(null);
    const pollInFlightRef = useRef(false);
    const startedRef = useRef(false);
    const mountedRef = useRef(false);
    const navTimerRef = useRef(null);

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

    // Navigation to a report happens ONLY when the backend reported
    // completion with a valid report id (see lib/processingPoll.mjs).
    const applyOutcome = (outcome) => {

        if (!mountedRef.current) return;

        if (outcome.kind === "processing") {
            return; // keep polling
        }

        stopPolling();
        clearPendingManagerUpload();

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

        setFailure({
            message: outcome.message,
            filename: outcome.filename ?? null
        });

        setStatus("failure");

    };

    const pollOnce = async () => {

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
                    reportBasePath: "/manager/report"
                })
            );

        }

        catch (error) {

            // A transient polling failure should not abort the whole flow.
            console.error(error);

        }

        finally {

            pollInFlightRef.current = false;

        }

    };

    const startPolling = () => {

        stopPolling();

        pollTimerRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);

        pollOnce();

    };

    const runGenerate = async (employeeId, files) => {

        try {

            const data = await generateReportForEmployee(employeeId, files);

            const initial = itemsFromAcceptResponse(data);

            if (!initial) {

                applyOutcome({
                    kind: "failure",
                    message: "The server returned an unexpected response. Please try again.",
                    filename: null
                });

                return;

            }

            setItemsState(initial);

            const outcome = resolvePollOutcome(initial, {
                reportBasePath: "/manager/report"
            });

            if (outcome.kind === "processing") {
                startPolling();
            } else {
                applyOutcome(outcome);
            }

        }
        catch (error) {

            console.error(error);

            applyOutcome({
                kind: "failure",
                message: getErrorMessage(error, "Processing failed. Please try again."),
                filename: null
            });

        }

    };

    useEffect(() => {

        mountedRef.current = true;

        const pending = getPendingManagerUpload();

        if (!pending || !pending.files?.length) {

            setStatus("empty");

            return () => {
                mountedRef.current = false;
            };

        }

        setMode(pending.files.length > 1 ? "multiple" : "single");

        // React StrictMode (dev) runs effects twice; the request must not.
        if (!startedRef.current) {

            startedRef.current = true;

            runGenerate(pending.employeeId, pending.files);

        }

        return () => {

            mountedRef.current = false;

            stopPolling();

            if (navTimerRef.current) clearTimeout(navTimerRef.current);

        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (status === "empty") {

        return (
            <DashboardLayout title="Processing">
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-md">
                    <p className="text-slate-500">
                        No file was selected. Please start again.
                    </p>
                    <a
                        href="/manager/generate-report"
                        className="mt-4 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
                    >
                        Go to Generate Report
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
                                <div className="indeterminate-bar h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500" />
                            </div>

                            <p className="mt-6 text-sm text-slate-500">
                                {
                                    mode === "single"
                                        ? "Converting call audio to a summary with sentiment analysis and AI-based insights. You'll be redirected to the report automatically."
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

                        <a
                            href="/manager/generate-report"
                            className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
                        >
                            Back to Generate Report
                        </a>

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
                                                        <a
                                                            href={`/manager/report/${r.id}`}
                                                            className="text-sm font-semibold text-blue-600 hover:underline"
                                                        >
                                                            View
                                                        </a>
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
