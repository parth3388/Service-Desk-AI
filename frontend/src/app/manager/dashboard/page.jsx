"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
    FiStar,
    FiCpu,
    FiFileText,
    FiAlertTriangle,
    FiUploadCloud
} from "react-icons/fi";

import {
    getManagerDashboard
} from "../../../services/managerService";

export default function ManagerDashboardPage() {

    const [dashboard, setDashboard] = useState(null);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    useEffect(() => {

        loadDashboard();

    }, []);

    const loadDashboard = async () => {

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

    };

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

            <div className="-mx-8 -mt-8 px-8 py-14">

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg">

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

                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-700"

                    >

                        <FiFileText size={18} />

                        View All Reports

                    </Link>

                    <Link

                        href="/manager/employees"

                        className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"

                    >

                        <FiUsers size={18} />

                        Manage Employees

                    </Link>
                    <Link
                        href="/manager/generate-report" 
                        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-emerald-700"
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

                {

                    dashboard.top_performer && (

                        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

                            <div className="flex items-center gap-3">

                                <FiStar className="text-3xl text-yellow-500" />

                                <div>

                                    <h2 className="text-2xl font-bold text-slate-900">

                                        Top Performer

                                    </h2>

                                    <p className="text-slate-500">

                                        Highest Confidence Score

                                    </p>

                                </div>

                            </div>

                            <div className="mt-6 flex items-center justify-between">

                                <div>

                                    <p className="text-lg font-semibold text-slate-800">

                                        {

                                            dashboard.top_performer.employee_name

                                        }

                                    </p>

                                    <p className="text-slate-500">

                                        Employee ID :

                                        {

                                            dashboard.top_performer.employee_id

                                        }

                                    </p>

                                </div>

                                <div className="rounded-xl bg-green-100 px-6 py-3 text-2xl font-bold text-green-700">

                                    {

                                        dashboard.top_performer.average_confidence_score

                                    }

                                </div>

                            </div>

                        </div>

                    )

                }

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