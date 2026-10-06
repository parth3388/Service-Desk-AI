"use client";

import { useEffect, useState } from "react";

import DashboardLayout from "../../../components/DashboardLayout";
import ReportTable from "../../../components/ReportTable";

import { getMyReports } from "../../../services/employeeService";

const pickNumber = (report, keys) => {

    for (const key of keys) {

        const value = report?.[key];

        if (typeof value === "number" && !Number.isNaN(value)) {

            return value;

        }

    }

    return null;

};

const average = (values) => {

    if (values.length === 0) return null;

    const sum = values.reduce((total, value) => total + value, 0);

    return sum / values.length;

};

function SummaryCard({ label, value, suffix = "" }) {

    return (

        <div className="rounded-2xl bg-white p-6 shadow">

            <p className="text-sm font-medium text-slate-500">

                {label}

            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">

                {value === null ? "—" : `${value}${suffix}`}

            </p>

        </div>

    );

}

export default function MyReportsPage() {

    const [reports, setReports] = useState([]);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    useEffect(() => {

        loadReports();

    }, []);

    const loadReports = async () => {

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

    };

    // Table columns are: Confidence, Customer, Agent — matched directly here.
    const confidenceScores = reports

        .map((report) => pickNumber(report, ["confidence_score"]))

        .filter((value) => value !== null);

    const agentRatings = reports

        .map((report) => pickNumber(report, ["agent_score"]))

        .filter((value) => value !== null);

    const avgConfidence = average(confidenceScores);

    const avgAgentRating = average(agentRatings);

    const roundedConfidence = avgConfidence !== null ? avgConfidence.toFixed(1) : null;

    const roundedAgentRating = avgAgentRating !== null ? avgAgentRating.toFixed(1) : null;

    return (

        <DashboardLayout title="My Reports">

            <div className="mb-8">

                
                <p className="mt-2 text-slate-500">

                    View, download and manage all your AI generated call analysis reports.

                </p>

            </div>

            {

                !loading && !error && (

                    <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">

                        <SummaryCard

                            label="Total Calls"

                            value={reports.length}

                        />

                        <SummaryCard

                            label="Average Confidence Score"

                            value={roundedConfidence}

                            suffix="%"

                        />

                        <SummaryCard

                            label="Average Agent Rating"

                            value={roundedAgentRating}

                            suffix="%"

                        />

                    </div>

                )

            }

            {

                loading && (

                    <div className="rounded-2xl bg-white p-10 text-center shadow">

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

                        reports={reports}

                        onRefresh={loadReports}

                    />

                )

            }

        </DashboardLayout>

    );

}