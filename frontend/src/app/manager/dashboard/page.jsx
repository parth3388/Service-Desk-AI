"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    LabelList,
    PieChart,
    Pie,
    ResponsiveContainer
} from "recharts";
import { deleteCompanyReport } from "../../../services/managerService";
import DashboardLayout from "../../../components/DashboardLayout";
import StatCard from "../../../components/StatCard";
import RecentCallsTable from "../../../components/RecentCallsTable";

import {
    FiUsers,
    FiPhone,
    FiAward,
    FiSmile,
    FiUserCheck,
    FiCpu,
    FiFileText,
    FiUploadCloud
} from "react-icons/fi";
import { MdEmojiEvents } from "react-icons/md";

import {
    getManagerDashboard
} from "../../../services/managerService";

// Re-visualizes the same three averages already shown in the stat cards
// above (Confidence / Customer / Agent) as a bar chart, plus their mean as
// a composite ring — no new or fabricated numbers, just another view of
// the same real statistics.
function ScoreOverview({ statistics }) {
    const scores = [
        { name: "Confidence", value: statistics.average_confidence_score || 0, color: "#3b82f6" },
        { name: "Customer", value: statistics.average_customer_score || 0, color: "#f97316" },
        { name: "Agent", value: statistics.average_agent_score || 0, color: "#ec4899" }
    ];

    const compositeExact =
        scores.reduce((sum, s) => sum + s.value, 0) / scores.length;
    const composite = compositeExact.toFixed(2);

    const ringData = [
        { name: "score", value: compositeExact },
        { name: "rest", value: Math.max(0, 100 - compositeExact) }
    ];

    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Score Overview</h2>
            <p className="text-sm text-slate-500">Average scores across all calls</p>

            <div className="mt-4 flex items-center gap-4">
                <div className="h-40 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={scores} margin={{ top: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                            <Tooltip />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {scores.map((s) => (
                                    <Cell key={s.name} fill={s.color} />
                                ))}
                                <LabelList
                                    dataKey="value"
                                    position="top"
                                    formatter={(v) => Number(v).toFixed(2)}
                                    style={{ fontSize: 12, fontWeight: 700, fill: "#334155" }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="relative h-28 w-28 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={ringData}
                                dataKey="value"
                                innerRadius={34}
                                outerRadius={48}
                                startAngle={90}
                                endAngle={-270}
                            >
                                <Cell fill="#8b5cf6" />
                                <Cell fill="#f1f5f9" />
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-base font-bold text-slate-900">{composite}</span>
                        <span className="text-[9px] text-slate-400">Overall</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ManagerDashboardPage() {

    const [dashboard, setDashboard] = useState(null);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    const loadDashboard = useCallback(async () => {

        try {

            const data = await getManagerDashboard();

            setDashboard(data);

        }

        catch (error) {

            console.error(error);

            setError(

                error.response?.data?.detail ||

                "Unable to load dashboard."

            );

        }

        finally {

            setLoading(false);

        }

    }, []);

    useEffect(() => {

        async function run() {
            await loadDashboard();
        }

        run();

    }, [loadDashboard]);

    if (loading) {

        return (

            <div className="flex h-screen items-center justify-center bg-slate-100">

                <div className="text-xl font-semibold">

                    Loading Manager Dashboard...

                </div>

            </div>

        );

    }

    if (error) {

        return (

            <div className="flex h-screen items-center justify-center bg-slate-100">

                <div className="rounded-xl bg-red-100 p-6 text-red-700">

                    {error}

                </div>

            </div>

        );

    }

    const firstName =
        dashboard.manager?.full_name?.split(" ")[0] || "there";

    return (

        <DashboardLayout

            title="Service Desk AI"

            user={dashboard.manager}

        >

            {/* Full-bleed hero — light theme matching the employee dashboard,

                gradient icon + "Hi, [name]" heading instead of the blue banner. */}

            <div className="relative -mx-8 -mt-8 overflow-hidden px-8 py-14">

                <div className="absolute -top-16 -left-10 h-64 w-64 rounded-full bg-blue-200/30 blur-3xl" />
                <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-violet-200/30 blur-3xl" />

                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg">

                    <FiCpu size={22} />

                </div>

                <h1 className="mt-5 text-3xl font-bold leading-snug md:text-4xl">

                    Hi, {" "}

                    <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">

                        {firstName}
                    </span>

                    <br />

                    Welcome to{" "}

                    <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">

                        Service Desk AI
                    </span>

                </h1>

                <p className="mt-3 max-w-2xl text-slate-500">

                    Track your team&apos;s call quality at a glance, with
                    AI-driven sentiment analysis and performance scoring
                    across every employee.

                </p>

                <div className="mt-6 flex flex-wrap gap-3">

                    <Link

                        href="/manager/reports"

                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:opacity-90"

                    >

                        <FiFileText size={18} />

                        View All Reports

                    </Link>

                    <Link

                        href="/manager/employees"

                        className="flex items-center gap-2 rounded-xl border-2 border-violet-200 bg-white px-6 py-3 font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"

                    >

                        <FiUsers size={18} />

                        Manage Employees

                    </Link>
                    <Link
                        href="/manager/generate-report"
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:opacity-90"
                    >
                        <FiUploadCloud size={18} />
                        Generate Report
                    </Link>

                </div>

                <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-5">

                    <StatCard

                        title="Total Calls"

                        value={dashboard.statistics.total_calls}

                        icon={<FiPhone />}

                        color="blue"

                    />

                    <StatCard

                        title="Employees"

                        value={dashboard.statistics.total_employees}

                        icon={<FiUsers />}

                        color="green"

                    />

                    <StatCard

                        title="Confidence Score"

                        value={dashboard.statistics.average_confidence_score}

                        icon={<FiAward />}

                        color="purple"

                    />

                    <StatCard

                        title="Customer Score"

                        value={dashboard.statistics.average_customer_score}

                        icon={<FiSmile />}

                        color="orange"

                    />

                    <StatCard

                        title="Agent Score"

                        value={dashboard.statistics.average_agent_score}

                        icon={<FiUserCheck />}

                        color="red"

                    />

                </div>

                <div className="mt-8 grid gap-6 lg:grid-cols-2">

                    {
                        dashboard.top_performer && (

                            <div className="relative overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-6 shadow-sm">

                                <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-amber-200/40 blur-2xl" />

                                <div className="relative flex items-center gap-3">

                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg">
                                        <MdEmojiEvents className="text-xl" />
                                    </span>

                                    <div>

                                        <h2 className="text-xl font-bold text-slate-900">

                                            Top Performer

                                        </h2>

                                        <p className="text-sm text-slate-500">

                                            Highest Confidence Score

                                        </p>

                                    </div>

                                </div>

                                <div className="relative mt-6 flex items-center justify-between rounded-xl bg-white/70 p-4">

                                    <div>

                                        <p className="text-lg font-bold text-slate-800">

                                            {

                                                dashboard.top_performer.employee_name

                                            }

                                        </p>

                                        <p className="text-sm text-slate-500">

                                            Employee ID: {

                                                dashboard.top_performer.employee_id

                                            }

                                        </p>

                                    </div>

                                    <div className="rounded-xl bg-green-100 px-5 py-2.5 text-xl font-bold text-green-700">

                                        {

                                            dashboard.top_performer.average_confidence_score

                                        }

                                    </div>

                                </div>

                            </div>

                        )
                    }

                    <ScoreOverview statistics={dashboard.statistics} />

                </div>

                <div className="mt-8">

                    <RecentCallsTable

                        calls={dashboard.recent_calls}

                        showEmployee={false}

                        onDelete={deleteCompanyReport}

                        onRefresh={loadDashboard}

                    />

                </div>

            </div>



        </DashboardLayout>

    );

}