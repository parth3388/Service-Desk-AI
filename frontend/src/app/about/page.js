"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { MdLocationOn, MdEmail, MdPhone } from "react-icons/md";

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

// NOTE: reworded to describe this product (AI Service Desk) rather than the
// company in general, since this app doesn't have Services/Products pages.
// Edit freely if you want this to talk about the company instead.
const journeyCards = [
  {
    emoji: "🚀",
    title: "Our Journey",
    desc: "What started as a simple transcription tool grew into a full call-intelligence platform, built to solve a problem every support team faces: too many calls, too little visibility.",
  },
  {
    emoji: "🎯",
    title: "What We Do",
    desc: "We convert audio into accurate transcripts, analyze customer and agent sentiment, surface key concerns and risks, and generate polished PDF reports — automatically, for every call.",
  },
  {
    emoji: "🛡️",
    title: "Our Approach",
    desc: "Every analysis is designed to be explainable and reviewable, not a black box — so managers can trust the scores and act on the insights with confidence.",
  },
];

export default function AboutPage() {
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
                  link.href === "/about"
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
      <section className="bg-gradient-to-b from-indigo-50 via-white to-purple-50 px-6 py-24 text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
            ABOUT US
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight text-slate-900 md:text-5xl">
            Built to Make Every Support Call Understood
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            AI Service Desk is built by Shatarupax AI Labs to help support
            teams turn raw call recordings into transcripts, sentiment
            insights, and ready-to-share reports — without the manual review
            overhead.
          </p>
        </Reveal>
      </section>

      {/* Journey / What We Do / Approach */}
      <section className="mx-auto max-w-5xl px-6 py-20 lg:px-10">
        <div className="space-y-6">
          {journeyCards.map((card, i) => (
            <Reveal key={card.title} delay={i * 120}>
              <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">
                  <span className="mr-2">{card.emoji}</span>
                  {card.title}
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-slate-600">
                  {card.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Mission / Vision */}
      <section className="bg-indigo-50/60 px-6 py-20 lg:px-10">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
              <h3 className="text-xl font-bold text-slate-900">Our Mission</h3>
              <p className="mt-3 text-slate-600">
                Give support teams clear, reliable visibility into every
                customer conversation — without adding to their workload.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="h-full rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
              <h3 className="text-xl font-bold text-slate-900">Our Vision</h3>
              <p className="mt-3 text-slate-600">
                Become the default way enterprise support teams understand
                call quality, customer sentiment, and agent performance.
              </p>
            </div>
          </Reveal>
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