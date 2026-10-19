"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import {
    MdMic,
    MdBarChart,
    MdPictureAsPdf,
    MdMailOutline,
    MdLockOutline,
    MdGppGood,
    MdPlayArrow,
} from "react-icons/md";

import { useAuth } from "../../context/AuthContext";
import { loginUser, resendVerification } from "../../services/authService";
import { getErrorMessage } from "../../lib/apiError.mjs";
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
function LoginIllustration() {
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

export default function LoginPage() {
    const router = useRouter();
    const { login } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [needsVerification, setNeedsVerification] = useState(false);
    const [resendStatus, setResendStatus] = useState("idle"); // idle | sending | sent | error
    const [resendMessage, setResendMessage] = useState("");

    const handleResend = async () => {
        if (!email || resendStatus === "sending") return;

        setResendStatus("sending");
        setResendMessage("");

        try {
            const data = await resendVerification(email);
            setResendStatus("sent");
            setResendMessage(
                data?.message ||
                "If an unverified account with that email exists, a new verification email has been sent."
            );
        } catch (resendError) {
            setResendStatus("error");
            setResendMessage(
                getErrorMessage(resendError, "Unable to send the verification email. Please try again.")
            );
        }
    };

    const handleLogin = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError("");
        setNeedsVerification(false);
        setResendStatus("idle");
        setResendMessage("");

        try {
            const formData = new URLSearchParams();
            formData.append("username", email);
            formData.append("password", password);

            const data = await loginUser(formData);
            login(data.access_token, data.user);

            if (data.user.role === "manager") {
                router.replace("/manager/dashboard");
            } else {
                router.replace("/employee/dashboard");
            }
        } catch (error) {
            const message = getErrorMessage(error, "Unable to login. Please try again.");

            setError(message);

            // Backend answers 403 "Please verify your email before logging in."
            setNeedsVerification(
                error.response?.status === 403 && /verify your email/i.test(message)
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 py-10 sm:px-6 lg:px-10">
            <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
                <div className="grid w-full grid-cols-1 items-center gap-12 lg:grid-cols-[1.35fr_1fr]">
                    {/* Left column: branding + promo */}
                    <div className="w-full text-center lg:text-left">
                        <h1 className="text-4xl leading-tight font-extrabold text-slate-900 md:text-5xl">
                            Smarter Insights
                            <br />
                            for{" "}
                            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                                Better Support
                            </span>
                        </h1>

                        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-slate-600 lg:mx-0">
                            Turn customer support recordings into transcripts,
                            conversation insights, and structured reports — all in
                            one place.
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
                            <LoginIllustration />
                        </div>

                        <div className="mx-auto mt-8 flex max-w-sm items-center justify-center gap-2 text-sm text-slate-600 lg:mx-0 lg:justify-start">
                            <MdGppGood className="shrink-0 text-lg text-emerald-600" />
                            Your data is secure and accessible only to authorized
                            users.
                        </div>
                    </div>

                    {/* Right column: login card */}
                    <div className="relative mx-auto w-full max-w-md">
                        <div className="absolute -top-10 -right-10 h-56 w-56 rounded-full bg-blue-200/50 blur-3xl" />
                        <div className="absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-violet-200/50 blur-3xl" />

                        <div className="relative rounded-3xl border border-white bg-gradient-to-br from-blue-100 via-white to-violet-100 px-6 py-8 shadow-2xl shadow-indigo-900/10 sm:px-10 sm:py-10">
                            <div className="mb-6 flex justify-center">
                                <Logo height={56} />
                            </div>

                            <div className="mb-6 text-center">
                                <h2 className="text-2xl font-bold text-slate-900">
                                    Welcome Back
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Sign in to access your AI Service Desk
                                </p>
                            </div>

                            {error && (
                                <div className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-600">
                                    {error}

                                    {needsVerification && (
                                        <div className="mt-3">
                                            <button
                                                type="button"
                                                onClick={handleResend}
                                                disabled={resendStatus === "sending" || !email}
                                                className="font-semibold text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                                            >
                                                {resendStatus === "sending"
                                                    ? "Sending..."
                                                    : "Resend verification email"}
                                            </button>

                                            {resendMessage && (
                                                <p
                                                    className={`mt-2 ${resendStatus === "error" ? "text-red-600" : "text-green-700"}`}
                                                >
                                                    {resendMessage}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">
                                        Email Address
                                    </label>
                                    <div className="relative">
                                        <MdMailOutline className="absolute top-1/2 left-3.5 -translate-y-1/2 text-lg text-slate-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="john@example.com"
                                            className="w-full rounded-xl border border-slate-300 py-2.5 pr-4 pl-10 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between">
                                        <label className="mb-1 block text-sm font-medium text-slate-700">
                                            Password
                                        </label>
                                        <Link
                                            href="/forgot-password"
                                            className="mb-1 text-sm font-semibold text-blue-600 hover:underline"
                                        >
                                            Forgot Password?
                                        </Link>
                                    </div>
                                    <div className="relative">
                                        <MdLockOutline className="absolute top-1/2 left-3.5 -translate-y-1/2 text-lg text-slate-400" />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            className="w-full rounded-xl border border-slate-300 py-2.5 pr-11 pl-10 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                                            tabIndex={-1}
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                        >
                                            {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="mt-2 w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 py-3 font-semibold text-white shadow-md shadow-blue-600/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loading ? "Signing In..." : "Login →"}
                                </button>
                            </form>

                            <div className="my-6 flex items-center gap-3">
                                <div className="h-px flex-1 bg-slate-200" />
                                <span className="text-xs font-medium text-slate-400">or</span>
                                <div className="h-px flex-1 bg-slate-200" />
                            </div>

                            <button
                                type="button"
                                disabled
                                title="Google sign-in is not available yet"
                                aria-disabled="true"
                                className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-400"
                            >
                                <FcGoogle className="text-lg opacity-60" />
                                Continue with Google
                            </button>

                            <div className="mt-6 text-center text-sm">
                                <p className="text-slate-600">
                                    Don&apos;t have an account?{" "}
                                    <Link
                                        href="/register"
                                        className="font-semibold text-blue-600 hover:underline"
                                    >
                                        Create Account
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
