"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const data = [
  { day: "Mon", calls: 12 },
  { day: "Tue", calls: 19 },
  { day: "Wed", calls: 15 },
  { day: "Thu", calls: 24 },
  { day: "Fri", calls: 18 },
  { day: "Sat", calls: 30 },
];

export default function AnalyticsPage() {
  return (
    <DashboardLayout>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900">
          Analytics
        </h1>

        <p className="mt-2 text-slate-600">
          AI Service Desk performance insights.
        </p>
      </div>

      {/* KPI Cards */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm">
            Total Calls
          </p>

          <h2 className="text-3xl font-bold mt-2">
            248
          </h2>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm">
            Reports Generated
          </p>

          <h2 className="text-3xl font-bold mt-2 text-blue-600">
            248
          </h2>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm">
            Avg Quality Score
          </p>

          <h2 className="text-3xl font-bold mt-2 text-green-600">
            91%
          </h2>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm">
            Success Rate
          </p>

          <h2 className="text-3xl font-bold mt-2 text-purple-600">
            96%
          </h2>
        </div>

      </div>

      {/* Graph */}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">

        <h2 className="text-xl font-semibold mb-6">
          Call Volume Trend
        </h2>

        <div className="h-96">

          <ResponsiveContainer width="100%" height="100%">

            <LineChart data={data}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="day" />

              <YAxis />

              <Tooltip />

              <Line
                type="monotone"
                dataKey="calls"
                stroke="#2563eb"
                strokeWidth={3}
              />

            </LineChart>

          </ResponsiveContainer>

        </div>

      </div>

    </DashboardLayout>
  );
}