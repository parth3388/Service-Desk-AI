"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

import Logo from "../../components/Logo";
import { registerUser } from "../../services/authService";
import { getErrorMessage } from "../../lib/apiError.mjs";
import { validatePassword } from "../../lib/validation.mjs";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("employee");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    // Same policy the server enforces (min 8 characters, max 72 bytes).
    const passwordProblem = validatePassword(password);

    if (passwordProblem) {
      setError(passwordProblem);
      return;
    }

    setLoading(true);

    try {
      const result = await registerUser({
        full_name: fullName,
        email,
        password,
        role
      });

      // The server says whether the verification email actually went out.
      const baseMessage =
        result?.message ||
        "Registration successful. Please check your email to verify your account.";

      setSuccess(`${baseMessage} Redirecting to Login...`);

      setTimeout(() => {
        router.push("/login");
      }, 4000);
    } catch (error) {
      setError(getErrorMessage(error, "Unable to register. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Added h-screen and overflow-y-auto to allow scrolling without breaking backgrounds */
    <div className="h-screen w-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-start justify-center overflow-y-auto p-4 sm:p-6 md:p-10">
      {/* Added my-auto to keep the card centered vertically if space permits */}
      <div className="w-full max-w-md my-auto">
        {/* Cleaned up padding to keep it compact and well-contained */}
        <div className="bg-white rounded-3xl shadow-2xl px-6 py-8 sm:px-10 sm:py-10">

          {/* Logo Section */}
          <div className="flex justify-center mb-4">
            <Logo size={70} />
          </div>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900">
              Create Account
            </h2>
            <p className="text-slate-500 mt-1 text-sm">
              Join Shatarupax AI Labs
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-5 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-700">
              {success}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-slate-700">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                required
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-slate-700">
                Role
              </label>

              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
              >
                <option value="employee">
                  Employee
                </option>

                <option value="manager">
                  Manager
                </option>
              </select>
            </div>

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
              <label className="block mb-1 text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-11 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 rounded-xl bg-green-600 py-3 text-white font-semibold transition duration-300 hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-slate-600">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-blue-600 hover:underline"
              >
                Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}