"use client";

import { useState } from "react";
import Link from "next/link";
import {
    FiEye,
    FiDownload,
    FiTrash2,
    FiSearch
} from "react-icons/fi";

import {
    downloadReport,
    deleteReport
} from "../services/employeeService";

export default function ReportTable({

    reports = [],

    onRefresh

}) {

    const [search, setSearch] = useState("");

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

    const filteredReports = reports.filter((report) =>

        report.original_filename

            ?.toLowerCase()

            .includes(search.toLowerCase())

    );

    const getStatusStyle = (status) => {

        switch (status) {

            case "COMPLETED":

                return "bg-green-100 text-green-700";

            case "FAILED":

                return "bg-red-100 text-red-700";

            default:

                return "bg-yellow-100 text-yellow-700";

        }

    };

    return (

        <div className="overflow-hidden rounded-2xl bg-white shadow-md">

            {/* Toolbar: search only — page-level heading already shown above */}

            <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-5">

                <span className="text-sm font-medium text-slate-500">

                    {filteredReports.length} {filteredReports.length === 1 ? "report" : "reports"}

                </span>

                <div className="relative">

                    <FiSearch
                        className="absolute left-3 top-3 text-slate-400"
                    />

                    <input

                        type="text"

                        placeholder="Search report..."

                        value={search}

                        onChange={(e) =>

                            setSearch(e.target.value)

                        }

                        className="w-72 rounded-xl border border-slate-300 py-2 pl-10 pr-4 outline-none focus:border-blue-500"

                    />

                </div>

            </div>

            <div className="overflow-x-auto">

                <table className="min-w-full">

                    <thead className="bg-slate-50">

                        <tr>

                            <th className="px-6 py-4 text-left">

                                Audio File

                            </th>

                            <th className="px-6 py-4 text-center">

                                Confidence

                            </th>

                            <th className="px-6 py-4 text-center">

                                Customer

                            </th>

                            <th className="px-6 py-4 text-center">

                                Agent

                            </th>

                            <th className="px-6 py-4 text-center">

                                Status

                            </th>

                            <th className="px-6 py-4 text-center">

                                Uploaded

                            </th>

                            <th className="px-6 py-4 text-center">

                                Actions

                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            filteredReports.length === 0 && (

                                <tr>

                                    <td

                                        colSpan={7}

                                        className="py-14 text-center text-slate-500"

                                    >

                                        No reports found.

                                    </td>

                                </tr>

                            )

                        }

                        {

                            filteredReports.map((report) => (

                                <tr

                                    key={report.report_id}

                                    className="border-t hover:bg-slate-50"

                                >

                                    <td className="px-6 py-5 font-medium">

                                        {report.original_filename}

                                    </td>

                                    <td className="px-6 py-5 text-center font-semibold">

                                        {report.confidence_score}

                                    </td>

                                    <td className="px-6 py-5 text-center">

                                        {report.customer_score}

                                    </td>

                                    <td className="px-6 py-5 text-center">

                                        {report.agent_score}

                                    </td>

                                    <td className="px-6 py-5 text-center">

                                        <span

                                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(report.processing_status)}`}

                                        >

                                            {report.processing_status}

                                        </span>

                                    </td>

                                    <td className="px-6 py-5 text-center text-sm text-slate-500">

                                        {

                                            new Date(

                                                report.created_at

                                            ).toLocaleDateString()

                                        }

                                    </td>

                                    <td className="px-6 py-5">

                                        <div className="flex justify-center gap-3">

                                            <Link

                                                href={`/employee/reports/${report.report_id}`}

                                                className="rounded-lg bg-blue-600 p-2 text-white transition hover:bg-blue-700"

                                                title="View Report"

                                            >

                                                <FiEye />

                                            </Link>

                                            <button

                                                onClick={() =>

                                                    downloadPdf(

                                                        report.report_id

                                                    )

                                                }

                                                className="rounded-lg bg-green-600 p-2 text-white transition hover:bg-green-700"

                                                title="Download PDF"

                                            >

                                                <FiDownload />

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

                                                <FiTrash2 />

                                            </button>

                                        </div>

                                    </td>

                                </tr>

                            ))

                        }

                    </tbody>

                </table>

            </div>

        </div>

    );

}