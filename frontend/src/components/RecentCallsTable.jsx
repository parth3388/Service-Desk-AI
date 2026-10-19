"use client";
import { useState } from "react";
import Link from "next/link";
import { FiTrash2, FiArrowRight, FiSearch } from "react-icons/fi";
import { deleteReport as deleteEmployeeReport } from "../services/employeeService";

const RANGE_OPTIONS = [
    { value: "all", label: "All Time", days: null },
    { value: "7", label: "Last 7 Days", days: 7 },
    { value: "30", label: "Last 30 Days", days: 30 }
];

export default function RecentCallsTable({

    calls = [],

    showEmployee = false,

    onRefresh,

    onDelete,

    viewAllHref

}) {

    const [search, setSearch] = useState("");
    const [range, setRange] = useState("all");

    const getStatusStyle = (status) => {

        switch (status) {

            case "COMPLETED":

                return "bg-green-100 text-green-700";

            case "FAILED":

                return "bg-red-100 text-red-700";

            case "AI_ANALYZING":

            case "GENERATING_REPORT":

            case "TRANSCRIBING":

            case "UPLOADING":

                return "bg-yellow-100 text-yellow-700";

            default:

                return "bg-slate-100 text-slate-700";

        }

    };
    const handleDelete = async (reportId) => {

        const confirmed = window.confirm(
            "Are you sure you want to delete this report?"
        );

        if (!confirmed) return;

        try {

            const deleteFn = onDelete || deleteEmployeeReport;

            await deleteFn(reportId);

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

    const selectedRange = RANGE_OPTIONS.find((r) => r.value === range) || RANGE_OPTIONS[0];
    const nowMs = new Date().getTime();

    const filteredCalls = calls
        .filter((call) =>
            call.original_filename
                ?.toLowerCase()
                .includes(search.toLowerCase())
        )
        .filter((call) => {
            if (!selectedRange.days) return true;
            const cutoff = nowMs - selectedRange.days * 24 * 60 * 60 * 1000;
            return new Date(call.created_at).getTime() >= cutoff;
        });

    return (

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">

            <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">

                <div>

                    <h2 className="text-xl font-bold text-slate-800">

                        Recent Calls

                    </h2>

                    <p className="mt-1 text-sm text-slate-500">

                        Latest uploaded customer support calls

                    </p>

                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

                    <div className="relative">
                        <FiSearch className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search by file name..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 py-2.5 pr-4 pl-9 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-60"
                        />
                    </div>

                    <select
                        value={range}
                        onChange={(e) => setRange(e.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 outline-none transition focus:border-blue-500"
                    >
                        {RANGE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>

                    {
                        viewAllHref && (

                            <Link

                                href={viewAllHref}

                                className="flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"

                            >

                                View All

                                <FiArrowRight size={16} />

                            </Link>

                        )
                    }

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

                            {

                                showEmployee && (

                                    <th className="px-4 py-4 text-left text-xs font-bold tracking-wide text-slate-500 uppercase">

                                        Employee

                                    </th>

                                )

                            }

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

                                Action

                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            filteredCalls.length === 0 && (

                                <tr>

                                    <td

                                        colSpan={

                                            showEmployee ? 9 : 8

                                        }

                                        className="py-12 text-center text-slate-500"

                                    >

                                        No reports found.

                                    </td>

                                </tr>

                            )

                        }

                        {

                            filteredCalls.map((call, index) => (

                                <tr

                                    key={call.id}

                                    className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 hover:bg-blue-50/40"

                                >

                                    <td className="px-4 py-5 text-sm font-semibold text-slate-400">
                                        {index + 1}
                                    </td>

                                    <td className="px-4 py-5">

                                        <p className="font-medium text-slate-800">

                                            {call.original_filename}

                                        </p>

                                    </td>

                                    {

                                        showEmployee && (

                                            <td className="px-4 py-5">

                                                {call.employee_name}

                                            </td>

                                        )

                                    }

                                    <td className="px-4 py-5 text-center font-semibold">

                                        {call.confidence_score}

                                    </td>

                                    <td className="px-4 py-5 text-center">

                                        {call.customer_score}

                                    </td>

                                    <td className="px-4 py-5 text-center">

                                        {call.agent_score}

                                    </td>

                                    <td className="px-4 py-5 text-center">

                                        <span

                                            className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusStyle(call.processing_status)}`}

                                        >

                                            {call.processing_status}

                                        </span>

                                    </td>

                                    <td className="px-4 py-5 text-center text-sm text-slate-500">

                                        {

                                            new Date(

                                                call.created_at

                                            ).toLocaleDateString()

                                        }

                                    </td>

                                    <td className="px-4 py-5">

                                        <div className="flex items-center justify-center">

                                            <button
                                                onClick={() => handleDelete(call.id)}
                                                className="rounded-lg bg-red-600 p-2 text-white transition hover:bg-red-700"
                                                title="Delete Report"
                                            >
                                                <FiTrash2 size={15} />
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
