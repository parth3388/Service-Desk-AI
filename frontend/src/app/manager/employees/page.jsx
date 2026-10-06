"use client";

import { useEffect, useState } from "react";

import DashboardLayout from "../../../components/DashboardLayout";
import EmployeePerformanceTable from "../../../components/EmployeePerformanceTable";

import { getEmployees, deleteEmployee } from "../../../services/managerService";

export default function EmployeePerformancePage() {

    const [employees, setEmployees] = useState([]);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");

    useEffect(() => {

        loadEmployees();

    }, []);

    const loadEmployees = async () => {

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

    };

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

    return (

        <DashboardLayout
            title="Employee Performance"
        >

            <EmployeePerformanceTable

                employees={employees}

                onDelete={handleDeleteEmployee}

            />

        </DashboardLayout>

    );

}
