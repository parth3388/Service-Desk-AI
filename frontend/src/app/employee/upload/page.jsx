"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiCpu, FiFolder, FiEye, FiMusic, FiPlay } from "react-icons/fi";

import DashboardLayout from "../../../components/DashboardLayout";
import CallIllustration from "../../../components/CallIllustration";
import { getAudioLibrary } from "../../../services/employeeService";
import { setPendingLibraryGenerate } from "../../../lib/uploadStore";
import { getErrorMessage } from "../../../lib/apiError.mjs";

/*
|--------------------------------------------------------------------------
| Uploaded Files
|--------------------------------------------------------------------------
| Same visual language as the Call Audio page (illustration, gradient icon,
| heading, "Select a file"-style control), but for browsing/reusing audio
| already uploaded there — not for uploading a new one. Selecting an entry
| reuses the existing /upload/library/{id}/generate endpoint against the
| SAME stored record: it never uploads the file again or creates a second
| CallAnalysis row.
*/

const IN_PROGRESS_STATUSES = ["TRANSCRIBING", "AI_ANALYZING", "GENERATING_REPORT"];

const STATUS_STYLE = {
    UPLOADING: "bg-slate-100 text-slate-600",
    TRANSCRIBING: "bg-amber-100 text-amber-700",
    AI_ANALYZING: "bg-amber-100 text-amber-700",
    GENERATING_REPORT: "bg-amber-100 text-amber-700",
    COMPLETED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700"
};

export default function UploadedFilesPage() {

    const router = useRouter();
    const pickerRef = useRef(null);

    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [startingId, setStartingId] = useState(null);
    const [pickerOpen, setPickerOpen] = useState(false);

    const loadFiles = useCallback(async () => {
        try {
            setLoading(true);
            const response = await getAudioLibrary(false);
            setFiles(response.files || []);
            setError("");
        } catch (err) {
            console.error(err);
            setError(getErrorMessage(err, "Unable to load uploaded files."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        async function run() {
            await loadFiles();
        }
        run();
    }, [loadFiles]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (pickerRef.current && !pickerRef.current.contains(event.target)) {
                setPickerOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Reuses the EXISTING stored record — never uploads a new file, never
    // creates a second CallAnalysis row.
    const selectExisting = (recordId) => {
        setStartingId(recordId);
        setPickerOpen(false);
        setPendingLibraryGenerate(recordId);
        router.push("/employee/upload/processing");
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-100">
                <div className="text-xl font-semibold">
                    Loading Uploaded Files...
                </div>
            </div>
        );
    }

    return (
        <DashboardLayout title="Uploaded Files">
            <div className="grid gap-10 md:grid-cols-2 md:items-start">
                <CallIllustration />
                <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg">
                        <FiCpu size={22} />
                    </div>

                    <h1 className="mt-5 text-3xl font-bold leading-snug md:text-4xl">
                        Your{" "}
                        <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
                            Uploaded Files
                        </span>
                    </h1>

                    <p className="mt-3 text-slate-500">
                        Pick a previously uploaded recording to view its report,
                        <br />
                        retry a failed one, or generate one that&apos;s still pending.
                    </p>

                    <div className="relative mt-6 max-w-md" ref={pickerRef}>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Uploaded Files
                        </label>
                        <button
                            onClick={() => setPickerOpen((prev) => !prev)}
                            className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-left transition hover:border-blue-400"
                        >
                            <span className="text-slate-400">
                                {files.length === 0
                                    ? "No uploaded files yet"
                                    : `Select a file (${files.length})`}
                            </span>
                            <FiFolder className="shrink-0 text-slate-400" size={18} />
                        </button>

                        {error && (
                            <p className="mt-2 text-xs text-red-600">{error}</p>
                        )}

                        {pickerOpen && (
                            <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                {files.length === 0 ? (
                                    <p className="px-4 py-3 text-xs text-slate-400">
                                        No uploaded audio files yet. Use{" "}
                                        <Link href="/employee/dashboard" className="font-semibold text-blue-600 hover:underline">
                                            Call Audio
                                        </Link>{" "}
                                        to upload one.
                                    </p>
                                ) : (
                                    <div className="max-h-72 overflow-y-auto py-1">
                                        {files.map((file) => {
                                            const inProgress = IN_PROGRESS_STATUSES.includes(file.processing_status);

                                            return (
                                                <div
                                                    key={file.id}
                                                    className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50"
                                                >
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <FiMusic className="shrink-0 text-slate-400" size={14} />
                                                        <div className="min-w-0">
                                                            <p className="truncate text-xs font-medium text-slate-700">
                                                                {file.original_filename}
                                                            </p>
                                                            <span
                                                                className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLE[file.processing_status] || "bg-slate-100 text-slate-600"}`}
                                                            >
                                                                {file.processing_status}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0">
                                                        {file.processing_status === "COMPLETED" && (
                                                            <Link
                                                                href={`/employee/reports/${file.id}`}
                                                                onClick={() => setPickerOpen(false)}
                                                                className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                                                            >
                                                                <FiEye size={12} />
                                                                View
                                                            </Link>
                                                        )}

                                                        {(file.processing_status === "UPLOADING" || file.processing_status === "FAILED") && (
                                                            <button
                                                                onClick={() => selectExisting(file.id)}
                                                                disabled={startingId !== null}
                                                                className="flex items-center gap-1 text-[11px] font-semibold text-green-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                                                            >
                                                                <FiPlay size={12} />
                                                                {file.processing_status === "FAILED" ? "Retry" : "Use"}
                                                            </button>
                                                        )}

                                                        {inProgress && (
                                                            <span className="text-[11px] font-semibold text-slate-400">
                                                                Processing...
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        <p className="mt-2 text-xs text-slate-400">
                            {files.length} file{files.length === 1 ? "" : "s"} previously uploaded
                        </p>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
