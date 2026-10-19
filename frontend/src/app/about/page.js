"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Logo from "@/components/Logo";
import {
  MdLocationOn,
  MdEmail,
  MdPhone,
  MdMic,
  MdGraphicEq,
  MdPsychology,
  MdChecklist,
  MdAnalytics,
  MdPictureAsPdf,
  MdSpeed,
  MdVisibility,
  MdSecurity,
  MdGroups,
  MdFlag,
  MdExplore,
  MdAutoAwesome,
  MdSentimentSatisfiedAlt,
  MdDescription,
  MdArrowForward,
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

// Fixed bar heights for the illustrative waveform — purely decorative, not
// rendered from any real audio data.
const WAVEFORM_BARS = [8, 16, 11, 22, 14, 26, 18, 10, 20, 15, 24, 12, 9, 17, 13];

const storySteps = [
  {
    icon: MdMic,
    title: "Recording",
    desc: "A support call recording is uploaded for analysis.",
  },
  {
    icon: MdPsychology,
    title: "Understanding",
    desc: "The conversation is transcribed and analyzed for key signals.",
  },
  {
    icon: MdChecklist,
    title: "Action",
    desc: "Insights are organized into a report your team can act on.",
  },
];

const whatWeDo = [
  {
    icon: MdMic,
    title: "Audio Transcription",
    desc: "Turn supported call recordings into readable text for easier review and documentation.",
  },
  {
    icon: MdAnalytics,
    title: "Conversation Intelligence",
    desc: "Help teams review available sentiment signals, important discussion points, and customer concerns.",
  },
  {
    icon: MdPictureAsPdf,
    title: "Structured Reporting",
    desc: "Organize available analysis results into readable reports and export them when supported.",
  },
  {
    icon: MdSpeed,
    title: "Better Support Workflows",
    desc: "Make it easier for teams to review conversations and identify areas that may need follow-up.",
  },
];

const approachPrinciples = [
  {
    icon: MdVisibility,
    title: "Clarity First",
    desc: "Present available transcript and analysis results in a way people can understand and review.",
  },
  {
    icon: MdSecurity,
    title: "Responsible Insights",
    desc: "Treat sentiment and other AI-generated interpretations as estimates that may require human judgment.",
  },
  {
    icon: MdGroups,
    title: "Human-Led Decisions",
    desc: "Help support teams use conversation insights as an aid to review and decision-making, not as a replacement for human judgment.",
  },
];

// Product-inspired illustration for the hero's right column: a static
// composition built from existing icons and CSS (waveform, transcript
// snippets, a sentiment indicator, and a report panel). Clearly labeled as
// illustrative — not a real call, not real analysis output.
function AboutHeroVisual() {
  return (
    <div className="min-w-0">
      <div className="relative mx-auto w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xl shadow-indigo-900/10 backdrop-blur-sm sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600">
              <MdAutoAwesome className="text-base text-white" />
            </span>
            <span className="text-sm font-bold text-slate-900">
              How Call Analysis Works
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold tracking-wide text-violet-700">
            <span className="relative flex h-1.5 w-1.5 motion-reduce:hidden">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-600" />
            </span>
            ILLUSTRATIVE
          </span>
        </div>

        {/* Waveform */}
        <div className="mt-5 flex h-14 items-end gap-1 rounded-xl bg-slate-50 px-4 py-3">
          {WAVEFORM_BARS.map((h, i) => (
            <span
              key={i}
              className="w-1.5 rounded-full bg-gradient-to-t from-blue-500 to-violet-500"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>

        {/* Transcript snippet */}
        <div className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <MdDescription className="text-sm" />
            Transcript Snippet
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">Customer:</span>{" "}
            Explains the issue they&apos;re facing with their order.
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">Agent:</span>{" "}
            Confirms the details and walks through the resolution.
          </p>
        </div>

        {/* Sentiment indicator */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3">
          <div className="flex items-center gap-2">
            <MdSentimentSatisfiedAlt className="text-lg text-emerald-500" />
            <span className="text-xs font-semibold text-slate-600">
              Sentiment Signal
            </span>
          </div>
          <span className="text-xs font-bold text-emerald-600">Positive</span>
        </div>

        {/* Structured report panel */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <MdPictureAsPdf className="text-sm" />
            Structured Report
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-slate-100" />
            <div className="h-1.5 w-4/5 rounded-full bg-slate-100" />
            <div className="h-1.5 w-3/5 rounded-full bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AboutPage() {
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

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
                  link.href === "/about"
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
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-purple-50 px-6 py-10 lg:px-10 lg:py-16">
        <div
          className={`mx-auto grid max-w-7xl grid-cols-1 items-start gap-14 transition-all duration-700 ease-out lg:grid-cols-[1fr_1.05fr] ${
            heroVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <div className="min-w-0 text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
              ABOUT SHATARUPAX AI LABS
            </span>

            <h1 className="mt-6 text-5xl font-extrabold leading-tight text-black md:text-6xl">
              Built to Make Every Support Call Count
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-xl leading-relaxed text-slate-600 lg:mx-0">
              AI Service Desk helps customer support teams turn call
              recordings into clear transcripts, conversation insights, and
              structured reports — making support conversations easier to
              understand and review.
            </p>

            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
              <Link
                href="/#features"
                className="rounded-lg bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
              >
                Explore Our Platform
              </Link>
              <Link
                href="/#demo"
                className="rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Try Live Demo
              </Link>
            </div>
          </div>

          <AboutHeroVisual />
        </div>
      </section>

      {/* Our Story */}
      <section className="bg-indigo-50/60 px-6 py-24 lg:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-extrabold text-slate-900">
            Our Story
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Support teams handle countless conversations every day, but
            reviewing recordings and organizing useful information can take
            significant effort. AI Service Desk was created to make those
            conversations easier to understand by bringing transcription,
            conversation analysis, and reporting into one streamlined
            experience.
          </p>
        </Reveal>

        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
          {storySteps.map((step, i) => {
            const Icon = step.icon;
            return (
              <Reveal key={step.title} delay={i * 100}>
                <div className="relative text-center">
                  {i < storySteps.length - 1 && (
                    <MdArrowForward className="absolute top-8 -right-4 hidden -translate-y-1/2 text-xl text-blue-300 sm:block" />
                  )}
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <Icon className="text-2xl text-blue-600" />
                  </div>
                  <h3 className="mt-5 text-base font-bold text-slate-900">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600">{step.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* What We Do */}
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-extrabold text-slate-900">
            What We Do
          </h2>
          <p className="mt-4 text-slate-600">
            A focused set of capabilities built around understanding support
            conversations — not a sprawling feature list.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {whatWeDo.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delay={i * 80}>
                <div className="h-full rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                    <Icon className="text-2xl text-blue-600" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {item.desc}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Our Approach */}
      <section className="bg-indigo-50/60 px-6 py-24 lg:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-extrabold text-slate-900">
            AI That Supports Human Understanding
          </h2>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-6xl gap-8 md:grid-cols-3">
          {approachPrinciples.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delay={i * 100}>
                <div className="h-full rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100">
                    <Icon className="text-2xl text-violet-600" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {item.desc}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Mission / Vision */}
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <div className="grid gap-6 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-3xl border border-blue-100 bg-blue-50 p-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10">
                <MdFlag className="text-3xl text-blue-600" />
              </div>
              <h3 className="mt-6 text-2xl font-extrabold text-slate-900">
                Our Mission
              </h3>
              <p className="mt-4 leading-relaxed text-slate-700">
                Help support teams turn customer conversations into clear,
                useful information without adding unnecessary complexity to
                their workflow.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="h-full rounded-3xl border border-violet-100 bg-violet-50 p-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/10">
                <MdExplore className="text-3xl text-violet-600" />
              </div>
              <h3 className="mt-6 text-2xl font-extrabold text-slate-900">
                Our Vision
              </h3>
              <p className="mt-4 leading-relaxed text-slate-700">
                Make conversation intelligence more accessible so businesses
                can better understand customer needs, review service
                interactions, and improve support processes.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-indigo-50 px-6 py-24 text-center lg:px-10">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-4xl font-extrabold text-slate-900">
            Ready to Understand Your Support Conversations Better?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-600">
            Explore how AI Service Desk can help organize call recordings
            into clearer, more useful insights.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/#demo"
              className="rounded-lg bg-violet-600 px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-700"
            >
              Try Live Demo
            </Link>
            <Link
              href="/#features"
              className="rounded-lg border border-slate-200 px-7 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Explore Features
            </Link>
          </div>
        </Reveal>
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
