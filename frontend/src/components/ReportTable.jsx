"use client";

import { useState } from "react";
import Link from "next/link";
import {
    FiEye,
    FiDownload,
    FiTrash2,
    FiSearch,
    FiMusic
} from "react-icons/fi";

import {
    downloadReport,
    deleteReport
} from "../services/employeeService";

const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return null;
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatFileSize = (bytes) => {
    if (!bytes) return null;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
};

const formatUploaded = (value) => {
    if (!value) return { date: "—", time: "" };
    const d = new Date(value);
    return {
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    };
};

const scoreColor = (value) => {
    if (value === null || value === undefined) return "text-slate-400";
    if (value >= 80) return "text-green-600";
    if (value >= 50) return "text-amber-600";
    return "text-red-600";
};

export default function ReportTable({

    reports = [],

    onRefresh

}) {

    const [search, setSearch] = useState("");
    const [sortOrder, setSortOrder] = useState("newest");

    const downloadPdf = async (reportId) => {

        try {

            const response = await downloadReport(
                reportId
            );

            const url = window.URL.createObjectURL(
                new Blob([response])
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

            alert(

                error.response?.data?.detail ||

                "Unable to download report."

            );

        }

    };

    const handleDelete = async (reportId) => {

        const confirmed = window.confirm(

            "Are you sure you want to delete this report?"

        );

        if (!confirmed) return;

        try {

            await deleteReport(reportId);

            alert("Report deleted successfully.");

            if (onRefresh) {

                onRefresh();

            }

        }

        catch (error) {

            console.error(error);

            alert(

                error.response?.data?.detail ||

                "Unable to delete report."

            );

        }

    };

    const filteredReports = reports
        .filter((report) =>
            report.original_filename
                ?.toLowerCase()
                .includes(search.toLowerCase())
        )
        .slice()
        .sort((a, b) => {
            const diff = new Date(a.created_at) - new Date(b.created_at);
            return sortOrder === "newest" ? -diff : diff;
        });

    const getStatusStyle = (status) => {

        switch (status) {

            case "COMPLETED":

                return "bg-green-100 text-green-700";

            case "FAILED":

                return "bg-red-100 text-red-700";

            default:

                return "bg-amber-100 text-amber-700";

        }

    };

    return (

        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">

            {/* Toolbar */}

            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">

                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <FiMusic className="text-slate-400" size={16} />
                    {filteredReports.length} {filteredReports.length === 1 ? "report" : "reports"}
                </span>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative">

                        <FiSearch
                            className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                            size={16}
                        />

                        <input

                            type="text"

                            placeholder="Search report..."

                            value={search}

                            onChange={(e) =>

                                setSearch(e.target.value)

                            }

                            className="w-full rounded-xl border border-slate-200 py-2.5 pr-4 pl-9 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-64"

                        />

                    </div>

                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 outline-none transition focus:border-blue-500"
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                    </select>
                </div>

            </div>

            <div className="overflow-x-auto">

                <table className="min-w-full">

                    <thead className="bg-slate-50">

                        <tr>

                            <th className="px-4 py-4 text-left text-xs font-bold tracking-wide text-slate-500 uppercase">
                                #
                            </th>

                            <th className="px-4 py-4 text-left text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Audio File

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Confidence

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Customer

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Agent

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Status

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Uploaded

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Actions

                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            filteredReports.length === 0 && (

                                <tr>

                                    <td

                                        colSpan={8}

                                        className="py-14 text-center text-slate-500"

                                    >

                                        No reports found.

                                    </td>

                                </tr>

                            )

                        }

                        {

                            filteredReports.map((report, index) => {
                                const duration = formatDuration(report.call_duration);
                                const size = formatFileSize(report.file_size);
                                const uploaded = formatUploaded(report.created_at);
                                const failed = report.processing_status === "FAILED";

                                return (

                                    <tr

                                        key={report.report_id}

                                        className="border-t border-slate-100 hover:bg-slate-50"

                                    >
                                        <td className="px-4 py-5 text-sm font-semibold text-slate-400">
                                            {index + 1}
                                        </td>

                                        <td className="px-4 py-5">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                                                    <FiMusic size={15} />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold text-slate-800">
                                                        {report.original_filename}
                                                    </p>
                                                    {(duration || size) && (
                                                        <p className="text-xs text-slate-400">
                                                            {[duration, size].filter(Boolean).join(" · ")}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        <td className={`px-4 py-5 text-center font-bold ${failed ? "text-slate-400" : scoreColor(report.confidence_score)}`}>
                                            {failed ? "—" : `${report.confidence_score}%`}
                                        </td>

                                        <td className={`px-4 py-5 text-center font-semibold ${failed ? "text-slate-400" : scoreColor(report.customer_score)}`}>
                                            {failed ? "—" : `${report.customer_score}%`}
                                        </td>

                                        <td className={`px-4 py-5 text-center font-semibold ${failed ? "text-slate-400" : scoreColor(report.agent_score)}`}>
                                            {failed ? "—" : `${report.agent_score}%`}
                                        </td>

                                        <td className="px-4 py-5 text-center">

                                            <span

                                                className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusStyle(report.processing_status)}`}

                                            >

                                                {report.processing_status}

                                            </span>

                                        </td>

                                        <td className="px-4 py-5 text-center text-sm text-slate-500">
                                            <p>{uploaded.date}</p>
                                            <p className="text-xs text-slate-400">{uploaded.time}</p>
                                        </td>

                                        <td className="px-4 py-5">

                                            <div className="flex justify-center gap-2">

                                                <Link

                                                    href={`/employee/reports/${report.report_id}`}

                                                    className="rounded-lg bg-blue-600 p-2 text-white transition hover:bg-blue-700"

                                                    title="View Report"

                                                >

                                                    <FiEye size={15} />

                                                </Link>

                                                <button

                                                    onClick={() =>

                                                        downloadPdf(

                                                            report.report_id

                                                        )

                                                    }

                                                    disabled={report.processing_status !== "COMPLETED"}

                                                    className="rounded-lg bg-green-600 p-2 text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"

                                                    title="Download PDF"

                                                >

                                                    <FiDownload size={15} />

                                                </button>

                                                <button

                                                    onClick={() =>

                                                        handleDelete(

                                                            report.report_id

                                                        )

                                                    }

                                                    className="rounded-lg bg-red-600 p-2 text-white transition hover:bg-red-700"

                                                    title="Delete Report"

                                                >

                                                    <FiTrash2 size={15} />

                                                </button>

                                            </div>

                                        </td>

                                    </tr>

                                );
                            })

                        }

                    </tbody>

                </table>

            </div>

        </div>

    );

}
