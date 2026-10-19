"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    FiEye,
    FiMusic,
    FiPlay,
    FiFileText,
    FiBarChart2,
    FiUploadCloud,
    FiSearch,
    FiChevronDown,
    FiCheckCircle,
    FiLoader,
    FiAlertCircle
} from "react-icons/fi";

import DashboardLayout from "../../../components/DashboardLayout";
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

// Fixed bar heights for the illustrative waveform — purely decorative.
const WAVEFORM_BARS = [8, 16, 11, 22, 14, 26, 18, 10, 20, 15, 24, 12, 9, 17, 13];

// Decorative, illustrative-only composition matching the rest of the app's
// visual language — not a real audio player.
function UploadIllustration() {
    return (
        <div className="relative mx-auto hidden w-full max-w-sm px-7 py-7 lg:block">
            <div className="absolute top-2 left-2 h-40 w-40 rounded-full bg-blue-200/50 blur-2xl" />
            <div className="absolute right-2 bottom-2 h-44 w-44 rounded-full bg-violet-200/50 blur-2xl" />

            <div className="absolute top-0 right-0 z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-lg">
                <FiMusic className="text-xl text-violet-500" />
            </div>
            <div className="absolute bottom-16 left-0 z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-lg">
                <FiFileText className="text-lg text-emerald-500" />
            </div>
            <div className="absolute right-6 bottom-0 z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-lg">
                <FiBarChart2 className="text-lg text-pink-500" />
            </div>

            <div className="relative rounded-3xl border border-white bg-white/90 p-5 shadow-xl shadow-indigo-900/10 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold tracking-wide text-violet-700">
                        <span className="relative flex h-1.5 w-1.5 motion-reduce:hidden">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-600" />
                        </span>
                        ILLUSTRATIVE
                    </span>
                    <span className="text-xs font-semibold text-slate-400">Audio Preview</span>
                </div>

                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600">
                        <FiPlay className="text-sm text-white" />
                    </span>
                    <div className="flex h-7 flex-1 items-end gap-1">
                        {WAVEFORM_BARS.map((h, i) => (
                            <span
                                key={i}
                                className="w-1 rounded-full bg-gradient-to-t from-blue-400 to-violet-400"
                                style={{ height: `${h}px` }}
                            />
                        ))}
                    </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full w-1/4 rounded-full bg-gradient-to-r from-blue-500 to-violet-500" />
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-slate-400">
                        00:00 / 00:00
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function UploadedFilesPage() {

    const router = useRouter();
    const pickerRef = useRef(null);
    const listRef = useRef(null);

    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [startingId, setStartingId] = useState(null);
    const [pickerOpen, setPickerOpen] = useState(false);

    const formatDateTime = (value) => {
        if (!value) return "";
        const d = new Date(value);
        return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return "";
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        return `${(kb / 1024).toFixed(1)} MB`;
    };

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
            const insidePicker = pickerRef.current?.contains(event.target);
            const insideList = listRef.current?.contains(event.target);

            if (!insidePicker && !insideList) {
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
            <div className="relative overflow-hidden rounded-3xl border border-white bg-gradient-to-br from-blue-50 via-white to-violet-50 p-6 sm:p-8">
                <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
                    <div className="min-w-0">
                        <UploadIllustration />
                    </div>

                    <div className="min-w-0">
                        <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                            YOUR FILES
                        </span>

                        <h1 className="mt-4 text-3xl leading-tight font-bold text-slate-900 md:text-4xl">
                            Your{" "}
                            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                                Uploaded Files
                            </span>
                        </h1>

                        <p className="mt-3 max-w-md text-slate-600">
                            Pick a previously uploaded recording to view its
                            report, retry a failed one, or reuse it to
                            generate a new report.
                        </p>

                        <div className="relative mt-6" ref={pickerRef}>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                                Select a File
                            </label>
                            <button
                                onClick={() => setPickerOpen((prev) => !prev)}
                                disabled={files.length === 0}
                                className="flex w-full items-center justify-between gap-3 rounded-xl border border-violet-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <span className="flex min-w-0 items-center gap-2.5">
                                    <FiFileText className="shrink-0 text-slate-400" size={18} />
                                    <span className="truncate text-slate-500">
                                        {files.length === 0
                                            ? "No uploaded files yet"
                                            : "Select a previously uploaded file"}
                                    </span>
                                </span>
                                <FiChevronDown
                                    className={`shrink-0 text-slate-400 transition-transform ${pickerOpen ? "rotate-180" : ""}`}
                                    size={18}
                                />
                            </button>

                            {error && (
                                <p className="mt-2 text-xs text-red-600">{error}</p>
                            )}
                        </div>

                        {
                            files.length > 0 && !pickerOpen && (
                                <div className="mt-6 grid grid-cols-3 gap-3">
                                    <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
                                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
                                            <FiCheckCircle className="text-green-600" size={16} />
                                        </div>
                                        <p className="mt-2 text-xl font-bold text-slate-900">
                                            {files.filter((f) => f.processing_status === "COMPLETED").length}
                                        </p>
                                        <p className="text-xs text-slate-500">Completed</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
                                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                                            <FiLoader className="text-amber-600" size={16} />
                                        </div>
                                        <p className="mt-2 text-xl font-bold text-slate-900">
                                            {files.filter((f) => IN_PROGRESS_STATUSES.includes(f.processing_status)).length}
                                        </p>
                                        <p className="text-xs text-slate-500">Processing</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
                                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
                                            <FiAlertCircle className="text-red-600" size={16} />
                                        </div>
                                        <p className="mt-2 text-xl font-bold text-slate-900">
                                            {files.filter((f) => f.processing_status === "FAILED").length}
                                        </p>
                                        <p className="text-xs text-slate-500">Failed</p>
                                    </div>
                                </div>
                            )
                        }

                        {
                            files.length === 0 && (
                                <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
                                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-50">
                                        <FiSearch className="text-2xl text-violet-400" />
                                    </div>
                                    <h2 className="mt-4 text-lg font-bold text-slate-900">
                                        No uploaded files yet
                                    </h2>
                                    <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-500">
                                        Upload a call recording to see it here
                                        and access its report, or select from
                                        your existing files later.
                                    </p>
                                    <Link
                                        href="/employee/dashboard"
                                        className="mx-auto mt-5 flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:opacity-90"
                                    >
                                        <FiUploadCloud size={16} />
                                        Upload a New Recording
                                    </Link>
                                </div>
                            )
                        }
                    </div>
                </div>
            </div>

            {/* Shown only once "Select a File" is clicked */}
            {
                files.length > 0 && pickerOpen && (
                    <div ref={listRef} className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FiMusic className="text-slate-400" size={18} />
                                <h2 className="text-lg font-bold text-slate-900">
                                    Your Files
                                </h2>
                            </div>
                            <span className="text-sm text-slate-400">
                                {files.length} file{files.length === 1 ? "" : "s"}
                            </span>
                        </div>

                        <div className="mt-4 divide-y divide-slate-100">
                            {files.map((file) => {
                                const inProgress = IN_PROGRESS_STATUSES.includes(file.processing_status);

                                return (
                                    <div
                                        key={file.id}
                                        className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <FiMusic className="shrink-0 text-slate-400" size={16} />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-800">
                                                    {file.original_filename}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    {formatDateTime(file.created_at)}
                                                    {file.file_size ? ` · ${formatFileSize(file.file_size)}` : ""}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[file.processing_status] || "bg-slate-100 text-slate-600"}`}>
                                                {inProgress ? "Processing" : file.processing_status}
                                            </span>

                                            {file.processing_status === "COMPLETED" && (
                                                <Link
                                                    href={`/employee/reports/${file.id}`}
                                                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                                >
                                                    <FiEye size={14} />
                                                    View Report
                                                </Link>
                                            )}

                                            {(file.processing_status === "UPLOADING" || file.processing_status === "FAILED") && (
                                                <button
                                                    onClick={() => selectExisting(file.id)}
                                                    disabled={startingId !== null}
                                                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                                >
                                                    <FiPlay size={14} />
                                                    {file.processing_status === "FAILED" ? "Retry" : "Generate Report"}
                                                </button>
                                            )}

                                            {inProgress && (
                                                <span className="rounded-lg border border-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-300">
                                                    Processing...
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )
            }
        </DashboardLayout>
    );
}
