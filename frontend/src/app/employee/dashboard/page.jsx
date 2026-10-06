"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { FiCpu, FiUploadCloud, FiFolder, FiFileText, FiTrash2 } from "react-icons/fi";

import DashboardLayout from "../../../components/DashboardLayout";
import CallIllustration from "../../../components/CallIllustration";

import { getDashboard } from "../../../services/employeeService";
import { setPendingFiles } from "../../../lib/uploadStore";
import {
    ALLOWED_AUDIO_LABEL,
    AUDIO_ACCEPT,
    MAX_UPLOAD_MB,
    validateAudioFiles
} from "../../../lib/validation.mjs";

export default function EmployeeDashboardPage() {

    const router = useRouter();
    const inputRef = useRef(null);

    const [employee, setEmployee] = useState(null);
    const [files, setFiles] = useState([]);
    const [fileErrors, setFileErrors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function loadAll() {
            try {
                const dashboardData = await getDashboard();
                setEmployee(dashboardData.employee);
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

    // Keep only files the backend will accept; report the rest.
    const handleFilesSelected = (event) => {
        const { valid, errors } = validateAudioFiles(event.target.files);

        setFiles(valid);
        setFileErrors(errors);

        if (!valid.length && inputRef.current) inputRef.current.value = "";
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
            <div className="grid gap-10 md:grid-cols-2 md:items-start">
                <CallIllustration batch={files.length > 1} />
                <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg">
                        <FiCpu size={22} />
                    </div>

                    <h1 className="mt-5 text-3xl font-bold leading-snug md:text-4xl">
                        Hello, {" "}
                        <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
                            {firstName}
                        </span>
                        <br />
                        Welcome to{" "}
                        <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
                            Service Desk AI
                        </span>
                    </h1>

                    <p className="mt-3 text-slate-500">
                        Instantly convert conversations into clear, actionable
                        summaries.
                        <br />
                        Understand emotions behind every word with intelligent
                        sentiment analysis.
                    </p>

                    <div className="mt-6 max-w-md">
                        <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Call Audio
                        </label>
                        <button
                            onClick={() => inputRef.current?.click()}
                            className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-left transition hover:border-blue-400"
                        >
                            <span className={
                                files.length > 0
                                    ? "truncate font-medium text-slate-800"
                                    : "text-slate-400"
                            }>
                                {
                                    files.length === 0
                                        ? "Select an audio file"
                                        : files.length === 1
                                            ? files[0].name
                                            : `${files.length} files selected`
                                }
                            </span>
                            <FiFolder className="shrink-0 text-slate-400" size={18} />
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept={AUDIO_ACCEPT}
                            multiple
                            onChange={handleFilesSelected}
                            className="hidden"
                        />
                        <p className="mt-2 text-xs text-slate-400">
                            {ALLOWED_AUDIO_LABEL} supported · up to {MAX_UPLOAD_MB} MB each · select one or more files
                        </p>

                        {
                            fileErrors.length > 0 && (
                                <ul role="alert" className="mt-3 space-y-1 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
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
                    </div>

                    <button
                        onClick={handleGenerateReport}
                        disabled={!files.length}
                        className="mt-6 flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 font-semibold text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        <FiUploadCloud size={18} />
                        {
                            files.length > 1
                                ? `Generate Reports (${files.length})`
                                : "Generate Report"
                        }
                    </button>
                </div>
            </div>
        </DashboardLayout>
    );
}
