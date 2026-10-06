"use client";

import { FiFileText, FiCpu, FiFolder, FiCheckCircle } from "react-icons/fi";

export default function CallIllustration({ batch = false, mode = "processing" }) {

    // "summary" mode is used on a finished report (e.g. the Call Summary card) —
    // everything else about the illustration stays identical, only the
    // icon + label change. Existing callers that only pass `batch` are untouched.
    const isSummary = mode === "summary";

    return (

        <div className="relative mx-auto flex h-64 w-64 items-center justify-center">

            <style jsx>{`
                @keyframes floatY {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes waveScale {
                    0%, 100% { transform: scaleY(0.4); }
                    50% { transform: scaleY(1); }
                }
                @keyframes dashMove {
                    to { stroke-dashoffset: -24; }
                }
                @keyframes pulseRing {
                    0% { transform: scale(0.9); opacity: 0.6; }
                    100% { transform: scale(1.4); opacity: 0; }
                }
                .float-icon {
                    animation: floatY 3s ease-in-out infinite;
                }
                .wave-bar {
                    transform-origin: bottom;
                    animation: waveScale 1.1s ease-in-out infinite;
                }
                .dash-line {
                    stroke-dasharray: 6 6;
                    animation: dashMove 1.2s linear infinite;
                }
                .pulse-ring {
                    animation: pulseRing 2s ease-out infinite;
                }
            `}</style>

            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-100 via-blue-50 to-cyan-100" />

            {!isSummary && (
                <div className="pulse-ring absolute h-16 w-16 rounded-full border-2 border-indigo-400" />
            )}

            <div className="relative flex h-36 w-48 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-xl">

                <div className="float-icon absolute -top-6 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg">

                    {

                        isSummary ? (

                            <FiCheckCircle size={20} />

                        ) : batch ? (

                            <FiFolder size={20} />

                        ) : (

                            <FiCpu size={20} />

                        )

                    }

                </div>

                <div className="mt-6 flex items-end gap-1">

                    {

                        [6, 12, 18, 10, 22, 14, 8, 16, 11, 20, 7].map((h, index) => (

                            <div

                                key={index}

                                className="wave-bar w-1 rounded-full bg-gradient-to-b from-indigo-600 to-cyan-500"

                                style={{

                                    height: `${h * 1.4}px`,

                                    animationDelay: `${index * 0.08}s`

                                }}

                            />

                        ))

                    }

                </div>

                <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-400">

                    {isSummary ? "Call Analyzed" : batch ? "Batch Analysis" : "Analyzing Audio"}

                </p>

            </div>

            <svg

                className="absolute bottom-4 left-1/2 h-10 w-40 -translate-x-1/2"

                viewBox="0 0 160 40"

            >

                <path

                    d="M20 20 H140"

                    fill="none"

                    stroke="#c7d2fe"

                    strokeWidth="2"

                    className="dash-line"

                />

            </svg>

            <div className="absolute bottom-0 left-2 flex flex-col items-center gap-1">

                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">

                    <FiFileText size={16} />

                </div>

                <span className="text-[10px] font-medium text-slate-500">Customer</span>

            </div>

            <div className="absolute bottom-0 right-2 flex flex-col items-center gap-1">

                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600">

                    <FiFileText size={16} />

                </div>

                <span className="text-[10px] font-medium text-slate-500">Agent</span>

            </div>

        </div>

    );

}