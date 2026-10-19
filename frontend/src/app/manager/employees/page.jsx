"use client";

import { useCallback, useEffect, useState } from "react";
import {
    FiBarChart2,
    FiUsers,
    FiPhone,
    FiAward,
    FiSmile,
    FiUserCheck,
    FiTrendingUp
} from "react-icons/fi";

import DashboardLayout from "../../../components/DashboardLayout";
import StatCard from "../../../components/StatCard";
import EmployeePerformanceTable from "../../../components/EmployeePerformanceTable";

import { getEmployees, deleteEmployee } from "../../../services/managerService";

// Decorative, illustrative-only composition matching the rest of the app's
// visual language — not a chart of real data (the real numbers are in the
// KPI cards and table below).
function PerformanceIllustration() {
    return (
        <div className="relative mx-auto hidden h-40 w-40 shrink-0 items-center justify-center lg:flex">
            <div className="absolute inset-0 rounded-full bg-white/30 blur-xl" />
            <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-white/80 shadow-lg backdrop-blur-sm">
                <FiUsers className="text-5xl text-blue-600" />
            </div>
            <div className="absolute -right-2 bottom-2 flex items-end gap-1 rounded-2xl bg-white px-3 py-2.5 shadow-lg">
                <span className="w-2 rounded-full bg-blue-400" style={{ height: 14 }} />
                <span className="w-2 rounded-full bg-violet-400" style={{ height: 24 }} />
                <span className="w-2 rounded-full bg-blue-500" style={{ height: 34 }} />
                <span className="w-2 rounded-full bg-violet-500" style={{ height: 20 }} />
            </div>
        </div>
    );
}

export default function EmployeePerformancePage() {

    const [employees, setEmployees] = useState([]);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    const loadEmployees = useCallback(async () => {

        try {

            const response = await getEmployees();

            setEmployees(
                response.employees || []
            );

        }

        catch (error) {

            console.error(error);

            setError(

                error.response?.data?.detail ||

                "Unable to load employee performance."

            );

        }

        finally {

            setLoading(false);

        }

    }, []);

    useEffect(() => {

        async function run() {
            await loadEmployees();
        }

        run();

    }, [loadEmployees]);

    const handleDeleteEmployee = async (employeeId) => {

        try {

            await deleteEmployee(employeeId);

            await loadEmployees();

        }

        catch (error) {

            console.error(error);

            alert(

                error.response?.data?.detail ||

                "Unable to delete employee."

            );

        }

    };

    if (loading) {

        return (

            <div className="flex h-screen items-center justify-center">

                <h2 className="text-2xl font-semibold">

                    Loading Employee Performance...

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

    const average = (values) => {
        if (values.length === 0) return 0;
        const sum = values.reduce((a, b) => a + b, 0);
        return Math.round((sum / values.length) * 100) / 100;
    };

    const totalCalls = employees.reduce((sum, e) => sum + (e.total_calls || 0), 0);
    const avgConfidence = average(employees.map((e) => e.average_confidence_score || 0));
    const avgCustomer = average(employees.map((e) => e.average_customer_score || 0));
    const avgAgent = average(employees.map((e) => e.average_agent_score || 0));

    return (

        <DashboardLayout
            title="Employee Performance"
        >

            {/* Hero */}
            <div className="relative -mx-8 -mt-8 overflow-hidden px-8 py-10">

                <div className="absolute -top-16 -left-10 h-64 w-64 rounded-full bg-blue-200/30 blur-3xl" />
                <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-violet-200/30 blur-3xl" />

                <div className="relative flex flex-col items-center justify-between gap-6 lg:flex-row">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                <FiBarChart2 size={20} />
                            </span>
                            <h1 className="text-3xl font-extrabold text-slate-900 md:text-4xl">
                                Employee{" "}
                                <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                                    Performance
                                </span>
                            </h1>
                        </div>
                        <p className="mt-3 max-w-xl text-slate-600">
                            Review AI-scored confidence, customer, and agent
                            performance across your team, and manage employee
                            access.
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-6">
                        <PerformanceIllustration />
                        <div className="hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:block">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <FiTrendingUp className="text-violet-600" />
                                Track Performance
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                                Build Better Teams
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">

                <StatCard
                    title="Total Employees"
                    value={employees.length}
                    icon={<FiUsers />}
                    color="blue"
                />

                <StatCard
                    title="Total Calls"
                    value={totalCalls}
                    icon={<FiPhone />}
                    color="green"
                />

                <StatCard
                    title="Avg. Confidence"
                    value={avgConfidence}
                    icon={<FiAward />}
                    color="purple"
                />

                <StatCard
                    title="Avg. Customer Score"
                    value={avgCustomer}
                    icon={<FiSmile />}
                    color="orange"
                />

                <StatCard
                    title="Avg. Agent Score"
                    value={avgAgent}
                    icon={<FiUserCheck />}
                    color="red"
                />

            </div>

            <div className="mt-6">
                <EmployeePerformanceTable

                    employees={employees}

                    onDelete={handleDeleteEmployee}

                />
            </div>

        </DashboardLayout>

    );

}
