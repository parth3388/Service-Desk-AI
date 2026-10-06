"use client";

import { useRef, useState } from "react";
import { FiUploadCloud, FiFile, FiX, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import { uploadAudioFiles } from "../services/uploadService";

const ACCEPTED_TYPES = ".mp3,.wav,.m4a,.aac";

/**
 * Drag-and-drop audio upload card, styled to match StatCard / the rest of
 * the dashboard (rounded-2xl white surface, shadow-md, blue accent).
 *
 * @param {(uploaded: object[]) => void} [onUploadComplete] - called with the
 *   backend records after all selected files finish uploading, so the parent
 *   can refresh things like the pending audio dropdown.
 */
export default function UploadCard({ onUploadComplete }) {
    const inputRef = useRef(null);
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState([]); // [{ file, progress, status }]
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");

    const addFiles = (fileList) => {
        const incoming = Array.from(fileList).map((file) => ({
            file,
            progress: 0,
            status: "pending", // pending | uploading | done | error
        }));
        setFiles((prev) => [...prev, ...incoming]);
        setError("");
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files?.length) {
            addFiles(e.dataTransfer.files);
        }
    };

    const handleBrowse = (e) => {
        if (e.target.files?.length) {
            addFiles(e.target.files);
        }
        e.target.value = "";
    };

    const removeFile = (index) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleUploadAll = async () => {
        const pending = files.filter((f) => f.status === "pending");
        if (pending.length === 0) return;

        setUploading(true);
        setError("");

        try {
            const results = await uploadAudioFiles(
                pending.map((f) => f.file),
                (fileIndex, percent) => {
                    setFiles((prev) => {
                        const next = [...prev];
                        const targetFile = pending[fileIndex].file;
                        const idx = next.findIndex((f) => f.file === targetFile);
                        if (idx !== -1) {
                            next[idx] = { ...next[idx], progress: percent, status: "uploading" };
                        }
                        return next;
                    });
                }
            );

            setFiles((prev) =>
                prev.map((f) =>
                    pending.some((p) => p.file === f.file)
                        ? { ...f, status: "done", progress: 100 }
                        : f
                )
            );

            if (onUploadComplete) onUploadComplete(results);
        } catch (err) {
            console.error(err);
            setError(
                err.response?.data?.detail || "Upload failed. Please try again."
            );
            setFiles((prev) =>
                prev.map((f) =>
                    pending.some((p) => p.file === f.file)
                        ? { ...f, status: "error" }
                        : f
                )
            );
        } finally {
            setUploading(false);
        }
    };

    const pendingCount = files.filter((f) => f.status === "pending").length;

    return (
        <div className="rounded-2xl bg-white p-6 shadow-md">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Upload Call Audio</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        Drag and drop recordings, or browse from your device.
                    </p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                    <FiUploadCloud className="text-xl text-blue-700" />
                </div>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition
                ${dragActive
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50"
                    }`}
            >
                <FiUploadCloud className="mb-3 text-3xl text-blue-500" />
                <p className="text-sm font-semibold text-slate-700">
                    Drop audio files here, or click to browse
                </p>
                <p className="mt-1 text-xs text-slate-400">
                    Supports MP3, WAV, M4A, AAC
                </p>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_TYPES}
                    onChange={handleBrowse}
                    className="hidden"
                />
            </div>

            {error && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    <FiAlertCircle className="shrink-0" />
                    {error}
                </div>
            )}

            {/* File list */}
            {files.length > 0 && (
                <div className="mt-5 space-y-2">
                    {files.map((f, i) => (
                        <div
                            key={`${f.file.name}-${i}`}
                            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                        >
                            <FiFile className="shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-700">
                                    {f.file.name}
                                </p>
                                {f.status === "uploading" && (
                                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                                        <div
                                            className="h-full rounded-full bg-blue-600 transition-all duration-200"
                                            style={{ width: `${f.progress}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                            {f.status === "done" && (
                                <FiCheckCircle className="shrink-0 text-green-600" size={18} />
                            )}
                            {f.status === "error" && (
                                <FiAlertCircle className="shrink-0 text-red-600" size={18} />
                            )}
                            {f.status === "pending" && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFile(i);
                                    }}
                                    className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
                                    aria-label="Remove file"
                                >
                                    <FiX size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {pendingCount > 0 && (
                <button
                    onClick={handleUploadAll}
                    disabled={uploading}
                    className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {uploading
                        ? "Uploading..."
                        : `Upload ${pendingCount} File${pendingCount > 1 ? "s" : ""}`}
                </button>
            )}
        </div>
    );
}