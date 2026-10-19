"use client";

import { useEffect, useState } from "react";
import {
    FiUser,
    FiMail,
    FiShield,
    FiCalendar,
    FiUploadCloud,
    FiFileText,
    FiClock,
    FiUsers,
    FiTrendingUp
} from "react-icons/fi";

import DashboardLayout from "../../components/DashboardLayout";
import { getProfile } from "../../services/authService";
import { getMyReports, getAudioLibrary } from "../../services/employeeService";
import { getManagerDashboard } from "../../services/managerService";

function InfoRow({ icon: Icon, label, value }) {
    return (
        <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon size={18} />
            </span>
            <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                    {label}
                </p>
                <p className="mt-0.5 truncate text-lg font-semibold text-slate-900">
                    {value || "—"}
                </p>
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value }) {
    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className={iconColor} size={18} />
                </span>
                <p className="text-sm font-medium text-slate-500">{label}</p>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
        </div>
    );
}

const formatRelative = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 30) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function ProfilePage() {
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function load() {
            try {
                setLoading(true);

                const profileData = await getProfile();
                const loadedProfile = profileData.user;
                setProfile(loadedProfile);

                if (loadedProfile.role === "manager") {
                    const dashboard = await getManagerDashboard();
                    setStats({
                        role: "manager",
                        totalCalls: dashboard.statistics?.total_calls ?? 0,
                        totalEmployees: dashboard.statistics?.total_employees ?? 0,
                        lastActivity: dashboard.recent_calls?.[0]?.created_at || null
                    });
                } else {
                    const [reportsData, libraryData] = await Promise.all([
                        getMyReports(),
                        getAudioLibrary(false)
                    ]);

                    const reports = reportsData.reports || [];
                    const files = libraryData.files || [];
                    const completed = reports.filter((r) => r.processing_status === "COMPLETED").length;
                    const mostRecent = [...files, ...reports]
                        .map((r) => r.created_at)
                        .filter(Boolean)
                        .sort()
                        .pop();

                    setStats({
                        role: "employee",
                        totalUploads: files.length,
                        reportsGenerated: completed,
                        lastActivity: mostRecent || null
                    });
                }
            } catch (err) {
                console.error(err);
                setError(
                    err.response?.data?.detail ||
                    "Unable to load profile."
                );
            } finally {
                setLoading(false);
            }
        }

        load();
    }, []);

    if (loading) {
        return (
            <DashboardLayout title="Profile">
                <div className="flex h-96 items-center justify-center">
                    <p className="text-lg font-medium text-slate-600">Loading profile...</p>
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return (
            <DashboardLayout title="Profile">
                <div className="rounded-2xl bg-red-100 p-6 text-red-700">{error}</div>
            </DashboardLayout>
        );
    }

    const initials = profile?.full_name
        ? profile.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
        : "?";

    return (
        <DashboardLayout title="Profile">

            {/* Header */}
            <div className="relative overflow-hidden rounded-3xl border border-white bg-gradient-to-br from-blue-50 via-white to-violet-50 p-6 sm:p-8">
                <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-2xl font-bold text-white shadow-lg">
                        {initials}
                    </span>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                            {profile?.full_name}
                        </h1>
                        <p className="mt-1 text-slate-500">{profile?.email}</p>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold tracking-wide text-violet-700 capitalize">
                                <FiShield size={12} />
                                {profile?.role}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                                <FiCalendar size={12} />
                                Member since {formatRelative(profile?.created_at) === "Today" ? "today" : new Date(profile?.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">

                {/* Personal Information */}
                <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm lg:col-span-2">
                    <h2 className="text-xl font-bold text-slate-900">
                        Personal Information
                    </h2>

                    <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <InfoRow icon={FiUser} label="Full Name" value={profile?.full_name} />
                        <InfoRow icon={FiMail} label="Email Address" value={profile?.email} />
                        <InfoRow
                            icon={FiShield}
                            label="Role"
                            value={profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : null}
                        />
                        <InfoRow
                            icon={FiCalendar}
                            label="Member Since"
                            value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null}
                        />
                    </div>
                </div>

                {/* Stats */}
                <div className="space-y-6">
                    {
                        stats?.role === "manager" ? (
                            <>
                                <StatCard
                                    icon={FiTrendingUp}
                                    iconBg="bg-blue-100"
                                    iconColor="text-blue-600"
                                    label="Company Calls Analyzed"
                                    value={stats.totalCalls}
                                />
                                <StatCard
                                    icon={FiUsers}
                                    iconBg="bg-violet-100"
                                    iconColor="text-violet-600"
                                    label="Team Members"
                                    value={stats.totalEmployees}
                                />
                                <StatCard
                                    icon={FiClock}
                                    iconBg="bg-emerald-100"
                                    iconColor="text-emerald-600"
                                    label="Last Team Activity"
                                    value={formatRelative(stats.lastActivity)}
                                />
                            </>
                        ) : (
                            <>
                                <StatCard
                                    icon={FiUploadCloud}
                                    iconBg="bg-blue-100"
                                    iconColor="text-blue-600"
                                    label="Total Uploads"
                                    value={stats?.totalUploads ?? 0}
                                />
                                <StatCard
                                    icon={FiFileText}
                                    iconBg="bg-violet-100"
                                    iconColor="text-violet-600"
                                    label="Reports Generated"
                                    value={stats?.reportsGenerated ?? 0}
                                />
                                <StatCard
                                    icon={FiClock}
                                    iconBg="bg-emerald-100"
                                    iconColor="text-emerald-600"
                                    label="Last Activity"
                                    value={formatRelative(stats?.lastActivity)}
                                />
                            </>
                        )
                    }
                </div>
            </div>

        </DashboardLayout>
    );
}
