"use client";

import { useCallback, useEffect, useState } from "react";
import {
    FiFileText,
    FiCheckCircle,
    FiLoader,
    FiAlertTriangle,
    FiTrendingUp
} from "react-icons/fi";

import DashboardLayout from "../../../components/DashboardLayout";
import StatCard from "../../../components/StatCard";
import CompanyReportsTable from "../../../components/CompanyReportsTable";

import { getCompanyReports } from "../../../services/managerService";

const IN_PROGRESS_STATUSES = ["UPLOADING", "TRANSCRIBING", "AI_ANALYZING", "GENERATING_REPORT"];

// Decorative, illustrative-only composition matching the rest of the app's
// visual language — not a chart of real data (the real numbers are in the
// KPI cards and table below).
function ReportsIllustration() {
    return (
        <div className="relative mx-auto hidden h-36 w-36 shrink-0 items-center justify-center lg:flex">
            <div className="absolute inset-0 rounded-full bg-white/30 blur-xl" />
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white/80 shadow-lg backdrop-blur-sm">
                <FiFileText className="text-4xl text-blue-600" />
            </div>
            <div className="absolute -right-3 -bottom-1 flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 shadow-lg">
                <FiTrendingUp className="text-violet-600" size={16} />
                <span className="text-xs font-bold text-slate-700">Live</span>
            </div>
        </div>
    );
}

export default function CompanyReportsPage() {

    const [reports, setReports] = useState([]);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    const loadReports = useCallback(async () => {

        try {

            const response = await getCompanyReports();

            setReports(response.reports || []);

        }

        catch (error) {

            console.error(error);

            setError(

                error.response?.data?.detail ||

                "Unable to load company reports."

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

    if (loading) {

        return (

            <div className="flex h-screen items-center justify-center">

                <h2 className="text-2xl font-semibold">

                    Loading Reports...

                </h2>

            </div>

        );

    }

    if (error) {

        return (

            <div className="flex h-screen items-center justify-center">

                <div className="rounded-xl bg-red-100 p-6 text-red-700">

                    {error}

                </div>

            </div>

        );

    }

    const total = reports.length;
    const completed = reports.filter((r) => r.processing_status === "COMPLETED").length;
    const processing = reports.filter((r) => IN_PROGRESS_STATUSES.includes(r.processing_status)).length;
    const failed = reports.filter((r) => r.processing_status === "FAILED").length;

    return (

        <DashboardLayout
            title="Company Reports"
        >

            {/* Hero */}
            <div className="relative -mx-8 -mt-8 overflow-hidden px-8 py-10">

                <div className="absolute -top-16 -left-10 h-64 w-64 rounded-full bg-blue-200/30 blur-3xl" />
                <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-violet-200/30 blur-3xl" />

                <div className="relative flex flex-col items-center justify-between gap-6 lg:flex-row">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                <FiFileText size={20} />
                            </span>
                            <h1 className="text-3xl font-extrabold text-slate-900 md:text-4xl">
                                Company{" "}
                                <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                                    Reports
                                </span>
                            </h1>
                        </div>
                        <p className="mt-3 max-w-xl text-slate-600">
                            Every AI call analysis report generated across
                            the organization, in one place.
                        </p>
                    </div>

                    <ReportsIllustration />
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">

                <StatCard
                    title="Total Reports"
                    value={total}
                    icon={<FiFileText />}
                    color="blue"
                />

                <StatCard
                    title="Completed"
                    value={completed}
                    icon={<FiCheckCircle />}
                    color="green"
                />

                <StatCard
                    title="Processing"
                    value={processing}
                    icon={<FiLoader />}
                    color="purple"
                />

                <StatCard
                    title="Failed"
                    value={failed}
                    icon={<FiAlertTriangle />}
                    color="red"
                />

            </div>

            <div className="mt-6">
                <CompanyReportsTable

                    reports={reports}

                    onRefresh={loadReports}

                />
            </div>

        </DashboardLayout>

    );

}
