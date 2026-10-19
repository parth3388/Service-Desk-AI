"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    FiPhoneCall,
    FiShield,
    FiLoader,
    FiAlertTriangle,
    FiCalendar
} from "react-icons/fi";
import {
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from "recharts";

import DashboardLayout from "../../../components/DashboardLayout";
import ReportTable from "../../../components/ReportTable";

import { getMyReports } from "../../../services/employeeService";

const RANGE_OPTIONS = [
    { value: "all", label: "All Time", days: null },
    { value: "7", label: "Last 7 Days", days: 7 },
    { value: "30", label: "Last 30 Days", days: 30 }
];

const IN_PROGRESS_STATUSES = ["UPLOADING", "TRANSCRIBING", "AI_ANALYZING", "GENERATING_REPORT"];

function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub }) {
    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className={iconColor} size={20} />
                </span>
                <p className="text-sm font-medium text-slate-500">{label}</p>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
            {sub && <p className="mt-1 text-xs font-medium text-slate-400">{sub}</p>}
        </div>
    );
}

const dayKey = (value) => new Date(value).toISOString().slice(0, 10);
const dayLabel = (key) => new Date(key).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function MyReportsPage() {

    const [reports, setReports] = useState([]);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    const [range, setRange] = useState("all");

    const loadReports = useCallback(async () => {

        try {

            setLoading(true);

            const response = await getMyReports();

            setReports(response.reports || []);

        }

        catch (error) {

            console.error(error);

            setError(

                error.response?.data?.detail ||

                "Unable to load reports."

            );

        }

        finally {

            setLoading(false);

        }

    }, []);

    useEffect(() => {

        async function run() {
            await loadReports();
        }

        run();

    }, [loadReports]);

    const selectedRange = RANGE_OPTIONS.find((r) => r.value === range) || RANGE_OPTIONS[0];

    // Reads "now" directly in the render body (not inside useMemo) — the
    // React Compiler's purity check flags impure calls inside memoized
    // callbacks, but a time-varying read during render itself is fine.
    const nowMs = new Date().getTime();

    const filteredReports = !selectedRange.days
        ? reports
        : reports.filter((r) => {
            const cutoff = nowMs - selectedRange.days * 24 * 60 * 60 * 1000;
            return new Date(r.created_at).getTime() >= cutoff;
        });

    const rangeLabel = useMemo(() => {
        if (filteredReports.length === 0) return selectedRange.label;
        const dates = filteredReports.map((r) => new Date(r.created_at).getTime());
        const min = new Date(Math.min(...dates));
        const max = new Date(Math.max(...dates));
        const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return min.toDateString() === max.toDateString() ? fmt(min) : `${fmt(min)} - ${fmt(max)}`;
    }, [filteredReports, selectedRange]);

    const total = filteredReports.length;
    const completed = filteredReports.filter((r) => r.processing_status === "COMPLETED").length;
    const processing = filteredReports.filter((r) => IN_PROGRESS_STATUSES.includes(r.processing_status)).length;
    const failed = filteredReports.filter((r) => r.processing_status === "FAILED").length;

    const pct = (n) => (total === 0 ? "0%" : `${((n / total) * 100).toFixed(1)}%`);

    const statusData = [
        { name: "Completed", value: completed, color: "#22c55e" },
        { name: "Processing", value: processing, color: "#8b5cf6" },
        { name: "Failed", value: failed, color: "#f87171" }
    ].filter((d) => d.value > 0);

    const dailySeries = useMemo(() => {
        const byDay = {};
        filteredReports
            .filter((r) => r.processing_status === "COMPLETED")
            .forEach((r) => {
                const key = dayKey(r.created_at);
                if (!byDay[key]) byDay[key] = { confidence: [], customer: [], agent: [] };
                if (typeof r.confidence_score === "number") byDay[key].confidence.push(r.confidence_score);
                if (typeof r.customer_score === "number") byDay[key].customer.push(r.customer_score);
                if (typeof r.agent_score === "number") byDay[key].agent.push(r.agent_score);
            });

        const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

        return Object.keys(byDay)
            .sort()
            .map((key) => ({
                date: dayLabel(key),
                confidence: avg(byDay[key].confidence),
                customer: avg(byDay[key].customer),
                agent: avg(byDay[key].agent)
            }));
    }, [filteredReports]);

    return (

        <DashboardLayout title="My Reports">

            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900">
                        My{" "}
                        <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                            Reports
                        </span>
                    </h1>
                    <p className="mt-2 text-slate-500">
                        View, download and manage all your AI generated call analysis reports.
                    </p>
                </div>

                <div className="relative">
                    <FiCalendar className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" size={16} />
                    <select
                        value={range}
                        onChange={(e) => setRange(e.target.value)}
                        className="appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pr-9 pl-10 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-500"
                    >
                        {RANGE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {
                !loading && !error && (
                    <>
                        <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                icon={FiPhoneCall}
                                iconBg="bg-blue-100"
                                iconColor="text-blue-600"
                                label="Total Calls"
                                value={total}
                                sub={rangeLabel}
                            />
                            <StatCard
                                icon={FiShield}
                                iconBg="bg-green-100"
                                iconColor="text-green-600"
                                label="Completed Reports"
                                value={completed}
                                sub={`${pct(completed)} of total`}
                            />
                            <StatCard
                                icon={FiLoader}
                                iconBg="bg-violet-100"
                                iconColor="text-violet-600"
                                label="Processing"
                                value={processing}
                                sub={`${pct(processing)} of total`}
                            />
                            <StatCard
                                icon={FiAlertTriangle}
                                iconBg="bg-red-100"
                                iconColor="text-red-600"
                                label="Failed Reports"
                                value={failed}
                                sub={`${pct(failed)} of total`}
                            />
                        </div>

                        {
                            total > 0 && (
                                <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
                                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                                        <h2 className="text-base font-bold text-slate-900">Report Status</h2>
                                        <div className="mt-2 flex items-center gap-4">
                                            <div className="relative h-36 w-36 shrink-0">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={statusData}
                                                            dataKey="value"
                                                            innerRadius={42}
                                                            outerRadius={64}
                                                            paddingAngle={statusData.length > 1 ? 3 : 0}
                                                        >
                                                            {statusData.map((entry) => (
                                                                <Cell key={entry.name} fill={entry.color} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                                    <span className="text-xl font-bold text-slate-900">{total}</span>
                                                    <span className="text-[10px] text-slate-400">Total</span>
                                                </div>
                                            </div>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                                                    <span className="text-slate-600">Completed</span>
                                                    <span className="font-semibold text-slate-800">{completed} ({pct(completed)})</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                                                    <span className="text-slate-600">Processing</span>
                                                    <span className="font-semibold text-slate-800">{processing} ({pct(processing)})</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f87171" }} />
                                                    <span className="text-slate-600">Failed</span>
                                                    <span className="font-semibold text-slate-800">{failed} ({pct(failed)})</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                                        <h2 className="text-base font-bold text-slate-900">Confidence Score Trend</h2>
                                        {dailySeries.length === 0 ? (
                                            <p className="mt-8 text-center text-sm text-slate-400">
                                                No completed reports in this range yet.
                                            </p>
                                        ) : (
                                            <div className="mt-2 h-48">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={dailySeries}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                                        <Tooltip />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="confidence"
                                                            name="Confidence"
                                                            stroke="#3b82f6"
                                                            strokeWidth={2.5}
                                                            dot={{ r: 3 }}
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </div>

                                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                                        <h2 className="text-base font-bold text-slate-900">Average Ratings</h2>
                                        {dailySeries.length === 0 ? (
                                            <p className="mt-8 text-center text-sm text-slate-400">
                                                No completed reports in this range yet.
                                            </p>
                                        ) : (
                                            <div className="mt-2 h-48">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={dailySeries}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                                        <Tooltip />
                                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                                        <Bar dataKey="customer" name="Customer" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                                        <Bar dataKey="agent" name="Agent" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        }
                    </>
                )
            }

            {
                loading && (
                    <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
                        <p className="text-lg font-medium text-slate-600">
                            Loading reports...
                        </p>
                    </div>
                )
            }

            {
                error && (
                    <div className="rounded-2xl bg-red-100 p-6 text-red-700">
                        {error}
                    </div>
                )
            }

            {
                !loading && !error && (
                    <ReportTable
                        reports={filteredReports}
                        onRefresh={loadReports}
                    />
                )
            }

        </DashboardLayout>

    );

}
