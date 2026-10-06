"use client";

import { useEffect, useState } from "react";

import DashboardLayout from "../../../components/DashboardLayout";
import CompanyReportsTable from "../../../components/CompanyReportsTable";

import { getCompanyReports } from "../../../services/managerService";

export default function CompanyReportsPage() {

    const [reports, setReports] = useState([]);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    useEffect(() => {

        loadReports();

    }, []);

    const loadReports = async () => {

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

    };

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

    return (

        <DashboardLayout
            title="Company Reports"
        >

            <div className="mb-8">

                

                <p className="mt-2 text-slate-500">

                    View all reports generated across the organization.

                </p>

            </div>

            <CompanyReportsTable

                reports={reports}

                onRefresh={loadReports}

            />

        </DashboardLayout>

    );

}