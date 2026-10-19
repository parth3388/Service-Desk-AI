"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    FiSearch,
    FiDownload,
    FiFileText,
    FiTrash2,
    FiFilter,
    FiChevronLeft,
    FiChevronRight,
    FiEye
} from "react-icons/fi";

import { downloadCompanyReport, deleteCompanyReport } from "../services/managerService";

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
    { value: "all", label: "All Statuses" },
    { value: "COMPLETED", label: "Completed" },
    { value: "FAILED", label: "Failed" },
    { value: "IN_PROGRESS", label: "In Progress" }
];

const IN_PROGRESS_STATUSES = ["UPLOADING", "TRANSCRIBING", "AI_ANALYZING", "GENERATING_REPORT"];

const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return "—";
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export default function CompanyReportsTable({

    reports = [],

    onRefresh

}) {

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [page, setPage] = useState(1);
    const [deletingId, setDeletingId] = useState(null);

    const filteredReports = useMemo(() => {

        return reports
            .filter((report) =>
                report.original_filename
                    ?.toLowerCase()
                    .includes(search.toLowerCase())
                ||
                String(report.employee_id)
                    .includes(search)
            )
            .filter((report) => {
                if (status === "all") return true;
                if (status === "IN_PROGRESS") return IN_PROGRESS_STATUSES.includes(report.processing_status);
                return report.processing_status === status;
            });

    }, [reports, search, status]);

    // Reset to page 1 whenever the filters change — adjusting state during
    // render (React's documented pattern for this) instead of in an effect.
    const [prevFilters, setPrevFilters] = useState({ search, status });
    if (prevFilters.search !== search || prevFilters.status !== status) {
        setPrevFilters({ search, status });
        setPage(1);
    }

    const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pagedReports = filteredReports.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    const downloadPdf = async (reportId) => {

        try {

            const response = await downloadCompanyReport(reportId);

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

            setDeletingId(reportId);

            await deleteCompanyReport(reportId);

            if (onRefresh) {
                await onRefresh();
            }

        }

        catch (error) {

            console.error(error);

            alert(
                error.response?.data?.detail ||
                "Unable to delete report."
            );

        }

        finally {

            setDeletingId(null);

        }

    };


    const getStatusStyle = (statusValue) => {

        switch (statusValue) {

            case "COMPLETED":

                return "bg-green-100 text-green-700";

            case "FAILED":

                return "bg-red-100 text-red-700";

            case "UPLOADING":

            case "TRANSCRIBING":

            case "AI_ANALYZING":

            case "GENERATING_REPORT":

                return "bg-amber-100 text-amber-700";

            default:

                return "bg-slate-100 text-slate-700";

        }

    };



    return (

        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">

            {/* Header */}

            <div className="border-b border-slate-100 p-6">

                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                            <FiFileText size={18} />
                        </span>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">
                                All Reports
                            </h2>
                            <p className="text-sm text-slate-500">
                                View all reports generated by employees
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

                        <div className="relative">

                            <FiSearch
                                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                            />

                            <input

                                type="text"

                                value={search}

                                onChange={(e) =>
                                    setSearch(e.target.value)
                                }

                                placeholder="Search filename or Employee ID..."

                                className="w-full rounded-xl border border-slate-200 py-2.5 pr-4 pl-10 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-72"

                            />

                        </div>

                        <div className="relative">
                            <FiFilter className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={14} />
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="appearance-none rounded-xl border border-slate-200 py-2.5 pr-8 pl-9 text-sm font-medium text-slate-600 outline-none transition focus:border-blue-500"
                            >
                                {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                    </div>

                </div>

            </div>



            {/* Table */}

            <div className="overflow-x-auto">

                <table className="min-w-full">

                    <thead className="bg-slate-50">

                        <tr>

                            <th className="px-4 py-4 text-left text-xs font-bold tracking-wide text-slate-500 uppercase">
                                #
                            </th>

                            <th className="px-4 py-4 text-left text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Employee

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

                                Duration

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Status

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Uploaded

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Action

                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            pagedReports.length === 0 && (

                                <tr>

                                    <td

                                        colSpan={10}

                                        className="py-16 text-center text-slate-500"

                                    >

                                        No reports found.

                                    </td>

                                </tr>

                            )

                        }

                        {

                            pagedReports.map((report, index) => {
                                const rowNumber = (currentPage - 1) * PAGE_SIZE + index + 1;
                                const failed = report.processing_status === "FAILED";
                                const isDeleting = deletingId === report.report_id;

                                return (

                                    <tr

                                        key={report.report_id}

                                        className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 transition hover:bg-blue-50/40"

                                    >

                                        <td className="px-4 py-5 text-sm font-semibold text-slate-400">
                                            {rowNumber}
                                        </td>

                                        <td className="px-4 py-5">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
                                                #{report.employee_id}
                                            </span>
                                        </td>

                                        <td className="px-4 py-5">

                                            <div>

                                                <p className="font-medium text-slate-800">

                                                    {report.original_filename}

                                                </p>

                                                <p className="text-xs text-slate-400">

                                                    Report ID: {report.report_id}

                                                </p>

                                            </div>

                                        </td>

                                        <td className={`px-4 py-5 text-center font-bold ${failed ? "text-slate-400" : "text-green-600"}`}>

                                            {failed ? "—" : report.confidence_score}

                                        </td>

                                        <td className={`px-4 py-5 text-center font-medium ${failed ? "text-slate-400" : "text-blue-600"}`}>

                                            {failed ? "—" : report.customer_score}

                                        </td>

                                        <td className={`px-4 py-5 text-center font-medium ${failed ? "text-slate-400" : "text-purple-600"}`}>

                                            {failed ? "—" : report.agent_score}

                                        </td>

                                        <td className="px-4 py-5 text-center text-sm text-slate-500">

                                            {formatDuration(report.call_duration)}

                                        </td>

                                        <td className="px-4 py-5 text-center">

                                            <span

                                                className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusStyle(report.processing_status)}`}

                                            >

                                                {report.processing_status}

                                            </span>

                                        </td>

                                        <td className="px-4 py-5 text-center text-sm text-slate-500">

                                            {

                                                new Date(

                                                    report.created_at

                                                ).toLocaleDateString()

                                            }

                                        </td>

                                        <td className="px-4 py-5">

                                            <div className="flex justify-center gap-2">

                                                <Link
                                                    href={`/manager/report/${report.report_id}`}
                                                    className="rounded-lg bg-blue-600 p-2 text-white transition hover:bg-blue-700"
                                                    title="View Report"
                                                >
                                                    <FiEye size={15} />
                                                </Link>

                                                <button
                                                    onClick={() =>
                                                        downloadPdf(report.report_id)
                                                    }
                                                    disabled={report.processing_status !== "COMPLETED"}
                                                    className="rounded-lg bg-green-600 p-2 text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                                                    title="Download PDF"
                                                >
                                                    <FiDownload size={15} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(report.report_id)}
                                                    disabled={isDeleting}
                                                    className="rounded-lg bg-red-600 p-2 text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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

            {/* Pagination */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row">
                <p className="text-sm text-slate-500">
                    Showing {filteredReports.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
                    {"–"}
                    {Math.min(currentPage * PAGE_SIZE, filteredReports.length)} of {filteredReports.length} reports
                </p>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <FiChevronLeft size={16} />
                    </button>
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-blue-600 px-2 text-sm font-semibold text-white">
                        {currentPage}
                    </span>
                    <span className="text-sm text-slate-400">of {totalPages}</span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <FiChevronRight size={16} />
                    </button>
                </div>
            </div>

        </div>

    );

}
