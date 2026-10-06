"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    FiSearch,
    FiUsers,
    FiAward,
    FiTrash2
} from "react-icons/fi";

// Smoothly animates a number from its previous value to a new target
// whenever `target` changes (e.g. as the search filter narrows results).
function useCountUp(target, duration = 500) {

    const [display, setDisplay] = useState(target);
    const prevTarget = useRef(target);

    useEffect(() => {

        const from = prevTarget.current;
        const to = target;

        if (from === to) return;

        let startTime = null;
        let rafId;

        const tick = (timestamp) => {

            if (startTime === null) startTime = timestamp;

            const progress = Math.min((timestamp - startTime) / duration, 1);
            const value = Math.round(from + (to - from) * progress);

            setDisplay(value);

            if (progress < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                prevTarget.current = to;
            }

        };

        rafId = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(rafId);

    }, [target, duration]);

    return display;

}

export default function EmployeePerformanceTable({

    employees = [],

    onDelete

}) {

    const [search, setSearch] = useState("");

    // tracks which employee_id is currently being deleted, so we can
    // disable just that row's button and show a small loading state
    const [deletingId, setDeletingId] = useState(null);

    const filteredEmployees = useMemo(() => {

        return employees.filter((employee) =>

            employee.employee_name
                ?.toLowerCase()
                .includes(
                    search.toLowerCase()
                )

        );

    }, [employees, search]);

    const animatedCount = useCountUp(filteredEmployees.length);


    const getPerformanceBadge = (score) => {

        if (score >= 90) {

            return {
                text: "Excellent",
                className:
                    "bg-green-100 text-green-700 badge-excellent"
            };

        }

        if (score >= 75) {

            return {
                text: "Good",
                className:
                    "bg-blue-100 text-blue-700"
            };

        }

        if (score >= 60) {

            return {
                text: "Average",
                className:
                    "bg-yellow-100 text-yellow-700"
            };

        }

        return {

            text: "Needs Improvement",

            className:
                "bg-red-100 text-red-700"

        };

    };

    const handleDeleteClick = async (employee) => {

        const confirmed = window.confirm(

            `Are you sure you want to delete ${employee.employee_name}? This will permanently delete all their reports and cannot be undone.`

        );

        if (!confirmed) return;

        try {

            setDeletingId(employee.employee_id);

            await onDelete?.(employee.employee_id);

        }

        finally {

            setDeletingId(null);

        }

    };


    return (

        <div className="overflow-hidden rounded-2xl bg-white shadow-lg">

            <style jsx>{`
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .row-animate {
                    animation: fadeInUp 0.45s ease-out both;
                }
                @keyframes softPulse {
                    0%, 100% {
                        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.35);
                    }
                    50% {
                        box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
                    }
                }
                .badge-excellent {
                    animation: softPulse 2.2s ease-in-out infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                    .row-animate,
                    .badge-excellent {
                        animation: none !important;
                    }
                }
            `}</style>

            {/* Header */}

            <div className="border-b border-slate-200 p-6">

                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">

                        <FiUsers className="text-blue-600" />

                        Showing {filteredEmployees.length} of {employees.length} employees

                    </div>

                    <div className="flex items-center gap-4">

                        <div className="rounded-xl bg-blue-50 px-5 py-3 transition hover:bg-blue-100">

                            <p className="text-sm text-slate-500">

                                Total Employees

                            </p>

                            <h3 className="text-2xl font-bold tabular-nums text-blue-700">

                                {animatedCount}

                            </h3>

                        </div>

                        <div className="relative">

                            <FiSearch
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-blue-600"
                            />

                            <input

                                type="text"

                                placeholder="Search employee..."

                                value={search}

                                onChange={(e) =>
                                    setSearch(e.target.value)
                                }

                                className="peer w-72 rounded-xl border border-slate-300 py-2 pl-10 pr-4 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"

                            />

                        </div>

                    </div>

                </div>

            </div>


            {/* Table */}

            <div className="overflow-x-auto">

                <table className="min-w-full">

                    <thead className="bg-slate-100">

                        <tr>

                            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">

                                Employee

                            </th>

                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">

                                Calls

                            </th>

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

                                Rating

                            </th>

                            <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">

                                Action

                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            filteredEmployees.length === 0 && (

                                <tr>

                                    <td

                                        colSpan={7}

                                        className="py-16 text-center"

                                    >

                                        <div className="row-animate flex flex-col items-center gap-2">

                                            <FiUsers size={36} className="text-slate-300" />

                                            <p className="font-medium text-slate-500">

                                                {employees.length === 0
                                                    ? "No employees yet."
                                                    : "No employees match your search."}

                                            </p>

                                            {employees.length > 0 && (
                                                <p className="text-sm text-slate-400">
                                                    Try a different name.
                                                </p>
                                            )}

                                        </div>

                                    </td>

                                </tr>

                            )

                        }

                        {

                            filteredEmployees.map((employee, index) => {

                                const badge = getPerformanceBadge(

                                    employee.average_confidence_score

                                );

                                const isDeleting = deletingId === employee.employee_id;

                                return (

                                    <tr

                                        key={employee.employee_id}

                                        style={{ animationDelay: `${index * 60}ms` }}

                                        className="row-animate border-t border-slate-100 transition hover:bg-slate-50 hover:shadow-sm"

                                    >

                                        <td className="px-6 py-5">

                                            <div>

                                                <p className="font-semibold text-slate-800">

                                                    {employee.employee_name}

                                                </p>

                                                <p className="text-sm text-slate-500">

                                                    Employee ID :

                                                    {" "}

                                                    {employee.employee_id}

                                                </p>

                                            </div>

                                        </td>

                                        <td className="px-6 py-5 text-center font-semibold">

                                            {employee.total_calls}

                                        </td>

                                        <td className="px-6 py-5 text-center font-bold text-green-600">

                                            {employee.average_confidence_score}

                                        </td>

                                        <td className="px-6 py-5 text-center font-medium text-blue-600">

                                            {employee.average_customer_score}

                                        </td>

                                        <td className="px-6 py-5 text-center font-medium text-purple-600">

                                            {employee.average_agent_score}

                                        </td>

                                        <td className="px-6 py-5 text-center">

                                            <span

                                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-transform hover:scale-105 ${badge.className}`}

                                            >

                                                <FiAward size={14} />

                                                {badge.text}

                                            </span>

                                        </td>

                                        <td className="px-6 py-5 text-center">

                                            <button

                                                onClick={() => handleDeleteClick(employee)}

                                                disabled={isDeleting}

                                                className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"

                                            >

                                                <FiTrash2 size={14} />

                                                {isDeleting ? "Deleting..." : "Delete"}

                                            </button>

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