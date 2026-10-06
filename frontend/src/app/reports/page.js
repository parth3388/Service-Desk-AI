"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import api from "@/services/api";
import { useEffect, useState } from "react";

export default function ReportsPage() {

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    async function fetchReports() {

      try {

        const response = await api.get(
          "/report/list"
        );

        setReports(response.data);

      } catch (error) {

        console.error(error);

      } finally {

        setLoading(false);

      }

    }

    fetchReports();

  }, []);

  return (
    <DashboardLayout>

      <div className="mb-8">

        <h1 className="text-4xl font-bold text-slate-900">
          Reports
        </h1>

        <p className="mt-2 text-slate-600">
          View and download generated AI reports.
        </p>

      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        <div className="px-6 py-5 border-b border-slate-200">

          <h2 className="text-xl font-semibold">
            Generated Reports
          </h2>

        </div>

        {loading ? (

          <div className="p-6">
            Loading reports...
          </div>

        ) : reports.length === 0 ? (

          <div className="p-6 text-slate-500">
            No reports found.
          </div>

        ) : (

          <table className="w-full">

            <thead className="bg-slate-50">

              <tr>

                <th className="text-left px-6 py-4">
                  Report Name
                </th>

                <th className="text-left px-6 py-4">
                  Created At
                </th>

                <th className="text-left px-6 py-4">
                  Status
                </th>

                <th className="text-left px-6 py-4">
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {reports.map((report) => (

                <tr
                  key={report.filename}
                  className="border-t border-slate-100"
                >

                  <td className="px-6 py-4">
                    {report.filename}
                  </td>

                  <td className="px-6 py-4">
                    {report.created_at}
                  </td>

                  <td className="px-6 py-4">

                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                      Completed
                    </span>

                  </td>

                  <td className="px-6 py-4">

                    <a
                      href={`http://127.0.0.1:8000/report/download/${report.filename}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                    >
                      Download
                    </a>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        )}

      </div>

    </DashboardLayout>
  );
}