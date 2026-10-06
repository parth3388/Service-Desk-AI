"use client";
import Link from "next/link";
import { FiTrash2, FiArrowRight } from "react-icons/fi";
import { deleteReport as deleteEmployeeReport } from "../services/employeeService";

export default function RecentCallsTable({

    calls = [],

    showEmployee = false,

    onRefresh,

    onDelete,

    viewAllHref

}) {

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

    return (

        <div className="overflow-hidden rounded-2xl bg-white shadow-md">

            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">

                <div>

                    <h2 className="text-xl font-bold text-slate-800">

                        Recent Calls

                    </h2>

                    <p className="mt-1 text-sm text-slate-500">

                        Latest uploaded customer support calls

                    </p>

                </div>

                {

                    viewAllHref && (

                        <Link

                            href={viewAllHref}

                            className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"

                        >

                            View All

                            <FiArrowRight size={16} />

                        </Link>

                    )

                }

            </div>

            <div className="overflow-x-auto">

                <table className="min-w-full">

                    <thead className="bg-slate-50">

                        <tr>

                            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">

                                Audio File

                            </th>

                            {

                                showEmployee && (

                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">

                                        Employee

                                    </th>

                                )

                            }

                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">

                                Confidence

                            </th>

                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">

                                Customer

                            </th>

                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">

                                Agent

                            </th>

                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">

                                Status

                            </th>

                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">

                                Uploaded

                            </th>

                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">

                                Action

                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            calls.length === 0 && (

                                <tr>

                                    <td

                                        colSpan={

                                            showEmployee ? 8 : 7

                                        }

                                        className="py-12 text-center text-slate-500"

                                    >

                                        No reports available.

                                    </td>

                                </tr>

                            )

                        }

                        {

                            calls.map((call) => (

                                <tr

                                    key={call.id}

                                    className="border-t border-slate-100 hover:bg-slate-50"

                                >

                                    <td className="px-6 py-5">

                                        <p className="font-medium text-slate-800">

                                            {call.original_filename}

                                        </p>

                                    </td>

                                    {

                                        showEmployee && (

                                            <td className="px-6 py-5">

                                                {call.employee_name}

                                            </td>

                                        )

                                    }

                                    <td className="px-6 py-5 text-center font-semibold">

                                        {call.confidence_score}

                                    </td>

                                    <td className="px-6 py-5 text-center">

                                        {call.customer_score}

                                    </td>

                                    <td className="px-6 py-5 text-center">

                                        {call.agent_score}

                                    </td>

                                    <td className="px-6 py-5 text-center">

                                        <span

                                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(call.processing_status)}`}

                                        >

                                            {call.processing_status}

                                        </span>

                                    </td>

                                    <td className="px-6 py-5 text-center text-sm text-slate-500">

                                        {

                                            new Date(

                                                call.created_at

                                            ).toLocaleDateString()

                                        }

                                    </td>

                                    <td className="px-6 py-5">

                                        <div className="flex items-center justify-center">

                                            <button
                                                onClick={() => handleDelete(call.id)}
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