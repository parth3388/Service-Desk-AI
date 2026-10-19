"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    FiUploadCloud,
    FiFolder,
    FiFileText,
    FiTrash2,
    FiPlay,
    FiBarChart2,
    FiFileText as FiReport,
    FiEye
} from "react-icons/fi";

import DashboardLayout from "../../../components/DashboardLayout";

import { getDashboard } from "../../../services/employeeService";
import { setPendingFiles } from "../../../lib/uploadStore";
import {
    ALLOWED_AUDIO_LABEL,
    AUDIO_ACCEPT,
    MAX_UPLOAD_MB,
    validateAudioFiles
} from "../../../lib/validation.mjs";

// Fixed bar heights for the illustrative waveform — purely decorative.
const WAVEFORM_BARS = [6, 11, 8, 15, 10, 18, 13, 7, 14, 9];

const STATUS_BADGE = {
    COMPLETED: { label: "Completed", className: "bg-green-100 text-green-700" },
    FAILED: { label: "Failed", className: "bg-red-100 text-red-700" }
};

function statusBadge(status) {
    return STATUS_BADGE[status] || { label: "Processing", className: "bg-amber-100 text-amber-700" };
}

// Decorative, illustrative-only composition matching the login/register
// pages' visual language — not a real audio player or live transcript.
function DashboardHeroIllustration() {
    return (
        <div className="relative mx-auto hidden w-full max-w-sm lg:block">
            <div className="absolute -top-8 -left-8 h-40 w-40 rounded-full bg-blue-200/50 blur-2xl" />
            <div className="absolute -right-8 -bottom-10 h-44 w-44 rounded-full bg-violet-200/50 blur-2xl" />

            <div className="absolute top-0 right-0 z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-lg">
                <FiBarChart2 className="text-xl text-emerald-500" />
            </div>
            <div className="absolute right-10 bottom-0 z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-lg">
                <FiReport className="text-lg text-pink-500" />
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
                    <span className="text-xs font-semibold text-slate-400">04:12</span>
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

                <div className="mt-3 space-y-2 rounded-2xl border border-slate-100 bg-white p-3">
                    <p className="text-xs leading-relaxed text-slate-600">
                        <span className="mr-1.5 inline-block rounded bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                            Agent
                        </span>
                        Sure, let me check that for you.
                    </p>
                    <p className="text-xs leading-relaxed text-slate-600">
                        <span className="mr-1.5 inline-block rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                            Customer
                        </span>
                        I&apos;d like an update on my ticket.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function EmployeeDashboardPage() {

    const router = useRouter();
    const inputRef = useRef(null);

    const [employee, setEmployee] = useState(null);
    const [recentCalls, setRecentCalls] = useState([]);
    const [files, setFiles] = useState([]);
    const [fileErrors, setFileErrors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [dragActive, setDragActive] = useState(false);

    useEffect(() => {
        async function loadAll() {
            try {
                const dashboardData = await getDashboard();
                setEmployee(dashboardData.employee);
                setRecentCalls(dashboardData.recent_calls || []);
            }
            catch (error) {
                console.error(error);
                setError(
                    error.response?.data?.detail ||
                    "Unable to load dashboard."
                );
            }
            finally {
                setLoading(false);
            }
        }

        loadAll();
    }, []);

    const formatFileSize = (bytes) => {
        if (!bytes) return "0 KB";
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        return `${(kb / 1024).toFixed(1)} MB`;
    };

    const formatDateTime = (value) => {
        if (!value) return "";
        const d = new Date(value);
        return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
    };

    // Keep only files the backend will accept; report the rest.
    const applySelectedFiles = (fileList) => {
        const { valid, errors } = validateAudioFiles(fileList);

        setFiles(valid);
        setFileErrors(errors);

        if (!valid.length && inputRef.current) inputRef.current.value = "";
    };

    const handleFilesSelected = (event) => {
        applySelectedFiles(event.target.files);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setDragActive(false);
        applySelectedFiles(event.dataTransfer.files);
    };

    const removeFile = (index) => {
        setFiles(files.filter((_, i) => i !== index));
        if (inputRef.current) inputRef.current.value = "";
    };

    const handleGenerateReport = () => {
        if (!files.length) return;

        setPendingFiles(
            files.length === 1 ? "single" : "multiple",
            files
        );

        router.push("/employee/upload/processing");
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-100">
                <div className="text-xl font-semibold">
                    Loading Dashboard...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-100">
                <div className="rounded-xl bg-red-100 p-6 text-red-700">
                    {error}
                </div>
            </div>
        );
    }

    const firstName = employee?.full_name?.split(" ")[0] || "there";

    return (
        <DashboardLayout
            title="Service Desk AI"
            user={employee}
        >
            {/* Hero */}
            <div className="relative overflow-hidden rounded-3xl border border-white bg-gradient-to-br from-blue-50 via-white to-violet-50 p-6 sm:p-8">
                <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
                    <div>
                        <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                            WELCOME BACK
                        </span>

                        <h1 className="mt-4 text-3xl leading-tight font-bold text-slate-900 md:text-4xl">
                            Hello, {firstName}! 👋
                            <br />
                            Welcome to{" "}
                            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                                Service Desk AI
                            </span>
                        </h1>

                        <p className="mt-3 max-w-lg text-slate-600">
                            Upload your call recordings to get AI-powered
                            transcripts, summaries, sentiment analysis, and
                            detailed reports — all in one place.
                        </p>
                    </div>

                    <DashboardHeroIllustration />
                </div>
            </div>

            {/* Upload dropzone */}
            <div className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                        dragActive
                            ? "border-blue-400 bg-blue-50/50"
                            : "border-slate-200 bg-slate-50/50"
                    }`}
                >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                        <FiUploadCloud size={22} />
                    </div>
                    <h2 className="mt-4 text-lg font-bold text-slate-900">
                        Upload Call Recording
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Drag and drop an audio file here, or{" "}
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="font-semibold text-blue-600 hover:underline"
                        >
                            click to browse
                        </button>
                    </p>

                    <button
                        onClick={() => inputRef.current?.click()}
                        className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:opacity-90"
                    >
                        <FiFolder size={16} />
                        Choose File
                    </button>

                    <input
                        ref={inputRef}
                        type="file"
                        accept={AUDIO_ACCEPT}
                        multiple
                        onChange={handleFilesSelected}
                        className="hidden"
                    />

                    <p className="mt-4 text-xs text-slate-400">
                        {ALLOWED_AUDIO_LABEL} supported · Up to {MAX_UPLOAD_MB} MB each · You can select one or more files
                    </p>
                </div>

                {
                    fileErrors.length > 0 && (
                        <ul role="alert" className="mt-4 space-y-1 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
                            {fileErrors.map((message) => (
                                <li key={message}>{message}</li>
                            ))}
                        </ul>
                    )
                }

                {
                    files.length > 0 && (
                        <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                            {files.map((f, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <FiFileText className="shrink-0 text-slate-400" size={16} />
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-slate-800">
                                                {f.name}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {formatFileSize(f.size)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => removeFile(index)}
                                        className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700"
                                    >
                                        <FiTrash2 size={13} />
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    )
                }

                <button
                    onClick={handleGenerateReport}
                    disabled={!files.length}
                    className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition ${
                        files.length
                            ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/20 hover:opacity-90"
                            : "cursor-not-allowed bg-slate-100 text-slate-400"
                    }`}
                >
                    <FiUploadCloud size={18} />
                    {
                        files.length > 1
                            ? `Generate Reports (${files.length})`
                            : "Generate Report"
                    }
                </button>
            </div>

            {/* Recent Analyses */}
            <div className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FiFileText className="text-slate-400" size={18} />
                        <h2 className="text-lg font-bold text-slate-900">
                            Recent Analyses
                        </h2>
                    </div>
                    <Link
                        href="/employee/reports"
                        className="text-sm font-semibold text-blue-600 hover:underline"
                    >
                        View All
                    </Link>
                </div>

                {
                    recentCalls.length === 0 ? (
                        <p className="mt-6 text-sm text-slate-500">
                            No analyses yet — upload a call recording above to
                            get started.
                        </p>
                    ) : (
                        <div className="mt-4 divide-y divide-slate-100">
                            {recentCalls.slice(0, 5).map((call) => {
                                const badge = statusBadge(call.processing_status);
                                const completed = call.processing_status === "COMPLETED";

                                return (
                                    <div
                                        key={call.id}
                                        className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-slate-800">
                                                {call.original_filename}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {formatDateTime(call.created_at)}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
                                                {badge.label}
                                            </span>

                                            {
                                                completed ? (
                                                    <Link
                                                        href={`/employee/reports/${call.id}`}
                                                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                                    >
                                                        <FiEye size={14} />
                                                        View Report
                                                    </Link>
                                                ) : (
                                                    <span className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-300">
                                                        <FiEye size={14} />
                                                        View Report
                                                    </span>
                                                )
                                            }
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                }
            </div>
        </DashboardLayout>
    );
}
