"use client";

import Link from "next/link";
import {
    MdMic,
    MdBarChart,
    MdPictureAsPdf,
    MdLockOutline,
    MdGppGood,
    MdPlayArrow,
} from "react-icons/md";

import Logo from "../../components/Logo";

// Fixed bar heights for the illustrative waveform — purely decorative.
const WAVEFORM_BARS = [6, 11, 8, 15, 10, 18, 13, 7, 14, 9];

const features = [
    {
        icon: MdMic,
        title: "AI Transcription",
        desc: "Convert call recordings into accurate text.",
        bg: "bg-blue-100",
        text: "text-blue-600",
    },
    {
        icon: MdBarChart,
        title: "Conversation Insights",
        desc: "Understand customer sentiment and key issues.",
        bg: "bg-violet-100",
        text: "text-violet-600",
    },
    {
        icon: MdPictureAsPdf,
        title: "PDF Reports",
        desc: "Generate and download detailed reports.",
        bg: "bg-pink-100",
        text: "text-pink-600",
    },
];

// Decorative, illustrative-only composition: an audio player, a transcript
// snippet, and floating analytics/report badges. No real or live data.
function AuthIllustration() {
    return (
        <div className="relative mx-auto hidden w-full max-w-sm lg:block">
            <div className="absolute -top-6 -left-6 h-40 w-40 rounded-full bg-blue-200/50 blur-2xl" />
            <div className="absolute -right-4 -bottom-8 h-48 w-48 rounded-full bg-violet-200/50 blur-2xl" />

            <div className="relative rounded-3xl border border-white bg-white/80 p-6 shadow-xl shadow-indigo-900/10 backdrop-blur-sm">
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600">
                        <MdPlayArrow className="text-xl text-white" />
                    </span>
                    <div className="flex h-8 flex-1 items-end gap-1">
                        {WAVEFORM_BARS.map((h, i) => (
                            <span
                                key={i}
                                className="w-1 rounded-full bg-gradient-to-t from-blue-400 to-violet-400"
                                style={{ height: `${h}px` }}
                            />
                        ))}
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-slate-400">
                        04:12
                    </span>
                </div>

                <div className="mt-4 space-y-1.5 rounded-2xl border border-slate-100 bg-white p-3">
                    <p className="text-xs leading-relaxed text-slate-600">
                        <span className="font-semibold text-slate-800">Customer:</span>{" "}
                        I&apos;d like an update on my support ticket.
                    </p>
                    <p className="text-xs leading-relaxed text-slate-600">
                        <span className="font-semibold text-slate-800">Agent:</span>{" "}
                        Sure, let me check that for you.
                    </p>
                </div>

                <div className="relative mt-5 flex items-center justify-between px-2">
                    <div className="absolute top-1/2 right-10 left-10 border-t border-dashed border-slate-300" />
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-md">
                        <MdBarChart className="text-lg text-violet-600" />
                    </span>
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-md">
                        <MdPictureAsPdf className="text-lg text-blue-600" />
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function RegisterPage() {

    return (
        <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 py-10 sm:px-6 lg:px-10">
            <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
                <div className="grid w-full grid-cols-1 items-center gap-12 lg:grid-cols-[1.35fr_1fr]">
                    {/* Left column: branding + promo */}
                    <div className="w-full text-center lg:text-left">
                        <h1 className="text-4xl leading-tight font-extrabold text-slate-900 md:text-5xl">
                            Join ShatarupaX and Transform
                            <br />
                            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                                Support Conversations
                            </span>
                        </h1>

                        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-slate-600 lg:mx-0">
                            Create your account to start exploring AI-powered
                            tools for call transcription, conversation insights,
                            and detailed reports.
                        </p>

                        <div className="mx-auto mt-8 max-w-sm space-y-4 lg:mx-0">
                            {features.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div
                                        key={item.title}
                                        className="flex items-center gap-3 text-left"
                                    >
                                        <span
                                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.bg}`}
                                        >
                                            <Icon className={`text-xl ${item.text}`} />
                                        </span>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">
                                                {item.title}
                                            </p>
                                            <p className="text-sm text-slate-600">
                                                {item.desc}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-8">
                            <AuthIllustration />
                        </div>

                        <div className="mx-auto mt-8 flex max-w-sm items-center justify-center gap-2 text-sm text-slate-600 lg:mx-0 lg:justify-start">
                            <MdGppGood className="shrink-0 text-lg text-emerald-600" />
                            Your data is secure and accessible only to authorized
                            users.
                        </div>
                    </div>

                    {/* Right column: register card */}
                    <div className="relative mx-auto w-full max-w-md">
                        <div className="absolute -top-10 -right-10 h-56 w-56 rounded-full bg-blue-200/50 blur-3xl" />
                        <div className="absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-violet-200/50 blur-3xl" />

                        <div className="relative rounded-3xl border border-white bg-gradient-to-br from-blue-100 via-white to-violet-100 px-6 py-8 shadow-2xl shadow-indigo-900/10 sm:px-10 sm:py-10">
                            <div className="mb-6 flex justify-center">
                                <Logo height={56} />
                            </div>

                            <div className="mb-2 text-center">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                                    <MdLockOutline className="text-2xl text-amber-600" />
                                </div>
                                <h2 className="mt-4 text-2xl font-bold text-slate-900">
                                    Account Creation Disabled
                                </h2>
                                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                                    Self sign-up isn&apos;t available. Please sign
                                    in using the email and password provided by
                                    your company.
                                </p>
                            </div>

                            <Link
                                href="/login"
                                className="mt-6 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:opacity-90"
                            >
                                Go to Login →
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
