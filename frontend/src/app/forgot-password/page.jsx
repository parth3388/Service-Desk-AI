"use client";

import { useState } from "react";
import Link from "next/link";

import { normalizeApiDetail } from "../../lib/apiError.mjs";

// Same default as services/api.js so this page works without the env var.
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          normalizeApiDetail(data.detail, "Something went wrong. Please try again.")
        );
      }

      // Backend always returns the same success message,
      // whether or not the email exists (security best-practice).
      setStatus("success");
    } catch (err) {
      setErrorMessage(err.message);
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Forgot your password?
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {status === "success" ? (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-sm">
            If an account with that email exists, a password reset link has
            been sent. Please check your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-lg bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {status === "loading" ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="text-sm text-gray-500 mt-6 text-center">
          Remembered your password?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}