"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Logo from "@/components/Logo";
import {
  MdMic,
  MdAnalytics,
  MdPictureAsPdf,
  MdLocationOn,
  MdEmail,
  MdPhone,
  MdAutoAwesome,
  MdCheckCircle,
  MdAutorenew,
  MdRadioButtonUnchecked,
  MdUploadFile,
  MdGraphicEq,
  MdPsychology,
  MdSummarize,
  MdChecklist,
  MdRecordVoiceOver,
  MdVerified,
  MdHistory,
  MdSpeed,
  MdInsights,
  MdSchool,
  MdFactCheck,
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

// A small horizontal score bar matching the report's own visual language
// (same idea as the PDF's ScoreBar) — purely illustrative here, fed fixed
// example numbers, never real report data.
function MiniScoreBar({ label, value, color }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className={`font-bold ${color.text}`}>{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${color.bar}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// Cycles the demo card through upload -> generate -> done, looping, so the
// card feels alive rather than a frozen screenshot. Purely a UI animation —
// no file is ever actually uploaded or processed.
const DEMO_PHASES = [
  ["uploading", 1500],
  ["generating", 1800],
  ["done", 3200],
];

function useDemoCycle() {
  const [phase, setPhase] = useState(DEMO_PHASES[0][0]);

  useEffect(() => {
    let index = 0;
    let timer;
    const advance = () => {
      setPhase(DEMO_PHASES[index][0]);
      timer = setTimeout(() => {
        index = (index + 1) % DEMO_PHASES.length;
        advance();
      }, DEMO_PHASES[index][1]);
    };
    advance();
    return () => clearTimeout(timer);
  }, []);

  return phase;
}

// One row of the upload/generate sequence: pending (grey, hollow dot),
// in-progress (spinning icon) or complete (green check) — driven entirely
// by `state`, never by anything resembling a real upload result.
function DemoStepRow({ icon: Icon, label, state }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs transition-colors ${
        state === "pending" ? "bg-slate-50/60" : "bg-slate-50"
      }`}
    >
      <Icon
        className={`shrink-0 ${
          state === "pending" ? "text-slate-300" : "text-slate-400"
        }`}
      />
      <span
        className={`min-w-0 flex-1 truncate font-medium ${
          state === "pending" ? "text-slate-400" : "text-slate-600"
        }`}
      >
        {label}
      </span>
      {state === "active" && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-blue-600">
          <MdAutorenew className="animate-spin text-sm" />
          {label === "support_call_recording.mp3" ? "Uploading" : "Generating"}
        </span>
      )}
      {state === "done" && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600">
          <MdCheckCircle className="text-sm" />
          {label === "support_call_recording.mp3" ? "Uploaded" : "Done"}
        </span>
      )}
      {state === "pending" && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-300">
          <MdRadioButtonUnchecked className="text-sm" />
          Waiting
        </span>
      )}
    </div>
  );
}

// Static, hand-written example report preview for the hero's right column.
// IMPORTANT: this is illustrative only — "how it works" — no audio is
// uploaded or processed to produce it. The badge always says SAMPLE (never
// "live") so it's never mistaken for a real, user-generated result — only
// its visual size/placement, and the animated upload/generate sequence
// below, are modelled on a live-demo-style card.
function SampleReportCard() {
  const phase = useDemoCycle();
  const uploadState = phase === "uploading" ? "active" : "done";
  const generateState =
    phase === "uploading" ? "pending" : phase === "generating" ? "active" : "done";

  return (
    <div className="min-w-0">
      <div className="relative mx-auto w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xl shadow-indigo-900/10 backdrop-blur-sm sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600">
              <MdAutoAwesome className="text-base text-white" />
            </span>
            <span className="text-sm font-bold text-slate-900">
              AI Call Report
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold tracking-wide text-violet-700">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-600" />
            </span>
            SAMPLE
          </span>
        </div>

        {/* Animated "how it works" sequence — cycles upload -> generate ->
            done on a loop. Illustrative only: not a real upload control and
            not the result of real processing. */}
        <div className="mt-5">
          <DemoStepRow icon={MdMic} label="support_call_recording.mp3" state={uploadState} />
          <div className="my-1.5 ml-5 h-3 w-px bg-slate-200" />
          <DemoStepRow icon={MdPictureAsPdf} label="Report generated" state={generateState} />
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs">
          <span className="font-semibold text-slate-700">CALL-204</span>
          <span className="text-slate-400">14 min · Billing support</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Sentiment
            </p>
            <p className="mt-1 text-sm font-bold text-emerald-600">
              Positive
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Confidence
            </p>
            <p className="mt-1 text-sm font-bold text-violet-600">93/100</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <MiniScoreBar
            label="Customer Experience"
            value={90}
            color={{ text: "text-emerald-600", bar: "bg-emerald-500" }}
          />
          <MiniScoreBar
            label="Agent Performance"
            value={95}
            color={{ text: "text-emerald-600", bar: "bg-emerald-500" }}
          />
        </div>

        <p className="mt-5 line-clamp-3 text-sm italic leading-relaxed text-slate-500">
          &ldquo;The customer reported a duplicate charge on their invoice.
          The agent verified the transaction, issued a refund, and confirmed
          the resolution before ending the call.&rdquo;
        </p>

        <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
          <div className="flex items-start gap-2 text-sm text-slate-600">
            <MdCheckCircle className="mt-0.5 shrink-0 text-emerald-500" />
            Refund processed for duplicate charge
          </div>
          <div className="flex items-start gap-2 text-sm text-slate-600">
            <MdCheckCircle className="mt-0.5 shrink-0 text-emerald-500" />
            Follow-up email sent confirming resolution
          </div>
        </div>

        <Link
          href="/register"
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-violet-600/20 transition hover:opacity-90"
        >
          Create a free account to analyze your own calls
        </Link>
      </div>
    </div>
  );
}

const navLinks = [
  { name: "Home", href: "/" },
  { name: "About Us", href: "/about" },
  { name: "Contact Us", href: "/contact" },
];

// Every description below maps to a real, implemented capability (Whisper
// transcription, the Groq-based call-analysis pipeline, the AutoQA scorecard,
// and the reports/library endpoints) — nothing here is aspirational. Card
// copy is deliberately scoped to what the pipeline actually returns: e.g.
// "Speaker & Conversation Insights" only claims per-moment timestamps and
// speaker attribution (what critical_conversation_moments actually provides),
// not full diarization, talk-time, or interruption metrics, which the
// backend does not compute.
const features = [
  {
    icon: MdMic,
    title: "AI Audio Transcription",
    desc: "Convert supported call recordings into readable text, making conversations easier to review, search, and document.",
  },
  {
    icon: MdAnalytics,
    title: "Customer Sentiment Analysis",
    desc: "Surface sentiment signals from the conversation to help spot where customers seemed satisfied, confused, or frustrated — presented as an AI estimate, not a guarantee.",
  },
  {
    icon: MdSummarize,
    title: "AI Call Summaries",
    desc: "Get a concise summary covering why the customer called, what was discussed, and how the call was resolved.",
  },
  {
    icon: MdChecklist,
    title: "Key Issues & Action Items",
    desc: "Automatically extract the customer's main concerns and the follow-up actions and commitments made during the call.",
  },
  {
    icon: MdRecordVoiceOver,
    title: "Critical Moment Timestamps",
    desc: "Notable moments in the conversation are timestamped and attributed to the customer or agent, so you can jump straight to what matters.",
  },
  {
    icon: MdPictureAsPdf,
    title: "Downloadable PDF Reports",
    desc: "Every completed analysis is available as a structured, downloadable PDF report you can share or archive.",
  },
  {
    icon: MdVerified,
    title: "Call Quality Scoring",
    desc: "An AI-assisted scorecard rates customer experience and agent performance against a fixed set of criteria, to help surface coaching opportunities.",
  },
  {
    icon: MdHistory,
    title: "Call History & Reports",
    desc: "Revisit past analyses, open any completed report, and track your own call history — scoped to your account.",
  },
];

const howItWorksSteps = [
  {
    icon: MdUploadFile,
    title: "Upload Recording",
    desc: "Select a supported call recording to analyze.",
  },
  {
    icon: MdGraphicEq,
    title: "AI Transcription",
    desc: "The recording is converted into readable text.",
  },
  {
    icon: MdPsychology,
    title: "Analyze Conversation",
    desc: "Supported insights, summaries, and sentiment signals are extracted.",
  },
  {
    icon: MdPictureAsPdf,
    title: "Generate Report",
    desc: "Review the results and download the report.",
  },
];

const businessBenefits = [
  {
    icon: MdSpeed,
    title: "Reduce Manual Review",
    desc: "Transcripts and summaries make it easier to review lengthy recordings without listening to every minute.",
  },
  {
    icon: MdInsights,
    title: "Understand Customer Concerns",
    desc: "Surface recurring issues and sentiment signals across analyzed conversations.",
  },
  {
    icon: MdSchool,
    title: "Support Agent Coaching",
    desc: "Help managers identify conversations that may benefit from additional review or training.",
  },
  {
    icon: MdFactCheck,
    title: "Improve Documentation",
    desc: "Keep available call information organized into consistent reports and follow-up actions.",
  },
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
        <div className="mx-auto grid max-w-7xl grid-cols-2 items-center px-3 py-0 lg:grid-cols-3 lg:px-6">
          <div className="flex items-center">
            <Logo height={100} />
          </div>

          <nav className="hidden items-center justify-center gap-10 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[19px] font-bold text-slate-800 transition-colors hover:text-blue-600"
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
      <section id="demo" className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-purple-50 px-6 py-10 lg:px-10 lg:py-16">
        <div
          className={`mx-auto grid max-w-7xl grid-cols-1 items-start gap-14 transition-all duration-700 ease-out lg:grid-cols-[1fr_1.05fr] ${
            heroVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          {/* Left: marketing content. min-w-0 matters here: a grid item's
              default min-width is "auto" (sized to its content), which lets
              a wide child force the whole grid wider than the viewport on
              narrow screens — min-w-0 lets it shrink and wrap properly. */}
          <div className="min-w-0 text-center lg:text-left">
            <h1 className="text-6xl font-extrabold leading-tight text-black md:text-7xl">
              Understand Every Call Automatically.
            </h1>

            <p className="mx-auto mt-8 max-w-xl text-xl leading-relaxed text-slate-600 lg:mx-0">
              AI Service Desk turns raw customer support call recordings into
              accurate transcripts, sentiment insights, and polished PDF
              reports — so your team spends less time reviewing calls and
              more time acting on what actually matters.
            </p>

            <div className="mt-14 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
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

          {/* Right: static sample report preview (illustrative only — no
              real audio is uploaded or processed here; see SampleReportCard) */}
          <SampleReportCard />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold tracking-wider text-violet-700">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
            AI-POWERED CALL INTELLIGENCE
          </span>
          <h2 className="mt-6 text-4xl font-extrabold text-slate-900">
            Everything You Need for Smarter Customer Support
          </h2>
          <p className="mt-4 text-slate-600">
            Turn customer support recordings into searchable transcripts,
            meaningful insights, and structured reports that help your team
            understand conversations and improve service quality.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.title} delay={i * 80}>
                <div className="h-full rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                    <Icon className="text-2xl text-blue-600" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {feature.desc}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-indigo-50/60 px-6 py-24 lg:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-xs font-bold tracking-wider text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            HOW IT WORKS
          </span>
          <h2 className="mt-6 text-4xl font-extrabold text-slate-900">
            From Recording to Report in Four Steps
          </h2>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-6xl gap-8 md:grid-cols-4">
          {howItWorksSteps.map((step, i) => {
            const Icon = step.icon;
            return (
              <Reveal key={step.title} delay={i * 100}>
                <div className="relative text-center">
                  {i < howItWorksSteps.length - 1 && (
                    <div className="absolute top-8 left-1/2 hidden h-px w-full -translate-y-1/2 bg-slate-200 md:block" />
                  )}
                  <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <Icon className="text-2xl text-blue-600" />
                    <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
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

      {/* Business Benefits */}
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-extrabold text-slate-900">
            From Raw Conversations to Actionable Insights
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {businessBenefits.map((benefit, i) => {
            const Icon = benefit.icon;
            return (
              <Reveal key={benefit.title} delay={i * 80}>
                <div className="h-full rounded-2xl border border-slate-100 bg-white p-7 text-center shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100">
                    <Icon className="text-2xl text-violet-600" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {benefit.desc}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-indigo-50 px-6 py-24 text-center lg:px-10">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-4xl font-extrabold text-slate-900">
            Ready to Understand Every Call?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-600">
            Create a free account and turn your next support recording into a
            transcript, summary, and report.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="rounded-lg bg-violet-600 px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-700"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-slate-200 px-7 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Login
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
