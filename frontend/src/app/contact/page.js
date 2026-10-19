"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Logo from "@/components/Logo";
import {
  MdLocationOn,
  MdEmail,
  MdPhone,
  MdBolt,
  MdHeadsetMic,
  MdQuestionAnswer,
  MdForum,
  MdHelp,
  MdBuild,
  MdLightbulb,
} from "react-icons/md";
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

const heroHighlights = [
  {
    icon: MdBolt,
    title: "Quick Response",
    desc: "We aim to respond as soon as possible.",
  },
  {
    icon: MdHeadsetMic,
    title: "Real Support",
    desc: "Get help from our team directly.",
  },
  {
    icon: MdQuestionAnswer,
    title: "Product & Technical",
    desc: "Questions, feedback, and feature requests.",
  },
];

const helpCards = [
  {
    icon: MdHelp,
    title: "Product Questions",
    desc: "Learn more about features and capabilities.",
  },
  {
    icon: MdBuild,
    title: "Technical Support",
    desc: "Get help with issues or unexpected behavior.",
  },
  {
    icon: MdLightbulb,
    title: "Feature Requests",
    desc: "Share your ideas to help us improve.",
  },
  {
    icon: MdForum,
    title: "General Inquiries",
    desc: "Partnerships, feedback, or any other questions.",
  },
];

// Illustration for the hero's right column — a support agent at a laptop,
// surrounded by communication icons. Purely decorative.
function ContactHeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <Image
        src="/image.png"
        alt="Support agent ready to help"
        width={960}
        height={540}
        priority
        className="h-auto w-full rounded-3xl object-contain"
      />
    </div>
  );
}

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
        <div className="mx-auto grid max-w-7xl grid-cols-2 items-center px-3 py-0 lg:grid-cols-3 lg:px-6">
          <div className="flex items-center">
            <Logo height={100} />
          </div>

          <nav className="hidden items-center justify-center gap-10 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[19px] font-bold transition-colors ${
                  link.href === "/contact"
                    ? "text-blue-600"
                    : "text-slate-800 hover:text-blue-600"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-50 sm:px-6 sm:py-3 sm:text-base"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-700 sm:px-7 sm:py-3 sm:text-base"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-50 via-white to-purple-50 px-6 py-16 lg:px-10 lg:py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <Reveal className="min-w-0 text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
              CONTACT US
            </span>

            <h1 className="mt-6 text-4xl font-extrabold leading-tight text-slate-900 md:text-5xl">
              Get in Touch
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
              Have a question, found a bug, or want to explore how AI Service
              Desk can help your support team? Send us a message and
              we&apos;ll get back to you as soon as possible.
            </p>

            <div className="mx-auto mt-8 max-w-md space-y-4 lg:mx-0">
              {heroHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-center gap-3 text-left"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                      <Icon className="text-lg text-blue-600" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {item.title}
                      </p>
                      <p className="text-sm text-slate-600">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <ContactHeroVisual />
          </Reveal>
        </div>
      </section>

      {/* Contact Info + Form */}
      <section className="mx-auto max-w-6xl px-6 py-20 lg:px-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
          {/* Contact Information */}
          <Reveal>
            <div className="h-full rounded-2xl border border-slate-100 bg-white p-8 shadow-sm md:p-10">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-xs font-bold tracking-wider text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                OUR CONTACT INFORMATION
              </span>
              <h2 className="mt-5 text-2xl font-bold text-slate-900">
                Let&apos;s Connect
              </h2>
              <p className="mt-3 leading-relaxed text-slate-600">
                Whether you have a question about features, need technical
                support, want to report an issue, or just want to say hello —
                we&apos;re always happy to hear from you.
              </p>

              <div className="mt-8 space-y-6">
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                    <MdLocationOn className="text-xl text-blue-600" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Our Offices
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      <span className="font-semibold text-slate-700">
                        Ajmer Office:
                      </span>{" "}
                      483, Near Dairy, Ramdev Mandir Ke Paas, Khanpura,
                      Ajmer, Rajasthan – 305001, India
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      <span className="font-semibold text-slate-700">
                        Delhi Office:
                      </span>{" "}
                      SDM Office, Near Happy School, Dariyaganj, New Delhi
                      110002, India
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                    <MdEmail className="text-xl text-violet-600" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Email Us
                    </p>
                    <a
                      href="mailto:info@shatarupax.com"
                      className="mt-1 block text-sm text-slate-600 hover:text-violet-700"
                    >
                      info@shatarupax.com
                    </a>
                  </div>
                </div>

                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                    <MdPhone className="text-xl text-blue-600" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Call Us
                    </p>
                    <a
                      href="tel:+919643082245"
                      className="mt-1 block text-sm text-slate-600 hover:text-blue-700"
                    >
                      +91 9643082245
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Inquiry Form */}
          <Reveal delay={120}>
            <div className="h-full rounded-2xl border border-slate-100 bg-white p-8 shadow-sm md:p-10">
              <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                SEND US A MESSAGE
              </span>
              <h2 className="mt-5 text-2xl font-bold text-slate-900">
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

              <form
                onSubmit={handleSubmit}
                noValidate
                className="mt-6 space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="name"
                      className="mb-1.5 block text-xs font-semibold text-slate-700"
                    >
                      Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Your name"
                      required
                      maxLength={CONTACT_LIMITS.name}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1.5 block text-xs font-semibold text-slate-700"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="you@company.com"
                      required
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-1.5 block text-xs font-semibold text-slate-700"
                    >
                      Phone{" "}
                      <span className="font-normal text-slate-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="+91 00000 00000"
                      maxLength={CONTACT_LIMITS.phone}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="company"
                      className="mb-1.5 block text-xs font-semibold text-slate-700"
                    >
                      Company{" "}
                      <span className="font-normal text-slate-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      id="company"
                      type="text"
                      name="company"
                      value={form.company}
                      onChange={handleChange}
                      placeholder="Your company"
                      maxLength={CONTACT_LIMITS.company}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="interest"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Reason for Contact
                  </label>
                  <select
                    id="interest"
                    name="interest"
                    value={form.interest}
                    onChange={handleChange}
                    required
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="" disabled>
                      Select a reason
                    </option>
                    {interestOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="message"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="How can we help?"
                    required
                    maxLength={CONTACT_LIMITS.message}
                    rows={5}
                    className="w-full resize-y rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

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
        </div>
      </section>

      {/* How Can We Help */}
      <section className="bg-indigo-50/60 px-6 py-20 lg:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-xs font-bold tracking-wider text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            COMMON REASONS TO CONTACT US
          </span>
          <h2 className="mt-6 text-4xl font-extrabold text-slate-900">
            How Can We Help?
          </h2>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {helpCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <Reveal key={card.title} delay={i * 80}>
                <div className="h-full rounded-2xl border border-slate-100 bg-white p-7 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100">
                    <Icon className="text-2xl text-violet-600" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {card.desc}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-4 lg:px-10">
          <div>
            <Image
              src="/footer-logo.webp"
              alt="ShatarupaX"
              width={1740}
              height={1020}
              style={{ height: 76, width: "auto" }}
              className="object-contain"
            />
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
                <span>
                  <span className="block font-semibold text-sky-300">
                    Ajmer Office
                  </span>
                  483, Near Dairy, Ramdev Mandir Ke Paas, Khanpura, Ajmer,
                  Rajasthan – 305001, India
                </span>
              </li>
              <li className="flex gap-2">
                <MdLocationOn className="mt-0.5 shrink-0 text-blue-400" size={18} />
                <span>
                  <span className="block font-semibold text-sky-300">
                    Delhi Office
                  </span>
                  SDM Office, Near Happy School, Dariyaganj, New Delhi
                  110002, India
                </span>
              </li>
              <li className="flex items-center gap-2">
                <MdEmail className="shrink-0 text-blue-400" size={18} />
                <span className="font-semibold text-white">
                  info@shatarupax.com
                </span>
              </li>
              <li className="flex items-center gap-2">
                <MdPhone className="shrink-0 text-blue-400" size={18} />
                <span className="font-semibold text-white">
                  +91 9643082245
                </span>
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
