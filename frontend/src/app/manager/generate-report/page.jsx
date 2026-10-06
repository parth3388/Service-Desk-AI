"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../../../components/DashboardLayout";
import { getEmployeesList } from "../../../services/managerService";
import { setPendingManagerUpload } from "../../../lib/managerUploadStore";
import {
    ALLOWED_AUDIO_LABEL,
    AUDIO_ACCEPT,
    MAX_UPLOAD_MB,
    validateAudioFiles
} from "../../../lib/validation.mjs";
import {
    FiUploadCloud,
    FiFileText,
    FiTrash2
} from "react-icons/fi";

export default function ManagerGenerateReportPage() {

    const router = useRouter();

    const [employees, setEmployees] = useState([]);
    const [employeeId, setEmployeeId] = useState("");
    const [files, setFiles] = useState([]);
    const [fileErrors, setFileErrors] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        async function loadEmployees() {
            try {
                const data = await getEmployeesList();
                setEmployees(data.employees);
            } catch (err) {
                console.error(err);
                setError("Unable to load employees.");
            }
        }

        loadEmployees();
    }, []);

    // Keep only files the backend will accept; report the rest.
    const handleFilesSelected = (event) => {
        const { valid, errors } = validateAudioFiles(event.target.files);

        setFiles(valid);
        setFileErrors(errors);

        if (!valid.length) event.target.value = "";
    };

    const removeFile = (index) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    const startGenerate = () => {

        if (!employeeId) {
            alert("Please select an employee.");
            return;
        }

        if (!files.length) {
            alert("Please select at least one audio file.");
            return;
        }

        setPendingManagerUpload(employeeId, files);

        router.push("/manager/generate-report/processing");
    };

    return (
        <DashboardLayout title="Generate Report">

            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-10 shadow-md">

                <h2 className="text-2xl font-bold text-slate-900">
                    Generate Report for an Employee
                </h2>

                <p className="mt-2 text-slate-500">
                    Select an employee and upload their call audio to
                    generate an AI-analyzed report on their behalf.
                </p>

                <div className="mt-6">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Employee
                    </label>
                    <select
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-4 py-3.5"
                    >
                        <option value="">Select an employee</option>
                        {employees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                                {emp.full_name} ({emp.email})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="mt-6">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Call Audio
                    </label>
                    <input
                        type="file"
                        accept={AUDIO_ACCEPT}
                        multiple
                        onChange={handleFilesSelected}
                        className="w-full rounded-xl border border-slate-300 px-4 py-3.5"
                    />

                    <p className="mt-2 text-xs text-slate-400">
                        {ALLOWED_AUDIO_LABEL} supported · up to {MAX_UPLOAD_MB} MB each
                    </p>

                    {fileErrors.length > 0 && (
                        <ul role="alert" className="mt-3 space-y-1 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
                            {fileErrors.map((message) => (
                                <li key={message}>{message}</li>
                            ))}
                        </ul>
                    )}

                    {files.length > 0 && (
                        <div className="mt-4 space-y-2">
                            {files.map((f, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5"
                                >
                                    <div className="flex items-center gap-3">
                                        <FiFileText className="text-slate-400" size={16} />
                                        <span className="text-sm font-medium text-slate-800">
                                            {f.name}
                                        </span>
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
                    )}
                </div>

                {error && (
                    <div className="mt-4 rounded-xl bg-red-100 p-4 text-red-700">
                        {error}
                    </div>
                )}

                <div className="mt-6">
                    <button
                        onClick={startGenerate}
                        disabled={files.length === 0}
                        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 font-semibold text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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