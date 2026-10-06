"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "../../../../components/DashboardLayout";
import CallIllustration from "../../../../components/CallIllustration";
import AutoQaPanel from "../../../../components/AutoQaPanel";
import PiiBanner from "../../../../components/PiiBanner";
import api from "../../../../services/api";
import { getErrorMessage } from "../../../../lib/apiError.mjs";
import { extractManagerReview } from "../../../../lib/managerReview.mjs";
import {
    FiStar,
    FiMessageSquare,
    FiCheckCircle,
    FiClock,
    FiUser,
    FiHeadphones,
    FiAlertTriangle,
    FiShield,
    FiSearch,
    FiPhoneCall,
    FiChevronDown,
    FiAlertCircle,
    FiHeart,
    FiCheckSquare,
    FiThumbsUp,
    FiBarChart2
} from "react-icons/fi";

const SEVERITY_HEIGHT = {
    Critical: 100,
    High: 75,
    Medium: 50,
    Low: 25
};

// severity → colors, shared between the timeline dots and the table badges
const SEVERITY_STYLES = {
    Critical: { dot: "bg-red-600", badge: "bg-red-100 text-red-700" },
    High: { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-700" },
    Medium: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700" },
    Low: { dot: "bg-green-500", badge: "bg-green-100 text-green-700" }
};

const getSeverityStyle = (severity) =>
    SEVERITY_STYLES[severity] || { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600" };

export default function ManagerReportDetails() {

    const { report_id } = useParams();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [report, setReport] = useState(null);
    const [managerReview, setManagerReview] = useState({

        rating: 5,

        decision: "Excellent",

        feedback: "",

        recommendation: ""

    });

    // expand/collapse state for the Customer / Agent Call Insights cards
    const [customerExpanded, setCustomerExpanded] = useState(false);
    const [agentExpanded, setAgentExpanded] = useState(false);

    // flips to true shortly after the report loads, used to trigger width/position
    // CSS transitions (chart bars, sentiment marker) so they animate in instead of
    // just appearing at full value
    const [animateIn, setAnimateIn] = useState(false);

    useEffect(() => {

        async function loadReport() {

            try {

                const response = await api.get(
                    `/manager/report/${report_id}`
                );

                setReport(
                    response.data.report
                );

                // The API returns the saved review NESTED as report.manager_review
                // (not as flat manager_* fields) — see lib/managerReview.mjs.
                const saved = extractManagerReview(response.data.report);

                if (saved.exists) {

                    setManagerReview(saved.review);

                }

            }

            catch (error) {

                console.error(error);

                alert(
                    "Unable to load report."
                );

            }

            finally {

                setLoading(false);

            }

        }

        loadReport();

    }, [report_id]);

    useEffect(() => {

        if (!report) return;

        const timer = setTimeout(() => setAnimateIn(true), 150);

        return () => clearTimeout(timer);

    }, [report]);

    const saveReview = async () => {

        setSaving(true);

        try {

            await api.put(
                `/manager/report/${report_id}/review`,
                managerReview
            );

            alert("Review saved successfully.");

        }

        catch (error) {

            console.error(error);

            alert(getErrorMessage(error, "Unable to save review."));

        }

        finally {

            setSaving(false);

        }

    };

    const downloadPdf = async () => {

        try {

            const response = await api.get(

                `/report/download/${report.id}`,

                {

                    responseType: "blob"

                }

            );

            const url = window.URL.createObjectURL(
                new Blob([response.data])
            );

            const link =
                document.createElement("a");

            link.href = url;

            link.download =
                `${report.original_filename}_Analysis_Report.pdf`;

            document.body.appendChild(link);

            link.click();

            link.remove();

            window.URL.revokeObjectURL(url);

        }

        catch (error) {

            console.error(error);

            alert(
                "Unable to download report."
            );

        }

    };

    if (loading) {

        return (

            <DashboardLayout title="Loading Report">

                <div className="rounded-xl bg-white p-10 shadow">

                    <h2 className="text-2xl font-bold">

                        Loading Report...

                    </h2>

                </div>

            </DashboardLayout>

        );

    }

    if (!report) {

        return (

            <DashboardLayout title="Report">

                <div className="rounded-xl bg-white p-10 shadow">

                    <h2 className="text-2xl font-bold text-red-600">

                        Report Not Found

                    </h2>

                </div>

            </DashboardLayout>

        );

    }

    // report.analysis can be null/undefined if the AI analysis hasn't
    // finished or failed — fall back to {} so every field below can use
    // optional chaining instead of crashing the whole page.
    const analysis = report.analysis || {};

    // overall score out of 10, derived from the three existing scores — no new backend data needed
    const overallOutOf10 = Math.round(
        (
            (report.confidence_score || 0) +
            (report.customer_score || 0) +
            (report.agent_score || 0)
        ) / 3 / 10
    );

    // agent rating out of 10, shown as a badge on the Agent Call Insights card
    const agentRatingOutOf10 = Math.round((report.agent_score || 0) / 10);

    // customer name — only rendered if the backend actually sends it, degrades gracefully otherwise
    const customerName = analysis.customer_name || report.customer_name || null;

    // color-coded overall sentiment tile, driven by the customer score
    const sentimentTone = (() => {

        const score = report.customer_score ?? 0;

        if (score >= 70) {
            return { label: "Positive", gradient: "from-emerald-600 to-emerald-500" };
        }

        if (score >= 40) {
            return { label: "Neutral", gradient: "from-amber-500 to-amber-400" };
        }

        return { label: "Negative", gradient: "from-red-600 to-red-500" };

    })();

    // position of the score marker along the 1–10 bar (0% at value 1, 100% at value 10)
    const markerPercent = Math.min(
        Math.max(((overallOutOf10 - 1) / 9) * 100, 3),
        97
    );

    const scoreBreakdown = [
        { label: "Confidence Score", value: report.confidence_score || 0, color: "#16a34a" },
        { label: "Customer Score", value: report.customer_score || 0, color: "#0ea5e9" },
        { label: "Agent Score", value: report.agent_score || 0, color: "#9333ea" }
    ];

    const moments = analysis.critical_conversation_moments || [];

    return (

        <DashboardLayout
            title="Company Report"
        >

            <style jsx>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(14px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .fade-in-up {
                    animation: fadeInUp 0.6s ease-out both;
                }
            `}</style>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                <div>

                    <h1 className="text-4xl font-bold text-slate-900">

                        AI Call Analysis Report

                    </h1>

                    <p className="mt-2 text-slate-500">

                        Detailed AI generated analysis for customer interaction.

                    </p>

                </div>

                <button

                    onClick={downloadPdf}

                    className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-green-700"

                >

                    Download PDF

                </button>

            </div>

            {/* ============ Call Insights ============ */}

            <div className="mt-8">

                <h2 className="text-2xl font-bold text-slate-800">

                    Call Insights

                </h2>

                <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-4">

                    {/* Card 1: call file + employee */}

                    <div
                        className="fade-in-up rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 p-6 text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                        style={{ animationDelay: "0s" }}
                    >

                        <FiPhoneCall size={22} className="opacity-90" />

                        <p className="mt-4 truncate text-lg font-bold">

                            {report.original_filename}

                        </p>

                        <div className="mt-3 space-y-1.5 text-sm text-blue-100">

                            <p className="flex items-center gap-1.5">
                                <FiHeadphones size={13} /> Employee ID: {report.employee_id}
                            </p>

                            {customerName && (
                                <p className="flex items-center gap-1.5">
                                    <FiUser size={13} /> Customer: {customerName}
                                </p>
                            )}

                        </div>

                    </div>

                    {/* Card 2: color-coded overall sentiment */}

                    <div
                        className={`fade-in-up rounded-2xl bg-gradient-to-br ${sentimentTone.gradient} p-6 text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
                        style={{ animationDelay: "0.08s" }}
                    >

                        <FiUser size={22} className="opacity-90" />

                        <h2 className="mt-4 text-3xl font-bold">

                            {sentimentTone.label}

                        </h2>

                        <p className="mt-2 text-sm opacity-90">

                            Overall Sentiment

                        </p>

                    </div>

                    {/* Card 3: sentiment score out of 10 */}

                    <div
                        className="fade-in-up rounded-2xl bg-gradient-to-br from-purple-600 to-purple-500 p-6 text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                        style={{ animationDelay: "0.16s" }}
                    >

                        <FiStar size={22} className="opacity-90" />

                        <h2 className="mt-4 text-3xl font-bold">

                            {overallOutOf10}/10

                        </h2>

                        <p className="mt-2 text-sm opacity-90">

                            Sentiment Score

                        </p>

                    </div>

                    {/* Card 4: sentiment gradient bar with a marker showing exactly where the score sits */}

                    <div
                        className="fade-in-up rounded-2xl bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                        style={{ animationDelay: "0.24s" }}
                    >

                        <h3 className="text-sm font-bold text-slate-800">

                            Overall Sentiment Score

                        </h3>

                        <div className="relative mt-9">

                            <div
                                className="absolute -top-7 flex -translate-x-1/2 flex-col items-center transition-all duration-700 ease-out"
                                style={{ left: animateIn ? `${markerPercent}%` : "3%" }}
                            >

                                <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    {overallOutOf10}
                                </span>

                                <div className="mt-0.5 h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900" />

                            </div>

                            <div
                                className="h-2.5 w-full rounded-full"
                                style={{ background: "linear-gradient(to right, #7c3aed, #0ea5e9, #10b981)" }}
                            />

                        </div>

                        <div className="mt-2 flex justify-between text-[10px] text-slate-400">

                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                <span key={n}>{n}</span>
                            ))}

                        </div>

                    </div>

                </div>

                {/* Call summary card with illustration */}

                <div
                    className="fade-in-up mt-6 grid grid-cols-1 gap-8 rounded-2xl bg-white p-8 shadow-lg transition-all duration-300 hover:shadow-xl lg:grid-cols-[1fr_auto] lg:items-center"
                    style={{ animationDelay: "0.3s" }}
                >

                    <div>

                        <h2 className="text-xl font-bold text-slate-800">

                            Call Summary

                        </h2>

                        <p className="mt-4 leading-7 text-slate-600">

                            {analysis.executive_summary || "No summary available."}

                        </p>

                    </div>

                    <div className="hidden shrink-0 scale-75 justify-center lg:flex">

                        <CallIllustration mode="summary" />

                    </div>

                </div>

                {/* Customer / Agent call insight cards — expand in place, no page scroll */}

                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">

                    <div
                        className="fade-in-up rounded-2xl bg-white p-6 shadow-lg transition-all duration-300 hover:shadow-xl"
                        style={{ animationDelay: "0.36s" }}
                    >

                        <div className="flex items-center gap-3">

                            <div className="rounded-full bg-green-100 p-2.5 text-green-600">
                                <FiHeadphones size={20} />
                            </div>

                            <h3 className="text-lg font-bold text-green-700">

                                Customer Call Insights

                            </h3>

                        </div>

                        <p className="mt-4 text-sm leading-6 text-slate-600">

                            {
                                analysis.customer_sentiment?.detailed_analysis ||
                                analysis.customer_behavior?.detailed_analysis
                            }

                        </p>

                        <button
                            onClick={() => setCustomerExpanded((prev) => !prev)}
                            className="mt-5 flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
                        >
                            {customerExpanded ? "Hide Details" : "View Details"}

                            <FiChevronDown
                                size={16}
                                className={`transition-transform duration-300 ${customerExpanded ? "rotate-180" : ""}`}
                            />
                        </button>

                        <div
                            className={`grid transition-all duration-500 ease-in-out ${customerExpanded ? "mt-6 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                }`}
                        >

                            <div className="overflow-hidden">

                                <div className="space-y-5 border-t border-slate-100 pt-5 text-sm">

                                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">

                                        <div>
                                            <p className="text-xs text-slate-400">Overall</p>
                                            <p className="font-semibold text-slate-700">{analysis.customer_sentiment?.overall}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Journey</p>
                                            <p className="font-semibold text-slate-700">{analysis.customer_sentiment?.journey}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Confidence</p>
                                            <p className="font-semibold text-slate-700">{analysis.customer_sentiment?.confidence_score}%</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Frustration</p>
                                            <p className="font-semibold text-slate-700">{analysis.customer_behavior?.frustration_level}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Cooperation</p>
                                            <p className="font-semibold text-slate-700">{analysis.customer_behavior?.cooperation_level}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Satisfaction</p>
                                            <p className="font-semibold text-slate-700">{analysis.customer_behavior?.satisfaction_level}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Communication</p>
                                            <p className="font-semibold text-slate-700">{analysis.customer_behavior?.communication_quality}</p>
                                        </div>

                                    </div>

                                    <p className="leading-7 text-slate-600">{analysis.customer_sentiment?.detailed_analysis}</p>

                                    <p className="leading-7 text-slate-600">{analysis.customer_behavior?.detailed_analysis}</p>

                                </div>

                            </div>

                        </div>

                    </div>

                    <div
                        className="fade-in-up relative rounded-2xl bg-white p-6 shadow-lg transition-all duration-300 hover:shadow-xl"
                        style={{ animationDelay: "0.42s" }}
                    >

                        <div className="absolute right-6 top-6 flex items-center gap-1.5 text-xs font-medium text-slate-500">

                            Agent Rating :

                            <span className="rounded bg-blue-600 px-2 py-0.5 font-bold text-white">
                                {agentRatingOutOf10}
                            </span>

                        </div>

                        <div className="flex items-center gap-3">

                            <div className="rounded-full bg-blue-100 p-2.5 text-blue-600">
                                <FiUser size={20} />
                            </div>

                            <h3 className="text-lg font-bold text-blue-700">

                                Agent Call Insights

                            </h3>

                        </div>

                        <p className="mt-4 text-sm leading-6 text-slate-600">

                            {
                                analysis.agent_sentiment?.detailed_analysis ||
                                analysis.agent_behavior?.detailed_analysis
                            }

                        </p>

                        <button
                            onClick={() => setAgentExpanded((prev) => !prev)}
                            className="mt-5 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                        >
                            {agentExpanded ? "Hide Details" : "View Details"}

                            <FiChevronDown
                                size={16}
                                className={`transition-transform duration-300 ${agentExpanded ? "rotate-180" : ""}`}
                            />
                        </button>

                        <div
                            className={`grid transition-all duration-500 ease-in-out ${agentExpanded ? "mt-6 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                }`}
                        >

                            <div className="overflow-hidden">

                                <div className="space-y-5 border-t border-slate-100 pt-5 text-sm">

                                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">

                                        <div>
                                            <p className="text-xs text-slate-400">Overall</p>
                                            <p className="font-semibold text-slate-700">{analysis.agent_sentiment?.overall}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Confidence</p>
                                            <p className="font-semibold text-slate-700">{analysis.agent_sentiment?.confidence_score}%</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Professionalism</p>
                                            <p className="font-semibold text-slate-700">{analysis.agent_behavior?.professionalism}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Empathy</p>
                                            <p className="font-semibold text-slate-700">{analysis.agent_behavior?.empathy}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Resolution Focus</p>
                                            <p className="font-semibold text-slate-700">{analysis.agent_behavior?.resolution_focus}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs text-slate-400">Communication</p>
                                            <p className="font-semibold text-slate-700">{analysis.agent_behavior?.communication_quality}</p>
                                        </div>

                                    </div>

                                    <p className="leading-7 text-slate-600">{analysis.agent_sentiment?.detailed_analysis}</p>

                                    <p className="leading-7 text-slate-600">{analysis.agent_behavior?.detailed_analysis}</p>

                                </div>

                            </div>

                        </div>

                    </div>

                </div>

                {/* Score breakdown chart */}

                <div className="mt-6 rounded-2xl bg-white p-8 shadow-lg transition-all duration-300 hover:shadow-xl">

                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-indigo-100 p-2.5 text-indigo-600"><FiBarChart2 size={20} /></div>
                        <h2 className="text-xl font-bold text-slate-800">Score Breakdown</h2>
                    </div>

                    <div className="mt-6 space-y-5">

                        {scoreBreakdown.map((item) => (

                            <div key={item.label}>

                                <div className="mb-1.5 flex items-center justify-between text-sm">
                                    <span className="font-medium text-slate-600">{item.label}</span>
                                    <span className="font-bold text-slate-800">{item.value}</span>
                                </div>

                                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000 ease-out"
                                        style={{
                                            width: animateIn ? `${item.value}%` : "0%",
                                            backgroundColor: item.color
                                        }}
                                    />
                                </div>

                            </div>

                        ))}

                    </div>

                </div>

            </div>

            <div className="mt-8 rounded-2xl bg-white p-8 shadow transition-all duration-300 hover:shadow-lg">

                <h2 className="text-2xl font-bold">

                    Call Information

                </h2>

                <div className="mt-6 grid grid-cols-2 gap-6">

                    <div>

                        <p className="text-sm text-slate-500">

                            Employee ID

                        </p>

                        <p className="font-semibold">

                            {report.employee_id}

                        </p>

                    </div>

                    <div>

                        <p className="text-sm text-slate-500">

                            Processing Status

                        </p>

                        <p className="font-semibold text-green-600">

                            {report.processing_status}

                        </p>

                    </div>

                    <div>

                        <p className="text-sm text-slate-500">

                            Duration

                        </p>

                        <p className="font-semibold">

                            {report.call_duration} sec

                        </p>

                    </div>

                    <div>

                        <p className="text-sm text-slate-500">

                            Uploaded

                        </p>

                        <p className="font-semibold">

                            {

                                new Date(

                                    report.created_at

                                ).toLocaleString()

                            }

                        </p>

                    </div>

                </div>

            </div>

            <AutoQaPanel reportId={report.id} canOverride />

            {/* Manager Review & Feedback — kept fully editable, just re-skinned to match */}

            <div className="mt-8 rounded-2xl bg-white p-8 shadow transition-all duration-300 hover:shadow-lg">

                <div className="mb-6 flex items-center gap-3">

                    <FiMessageSquare
                        size={28}
                        className="text-blue-600"
                    />

                    <div>

                        <h2 className="text-2xl font-bold">

                            Manager Review & Feedback

                        </h2>

                        <p className="text-slate-500">

                            Internal performance evaluation by manager.

                        </p>

                    </div>

                </div>


                <div className="grid gap-6 lg:grid-cols-2">


                    {/* Rating */}


                    <div>

                        <label className="mb-2 block font-semibold">

                            Overall Rating

                        </label>

                        <div className="flex gap-2">

                            {

                                [1, 2, 3, 4, 5].map((star) => (

                                    <button

                                        key={star}

                                        onClick={() =>

                                            setManagerReview({

                                                ...managerReview,

                                                rating: star

                                            })

                                        }

                                    >

                                        <FiStar

                                            size={28}

                                            className={

                                                star <= managerReview.rating

                                                    ?

                                                    "fill-yellow-400 text-yellow-400"

                                                    :

                                                    "text-slate-300"

                                            }

                                        />

                                    </button>

                                ))

                            }

                        </div>

                    </div>


                    {/* Decision */}


                    <div>

                        <label className="mb-2 block font-semibold">

                            Performance Decision

                        </label>

                        <select

                            value={managerReview.decision}

                            onChange={(e) =>

                                setManagerReview({

                                    ...managerReview,

                                    decision: e.target.value

                                })

                            }

                            className="w-full rounded-xl border p-3"

                        >

                            <option>

                                Excellent

                            </option>

                            <option>

                                Good

                            </option>

                            <option>

                                Satisfactory

                            </option>

                            <option>

                                Needs Improvement

                            </option>

                        </select>

                    </div>

                </div>



                {/* Feedback */}


                <div className="mt-6">

                    <label className="mb-2 block font-semibold">

                        Manager Feedback

                    </label>

                    <textarea

                        rows={5}

                        value={managerReview.feedback}

                        onChange={(e) =>

                            setManagerReview({

                                ...managerReview,

                                feedback: e.target.value

                            })

                        }

                        className="w-full rounded-xl border p-4"

                    />

                </div>



                {/* Recommendation */}


                <div className="mt-6">

                    <label className="mb-2 block font-semibold">

                        Recommendation

                    </label>

                    <textarea

                        rows={4}

                        value={managerReview.recommendation}

                        onChange={(e) =>

                            setManagerReview({

                                ...managerReview,

                                recommendation: e.target.value

                            })

                        }

                        className="w-full rounded-xl border p-4"

                    />

                </div>



                {/* Button */}


                <div className="mt-8 flex justify-end">

                    <button

                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"

                        disabled={saving}

                        onClick={saveReview}

                    >

                        <FiCheckCircle size={20} />

                        {saving ? "Saving..." : "Save Review"}

                    </button>

                </div>

            </div>

            <div className="mt-8 rounded-2xl bg-white p-8 shadow transition-all duration-300 hover:shadow-lg">

                <h2 className="text-2xl font-bold">

                    Complete Transcript

                </h2>

                <PiiBanner piiDetected={report.pii_detected} piiFindings={report.pii_findings} />

                <div className="mt-6 rounded-xl bg-slate-50 p-6 leading-8 text-slate-700">

                    {report.transcript}

                </div>

            </div>

            {/* Key Customer Concerns + Emotional Cues */}

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">

                <div className="rounded-2xl bg-white p-8 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-amber-100 p-2.5 text-amber-600"><FiAlertCircle size={20} /></div>
                        <h2 className="text-xl font-bold text-slate-800">Key Customer Concerns</h2>
                    </div>

                    <ul className="mt-6 space-y-3">

                        {(analysis.key_customer_concerns || []).map((item, index) => (

                            <li
                                key={index}
                                className="flex items-start gap-3 rounded-xl bg-amber-50/60 p-3 text-sm text-slate-700 transition-colors hover:bg-amber-50"
                            >
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                {item}
                            </li>

                        ))}

                    </ul>

                </div>

                <div className="rounded-2xl bg-white p-8 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-purple-100 p-2.5 text-purple-600"><FiHeart size={20} /></div>
                        <h2 className="text-xl font-bold text-slate-800">Emotional Cues</h2>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">

                        {(analysis.emotional_cues || []).map((item, index) => (

                            <span
                                key={index}
                                className="rounded-full bg-purple-50 px-4 py-1.5 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100"
                            >
                                {item}
                            </span>

                        ))}

                    </div>

                </div>

            </div>

            {/* Action Items + Positive Observations */}

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">

                <div className="rounded-2xl bg-white p-8 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-blue-100 p-2.5 text-blue-600"><FiCheckSquare size={20} /></div>
                        <h2 className="text-xl font-bold text-slate-800">Action Items</h2>
                    </div>

                    <ul className="mt-6 space-y-3">

                        {(analysis.action_items || []).map((item, index) => (

                            <li
                                key={index}
                                className="flex items-start gap-3 rounded-xl bg-blue-50/60 p-3 text-sm text-slate-700 transition-colors hover:bg-blue-50"
                            >
                                <FiCheckSquare className="mt-0.5 shrink-0 text-blue-500" size={16} />
                                {item}
                            </li>

                        ))}

                    </ul>

                </div>

                <div className="rounded-2xl bg-white p-8 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-green-100 p-2.5 text-green-600"><FiThumbsUp size={20} /></div>
                        <h2 className="text-xl font-bold text-slate-800">Positive Observations</h2>
                    </div>

                    <ul className="mt-6 space-y-3">

                        {(analysis.positive_observations || []).map((item, index) => (

                            <li
                                key={index}
                                className="flex items-start gap-3 rounded-xl bg-green-50/60 p-3 text-sm text-slate-700 transition-colors hover:bg-green-50"
                            >
                                <FiThumbsUp className="mt-0.5 shrink-0 text-green-500" size={16} />
                                {item}
                            </li>

                        ))}

                    </ul>

                </div>

            </div>

            {/* Manager Insights — unique to this view, kept as-is */}

            <div className="mt-6 rounded-2xl bg-white p-8 shadow-lg transition-all duration-300 hover:shadow-xl">

                <div className="flex items-center gap-3">
                    <div className="rounded-full bg-slate-100 p-2.5 text-slate-600"><FiClock size={20} /></div>
                    <h2 className="text-xl font-bold text-slate-800">Manager Insights</h2>
                </div>

                <ul className="mt-6 space-y-3">

                    {(analysis.manager_insights || []).map((item, index) => (

                        <li
                            key={index}
                            className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"
                        >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                            {item}
                        </li>

                    ))}

                </ul>

            </div>

            <div className="mt-8 rounded-2xl bg-white p-8 shadow transition-all duration-300 hover:shadow-lg">

                <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-full bg-red-100 p-2 text-red-600"><FiAlertTriangle size={20} /></div>
                    <h2 className="text-2xl font-bold">Risk Assessment</h2>
                </div>

                <p className="mt-5 leading-8 text-slate-700">

                    {analysis.risk_assessment}

                </p>

            </div>

            <div className="mt-8 rounded-2xl bg-white p-8 shadow transition-all duration-300 hover:shadow-lg">

                <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-full bg-indigo-100 p-2 text-indigo-600"><FiSearch size={20} /></div>
                    <h2 className="text-2xl font-bold">Root Cause Analysis</h2>
                </div>

                <p className="mt-5 leading-8 text-slate-700">

                    {analysis.root_cause_analysis}

                </p>

            </div>

            {/* Critical moments — table plus a simple timeline strip built from the same data */}

            <div className="mt-8 rounded-2xl bg-white p-8 shadow transition-all duration-300 hover:shadow-lg">

                <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-full bg-amber-100 p-2 text-amber-600"><FiShield size={20} /></div>
                    <h2 className="text-2xl font-bold">Critical Conversation Moments</h2>
                </div>

                {
                    moments.length > 0 && (

                        <div className="mt-6 mb-8 rounded-xl bg-slate-50 p-6">

                            <div className="mb-4 flex items-center justify-between">

                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    Severity Timeline
                                </p>

                                <div className="flex items-center gap-4 text-xs text-slate-500">

                                    <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-green-500" /> Low
                                    </span>

                                    <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-amber-500" /> Medium
                                    </span>

                                    <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-orange-500" /> High
                                    </span>

                                    <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-red-600" /> Critical
                                    </span>

                                </div>

                            </div>

                            <div className="flex h-36 items-end gap-3 overflow-x-auto pb-1">

                                {
                                    moments.map((moment, index) => {

                                        const style = getSeverityStyle(moment.severity);
                                        const heightPercent = SEVERITY_HEIGHT[moment.severity] || 25;

                                        return (

                                            <div
                                                key={index}
                                                className="group relative flex shrink-0 flex-col items-center gap-2"
                                                style={{ width: "64px" }}
                                            >

                                                <div className="flex h-28 w-full items-end justify-center">

                                                    <div
                                                        className={`w-9 rounded-t-md transition-all duration-700 ease-out ${style.dot}`}
                                                        style={{
                                                            height: animateIn ? `${heightPercent}%` : "0%"
                                                        }}
                                                    />

                                                </div>

                                                <span className="text-[10px] font-medium text-slate-400">
                                                    {moment.start_time}
                                                </span>

                                                {/* Hover tooltip with full context */}
                                                <div className="pointer-events-none absolute -top-20 left-1/2 z-10 w-52 -translate-x-1/2 rounded-lg bg-slate-900 p-3 text-[10px] text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                                                    <p className="font-semibold">{moment.speaker} — {moment.category}</p>
                                                    <p className="mt-1 leading-4 text-slate-300">{moment.quote}</p>
                                                </div>

                                            </div>

                                        );

                                    })
                                }

                            </div>

                        </div>

                    )
                }

                <div className="overflow-x-auto">

                    <table className="min-w-full">

                        <thead className="bg-slate-100">

                            <tr>

                                <th className="px-4 py-3 text-left">

                                    Time

                                </th>

                                <th className="px-4 py-3 text-left">

                                    Speaker

                                </th>

                                <th className="px-4 py-3 text-left">

                                    Category

                                </th>

                                <th className="px-4 py-3 text-left">

                                    Severity

                                </th>

                                <th className="px-4 py-3 text-left">

                                    Quote

                                </th>

                            </tr>

                        </thead>

                        <tbody>

                            {moments.map((moment, index) => (

                                <tr
                                    key={index}
                                    className="border-t transition-colors hover:bg-slate-50"
                                >

                                    <td className="px-4 py-3">

                                        {moment.start_time}

                                    </td>

                                    <td className="px-4 py-3">

                                        {moment.speaker}

                                    </td>

                                    <td className="px-4 py-3">

                                        {moment.category}

                                    </td>

                                    <td className="px-4 py-3">

                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSeverityStyle(moment.severity).badge}`}>
                                            {moment.severity}
                                        </span>

                                    </td>

                                    <td className="px-4 py-3">

                                        {moment.quote}

                                    </td>

                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

            </div>

        </DashboardLayout>

    );

}