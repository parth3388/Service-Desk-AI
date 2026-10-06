"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import {
  MdMic,
  MdAnalytics,
  MdPictureAsPdf,
  MdLocationOn,
  MdEmail,
  MdPhone,
} from "react-icons/md";

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

const features = [
  {
    icon: MdMic,
    title: "Audio Transcription",
    desc: "Convert support call recordings into accurate transcripts using AI.",
  },
  {
    icon: MdAnalytics,
    title: "Sentiment Analysis",
    desc: "Analyze customer and agent behavior, emotions and satisfaction.",
  },
  {
    icon: MdPictureAsPdf,
    title: "PDF Reports",
    desc: "Generate enterprise-grade service desk reports instantly.",
  },
];

// Picked based on what I could confirm from your codebase (Next.js + Tailwind
// frontend, Python + ReportLab PDF generation, Whisper/Groq referenced in your
// pdf_generator.py, Docker for deployment). PLEASE correct this list — add/
// remove anything wrong or missing (backend framework, database, etc.).
const techStack = [
  "Next.js",
  "React",
  "Tailwind CSS",
  "Python",
  "Whisper AI",
  "Groq",
  "ReportLab",
  "Docker",
];

export default function Home() {
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

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
                className="text-sm font-semibold text-slate-700 transition-colors hover:text-blue-600"
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

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-purple-50 px-6 py-28 text-center">
        <div
          className={`mx-auto max-w-3xl transition-all duration-700 ease-out ${
            heroVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
            AI SERVICE DESK
          </span>

          <h1 className="mt-6 text-5xl font-extrabold leading-tight text-slate-900 md:text-6xl">
            Understand Every Call.
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
              Automatically.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            AI Service Desk turns raw customer support call recordings into
            accurate transcripts, sentiment insights, and polished PDF
            reports — so your team spends less time reviewing calls and more
            time acting on what actually matters.
          </p>

          <div className="mt-10 flex justify-center gap-4">
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
            >
              Get Started
            </Link>
            <Link
              href="/register"
              className="rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.title} delay={i * 120}>
                <div className="h-full rounded-2xl border border-slate-100 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                    <Icon className="text-2xl text-blue-600" />
                  </div>
                  <h2 className="mt-5 text-xl font-bold text-slate-900">
                    {feature.title}
                  </h2>
                  <p className="mt-2 text-slate-600">{feature.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="bg-indigo-50/60 px-6 py-24 text-center lg:px-10">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
            TECH STACK
          </span>
          <h2 className="mx-auto mt-6 max-w-2xl text-4xl font-extrabold text-slate-900">
            Built With Modern, Reliable Technology
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-600">
            A production-ready stack chosen for speed, accuracy, and easy
            deployment.
          </p>
        </Reveal>

        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3">
          {techStack.map((tech, i) => (
            <Reveal key={tech} delay={i * 60}>
              <span className="inline-block rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                {tech}
              </span>
            </Reveal>
          ))}
        </div>
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
