"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { MdLocationOn, MdEmail, MdPhone } from "react-icons/md";
import { submitContactForm } from "@/services/contactService";
import { getErrorMessage } from "@/lib/apiError.mjs";
import { CONTACT_LIMITS, validateContactForm } from "@/lib/validation.mjs";

// Fades + slides an element up into view the first time it scrolls into
// the viewport. Plain IntersectionObserver — no extra animation library needed.
function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

const navLinks = [
  { name: "Home", href: "/" },
  { name: "About Us", href: "/about" },
  { name: "Contact Us", href: "/contact" },
];

// NOTE: adapted for this product (no Services/Products pages exist here).
// Edit the options to match what you actually want people selecting.
const interestOptions = [
  "General Inquiry",
  "Enterprise Plan",
  "Technical Support",
  "Bug Report",
  "Feature Request",
  "Partnership",
];

const initialForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  interest: "",
  message: "",
};

export default function ContactPage() {
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Same rules the server enforces, so the common mistakes are caught
    // before a request is made.
    const problems = Object.values(validateContactForm(form));

    // The reason is optional server-side but required by this form.
    if (!form.interest) {
      problems.push("Please select a reason for contact.");
    }

    if (problems.length > 0) {
      setSubmitted(false);
      setError(problems.join(" "));
      return;
    }

    setSubmitting(true);
    setError("");
    setSubmitted(false);

    try {
      await submitContactForm(form);
      setSubmitted(true);
      setForm(initialForm);
    } catch (err) {
      // FastAPI 422 responses carry `detail` as an ARRAY of objects; this
      // always yields a string so React can render it.
      setError(
        getErrorMessage(err, "Something went wrong. Please try again.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto grid max-w-7xl grid-cols-3 items-center px-6 py-4 lg:px-10">
          <div className="flex items-center">
            <Logo height={40} />
          </div>

          <nav className="hidden items-center justify-center gap-10 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-semibold transition-colors ${
                  link.href === "/contact"
                    ? "text-blue-600"
                    : "text-slate-700 hover:text-blue-600"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/login"
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      {/* Intro */}
      <section className="bg-gradient-to-b from-indigo-50 via-white to-purple-50 px-6 py-20 text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
            CONTACT US
          </span>

          <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-extrabold leading-tight text-slate-900 md:text-5xl">
            Get in Touch
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Have a question, found a bug, or want a feature? Send us a
            message and we&apos;ll get back to you.
          </p>
        </Reveal>
      </section>

      {/* Form + Details */}
      <section className="mx-auto max-w-3xl px-6 py-16 lg:px-10">
        <Reveal>
          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm md:p-10">
            <h2 className="text-2xl font-bold text-slate-900">
              Send Your Inquiry
            </h2>

            {submitted && (
              <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                Thanks — your message has been sent. We&apos;ll get back to
                you soon.
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Name"
                required
                maxLength={CONTACT_LIMITS.name}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Email"
                required
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="Phone"
                maxLength={CONTACT_LIMITS.phone}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <input
                type="text"
                name="company"
                value={form.company}
                onChange={handleChange}
                placeholder="Company"
                maxLength={CONTACT_LIMITS.company}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <select
                name="interest"
                value={form.interest}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="" disabled>
                  Reason for Contact
                </option>
                {interestOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              <textarea
                name="message"
                value={form.message}
                onChange={handleChange}
                placeholder="Message"
                required
                maxLength={CONTACT_LIMITS.message}
                rows={5}
                className="w-full resize-y rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Sending..." : "Send Request →"}
              </button>
            </form>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">
              Contact Details
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex gap-2">
                <MdLocationOn className="mt-0.5 shrink-0 text-blue-600" size={18} />
                SDM Office, Near Happy School, Dariyaganj, New Delhi 110002, India
              </li>
              <li className="flex items-center gap-2">
                <MdEmail className="text-blue-600" size={18} />
                info@shatarupax.com
              </li>
              <li className="flex items-center gap-2">
                <MdPhone className="text-blue-600" size={18} />
                +91 9643082245
              </li>
            </ul>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-4 lg:px-10">
          <div>
            <Logo height={44} variant="dark" />
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              AI-powered call analysis, transcription and reporting — built to
              help support teams resolve issues faster and understand their
              customers better.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
              Quick Links
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/" className="hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-white">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white">
                  Login
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-white">
                  Register
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
              Platform
            </h3>
            <ul className="space-y-3 text-sm">
              <li>Audio Transcription</li>
              <li>Sentiment Analysis</li>
              <li>PDF Reports</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
              Contact Details
            </h3>
            <ul className="space-y-4 text-sm">
              <li className="flex gap-2">
                <MdLocationOn className="mt-0.5 shrink-0 text-blue-400" size={18} />
                SDM Office, Near Happy School, Dariyaganj, New Delhi 110002, India
              </li>
              <li className="flex items-center gap-2">
                <MdEmail className="text-blue-400" size={18} />
                info@shatarupax.com
              </li>
              <li className="flex items-center gap-2">
                <MdPhone className="text-blue-400" size={18} />
                +91 9643082245
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 px-6 py-6 text-center text-xs text-slate-400 lg:px-10">
          © {new Date().getFullYear()} Shatarupax AI Labs. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
