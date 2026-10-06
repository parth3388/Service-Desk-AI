"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiEye, FiEyeOff } from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import { loginUser, resendVerification } from "../../services/authService";
import { getErrorMessage } from "../../lib/apiError.mjs";
import Logo from "../../components/Logo";

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
        /* Aligned with RegisterPage structure to prevent clipped elements and background cuts */
        <div className="h-screen w-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-start justify-center overflow-y-auto p-4 sm:p-6 md:p-10">
            {/* Added my-auto to perfectly center the block if the window height allows it */}
            <div className="w-full max-w-md my-auto">
                {/* Unified compact card paddings */}
                <div className="bg-white rounded-3xl shadow-2xl px-6 py-8 sm:px-10 sm:py-10">
                    
                    {/* Logo Section */}
                    <div className="flex justify-center mb-4">
                        <Logo size={70} />
                    </div>

                    <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold text-slate-900">
                            Welcome Back
                        </h2>
                        <p className="text-slate-500 mt-1 text-sm">
                            Sign in to access your dashboard
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
                            <label className="block mb-1 text-sm font-medium text-slate-700">
                                Email Address
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="john@example.com"
                                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                                required
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between">
                                <label className="block mb-1 text-sm font-medium text-slate-700">
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
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-11 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
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
                            className="w-full mt-2 rounded-xl bg-blue-600 py-3 text-white font-semibold transition duration-300 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                            {loading ? "Signing In..." : "Login"}
                        </button>
                    </form>

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
    );
}