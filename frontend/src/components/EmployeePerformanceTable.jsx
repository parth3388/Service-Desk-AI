"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    FiSearch,
    FiUsers,
    FiAward,
    FiTrash2,
    FiFilter,
    FiChevronLeft,
    FiChevronRight
} from "react-icons/fi";

const PAGE_SIZE = 10;

const RATING_OPTIONS = [
    { value: "all", label: "All Employees" },
    { value: "excellent", label: "Excellent", min: 90 },
    { value: "good", label: "Good", min: 75 },
    { value: "average", label: "Average", min: 60 },
    { value: "needs-improvement", label: "Needs Improvement", min: 0 }
];

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

const initialsOf = (name) =>
    name
        ?.split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?";

export default function EmployeePerformanceTable({

    employees = [],

    onDelete

}) {

    const [search, setSearch] = useState("");
    const [rating, setRating] = useState("all");
    const [page, setPage] = useState(1);

    // tracks which employee_id is currently being deleted, so we can
    // disable just that row's button and show a small loading state
    const [deletingId, setDeletingId] = useState(null);

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

    const filteredEmployees = useMemo(() => {

        return employees
            .filter((employee) =>
                employee.employee_name
                    ?.toLowerCase()
                    .includes(
                        search.toLowerCase()
                    )
            )
            .filter((employee) => {
                if (rating === "all") return true;
                return getPerformanceBadge(employee.average_confidence_score).text ===
                    RATING_OPTIONS.find((r) => r.value === rating)?.label;
            });

    }, [employees, search, rating]);

    // Reset to page 1 whenever the filters change — adjusting state during
    // render (React's documented pattern for this) instead of in an effect,
    // since this is deriving state from a prop/filter change, not
    // synchronizing with an external system.
    const [prevFilters, setPrevFilters] = useState({ search, rating });
    if (prevFilters.search !== search || prevFilters.rating !== rating) {
        setPrevFilters({ search, rating });
        setPage(1);
    }

    const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pagedEmployees = filteredEmployees.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    const animatedCount = useCountUp(filteredEmployees.length);


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

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">

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

            <div className="border-b border-slate-100 p-6">

                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                            <FiUsers size={18} />
                        </span>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Employees</h2>
                            <p className="text-sm text-slate-500">
                                View detailed performance metrics for all employees
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

                                placeholder="Search employee..."

                                value={search}

                                onChange={(e) =>
                                    setSearch(e.target.value)
                                }

                                className="w-full rounded-xl border border-slate-200 py-2.5 pr-4 pl-10 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-64"

                            />

                        </div>

                        <div className="relative">
                            <FiFilter className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={14} />
                            <select
                                value={rating}
                                onChange={(e) => setRating(e.target.value)}
                                className="appearance-none rounded-xl border border-slate-200 py-2.5 pr-8 pl-9 text-sm font-medium text-slate-600 outline-none transition focus:border-blue-500"
                            >
                                {RATING_OPTIONS.map((opt) => (
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

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Calls

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

                                Rating

                            </th>

                            <th className="px-4 py-4 text-center text-xs font-bold tracking-wide text-slate-500 uppercase">

                                Action

                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            pagedEmployees.length === 0 && (

                                <tr>

                                    <td

                                        colSpan={8}

                                        className="py-16 text-center"

                                    >

                                        <div className="row-animate flex flex-col items-center gap-2">

                                            <FiUsers size={36} className="text-slate-300" />

                                            <p className="font-medium text-slate-500">

                                                {employees.length === 0
                                                    ? "No employees yet."
                                                    : "No employees match your filters."}

                                            </p>

                                            {employees.length > 0 && (
                                                <p className="text-sm text-slate-400">
                                                    Try a different name or rating filter.
                                                </p>
                                            )}

                                        </div>

                                    </td>

                                </tr>

                            )

                        }

                        {

                            pagedEmployees.map((employee, index) => {

                                const badge = getPerformanceBadge(

                                    employee.average_confidence_score

                                );

                                const isDeleting = deletingId === employee.employee_id;
                                const rowNumber = (currentPage - 1) * PAGE_SIZE + index + 1;

                                return (

                                    <tr

                                        key={employee.employee_id}

                                        style={{ animationDelay: `${index * 60}ms` }}

                                        className="row-animate border-t border-slate-100 odd:bg-white even:bg-slate-50/60 transition hover:bg-blue-50/40"

                                    >

                                        <td className="px-4 py-5 text-sm font-semibold text-slate-400">
                                            {rowNumber.toString().padStart(2, "0")}
                                        </td>

                                        <td className="px-4 py-5">

                                            <div className="flex items-center gap-3">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-xs font-bold text-white">
                                                    {initialsOf(employee.employee_name)}
                                                </span>
                                                <div>
                                                    <p className="font-semibold text-slate-800">

                                                        {employee.employee_name}

                                                    </p>

                                                    <p className="text-sm text-slate-500">

                                                        Employee ID: {employee.employee_id}

                                                    </p>
                                                </div>
                                            </div>

                                        </td>

                                        <td className="px-4 py-5 text-center font-semibold">

                                            {employee.total_calls}

                                        </td>

                                        <td className="px-4 py-5 text-center font-bold text-green-600">

                                            {employee.average_confidence_score}

                                        </td>

                                        <td className="px-4 py-5 text-center font-medium text-blue-600">

                                            {employee.average_customer_score}

                                        </td>

                                        <td className="px-4 py-5 text-center font-medium text-purple-600">

                                            {employee.average_agent_score}

                                        </td>

                                        <td className="px-4 py-5 text-center">

                                            <span

                                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-transform hover:scale-105 ${badge.className}`}

                                            >

                                                <FiAward size={14} />

                                                {badge.text}

                                            </span>

                                        </td>

                                        <td className="px-4 py-5 text-center">

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

            {/* Pagination */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row">
                <p className="text-sm text-slate-500">
                    Showing {animatedCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
                    {"–"}
                    {Math.min(currentPage * PAGE_SIZE, filteredEmployees.length)} of {filteredEmployees.length} employees
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
