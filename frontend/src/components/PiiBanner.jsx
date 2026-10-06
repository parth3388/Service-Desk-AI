"use client";

import { FiShieldOff } from "react-icons/fi";

import { summarizePiiFindings } from "../lib/qaDisplay.mjs";

/**
 * Tells the viewer that sensitive data was detected and redacted before the
 * transcript reached the AI (Pillar 2 requires the UI to indicate this).
 * Renders nothing when no PII was found.
 */
export default function PiiBanner({ piiDetected, piiFindings }) {
    if (!piiDetected) return null;

    const summary = summarizePiiFindings(piiFindings);

    return (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-amber-800">
            <FiShieldOff size={20} className="shrink-0" />
            <p className="text-sm">
                Sensitive data was detected in this call and redacted before analysis
                {summary ? ` (${summary})` : ""}. The AI never saw the original values.
            </p>
        </div>
    );
}
