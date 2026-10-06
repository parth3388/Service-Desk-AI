"use client";

import { useEffect, useState } from "react";
import {
    FiAlertTriangle,
    FiCheckCircle,
    FiChevronDown,
    FiFlag,
    FiRefreshCw,
    FiXCircle
} from "react-icons/fi";

import {
    getQaEvaluation,
    getQaEvaluationHistory,
    getQaEvaluationVersion,
    overrideQaCriterion,
    rerunQaEvaluation
} from "../services/qaService";
import { getErrorMessage } from "../lib/apiError.mjs";
import {
    buildOverridePayload,
    effectiveCriterionPass,
    effectiveCriterionScore,
    effectiveTotalScore,
    evidenceIsTrustworthy,
    validateOverrideForm
} from "../lib/qaDisplay.mjs";

/**
 * AutoQA scorecard: AI evidence-linked scores, plus (when `canOverride`)
 * inline human review controls. Used read-only on the employee report page
 * and editable on the manager report page — one component, one contract
 * with the backend (backend/app/api/qa.py), so the two views can't drift.
 */
export default function AutoQaPanel({ reportId, canOverride = false }) {

    const [evaluation, setEvaluation] = useState(undefined); // undefined = loading, null = none yet
    const [history, setHistory] = useState([]);
    const [viewingId, setViewingId] = useState(null); // null = always show the latest
    const [error, setError] = useState(null);
    const [rerunning, setRerunning] = useState(false);
    const [switchingVersion, setSwitchingVersion] = useState(false);
    const [expandedCriterion, setExpandedCriterion] = useState(null);
    const [drafts, setDrafts] = useState({});
    const [savingId, setSavingId] = useState(null);

    useEffect(() => {
        async function load() {
            try {
                const [evalData, historyData] = await Promise.all([
                    getQaEvaluation(reportId),
                    getQaEvaluationHistory(reportId)
                ]);
                setEvaluation(evalData.evaluation);
                setHistory(historyData.history || []);
                setViewingId(null);
            } catch (err) {
                setError(getErrorMessage(err, "Unable to load the AutoQA evaluation."));
                setEvaluation(null);
            }
        }

        load();
    }, [reportId]);

    const viewVersion = async (evaluationId) => {
        // Empty string from the <select> means "latest".
        if (!evaluationId) {
            setViewingId(null);
            try {
                const data = await getQaEvaluation(reportId);
                setEvaluation(data.evaluation);
            } catch (err) {
                setError(getErrorMessage(err, "Unable to load the AutoQA evaluation."));
            }
            return;
        }

        setSwitchingVersion(true);
        setError(null);

        try {
            const data = await getQaEvaluationVersion(reportId, Number(evaluationId));
            setEvaluation(data.evaluation);
            setViewingId(Number(evaluationId));
        } catch (err) {
            setError(getErrorMessage(err, "Unable to load that evaluation version."));
        } finally {
            setSwitchingVersion(false);
        }
    };

    const handleRerun = async () => {
        setRerunning(true);
        setError(null);
        try {
            const data = await rerunQaEvaluation(reportId);
            setEvaluation(data.evaluation);
            setViewingId(null);
            setDrafts({});

            const historyData = await getQaEvaluationHistory(reportId);
            setHistory(historyData.history || []);
        } catch (err) {
            setError(getErrorMessage(err, "Unable to run AutoQA for this report."));
        } finally {
            setRerunning(false);
        }
    };

    const draftFor = (criterion) =>
        drafts[criterion.criterion_result_id] || {
            human_score: criterion.human_score ?? "",
            human_comment: criterion.human_comment ?? "",
            disputed: criterion.disputed ?? false
        };

    const updateDraft = (criterionResultId, patch) => {
        setDrafts((prev) => ({
            ...prev,
            [criterionResultId]: { ...draftFor({ criterion_result_id: criterionResultId, ...prev[criterionResultId] }), ...patch }
        }));
    };

    const saveOverride = async (criterion) => {
        const draft = draftFor(criterion);
        const errors = validateOverrideForm(draft);

        if (errors.length > 0) {
            setError(errors.join(" "));
            return;
        }

        setSavingId(criterion.criterion_result_id);
        setError(null);

        try {
            const payload = buildOverridePayload(draft);
            const data = await overrideQaCriterion(reportId, criterion.criterion_result_id, payload);
            setEvaluation(data.evaluation);

            const historyData = await getQaEvaluationHistory(reportId);
            setHistory(historyData.history || []);
        } catch (err) {
            setError(getErrorMessage(err, "Unable to save this override."));
        } finally {
            setSavingId(null);
        }
    };

    if (evaluation === undefined) {
        return (
            <div className="mt-8 rounded-2xl bg-white p-8 shadow">
                <p className="text-slate-500">Loading AutoQA evaluation...</p>
            </div>
        );
    }

    if (evaluation === null) {
        return (
            <div className="mt-8 rounded-2xl bg-white p-8 shadow">
                <h2 className="text-2xl font-bold">AutoQA Evaluation</h2>
                <p className="mt-4 text-slate-500">
                    AutoQA has not run for this report yet.
                </p>
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                {canOverride && (
                    <button
                        onClick={handleRerun}
                        disabled={rerunning}
                        className="mt-5 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                        <FiRefreshCw className={rerunning ? "animate-spin" : ""} size={16} />
                        {rerunning ? "Running..." : "Run AutoQA"}
                    </button>
                )}
            </div>
        );
    }

    const totalScore = effectiveTotalScore(evaluation);

    return (
        <div className="mt-8 rounded-2xl bg-white p-8 shadow">

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold">AutoQA Evaluation</h2>
                    <p className="text-slate-500">{evaluation.scorecard_name}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">

                    {history.length > 1 && (
                        <select
                            value={viewingId ?? ""}
                            onChange={(e) => viewVersion(e.target.value)}
                            disabled={switchingVersion}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600"
                        >
                            {history
                                .slice()
                                .reverse()
                                .map((h) => (
                                    <option key={h.id} value={h.is_latest ? "" : h.id}>
                                        Version {h.version_number}
                                        {h.is_latest ? " (current)" : ""}
                                        {h.overridden ? " · reviewed" : ""}
                                    </option>
                                ))}
                        </select>
                    )}

                    {canOverride && (
                        <button
                            onClick={handleRerun}
                            disabled={rerunning}
                            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                            <FiRefreshCw className={rerunning ? "animate-spin" : ""} size={14} />
                            {rerunning ? "Running..." : "Re-run AutoQA"}
                        </button>
                    )}

                </div>
            </div>

            {viewingId !== null && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
                    <FiFlag size={14} />
                    Viewing version {evaluation.version_number} — not the current evaluation.
                </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {evaluation.status === "FAILED" && (
                <div className="mt-5 flex items-center gap-3 rounded-xl bg-red-50 p-4 text-red-700">
                    <FiXCircle size={20} />
                    <p>{evaluation.error_reason || "AutoQA evaluation failed."}</p>
                </div>
            )}

            {evaluation.status === "COMPLETED" && (
                <>
                    <div className="mt-6 flex flex-wrap items-center gap-4">
                        <div className="rounded-xl bg-slate-50 px-5 py-3">
                            <p className="text-xs text-slate-400">Deterministic weighted score</p>
                            <p className="text-2xl font-bold text-slate-800">
                                {totalScore !== null ? totalScore.toFixed(1) : "N/A"}
                                <span className="text-sm font-normal text-slate-400"> / 100</span>
                            </p>
                        </div>

                        <span
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${evaluation.ai_passed === false
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-700"
                                }`}
                        >
                            {evaluation.ai_passed === false ? <FiXCircle size={14} /> : <FiCheckCircle size={14} />}
                            {evaluation.ai_passed === false ? "Critical failure" : "No critical failure"}
                        </span>

                        {evaluation.overridden && (
                            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-700">
                                <FiFlag size={14} /> Human-reviewed
                            </span>
                        )}
                    </div>

                    <div className="mt-8 space-y-6">
                        {evaluation.sections.map((section) => (
                            <div key={section.id}>
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-slate-800">{section.name}</h3>
                                    <span className="text-sm text-slate-400">{section.weight_pct}% of score</span>
                                </div>

                                <div className="space-y-3">
                                    {section.criteria.map((criterion) => {
                                        const isOpen = expandedCriterion === criterion.criterion_result_id;
                                        const score = effectiveCriterionScore(criterion);
                                        const pass = effectiveCriterionPass(criterion);
                                        const trustworthy = evidenceIsTrustworthy(criterion);
                                        const draft = draftFor(criterion);

                                        return (
                                            <div
                                                key={criterion.criterion_id}
                                                className="rounded-xl border border-slate-200 p-4"
                                            >
                                                <button
                                                    onClick={() =>
                                                        setExpandedCriterion(isOpen ? null : criterion.criterion_result_id)
                                                    }
                                                    className="flex w-full items-center justify-between gap-4 text-left"
                                                >
                                                    <div>
                                                        <p className="font-medium text-slate-800">
                                                            {criterion.text}
                                                            {criterion.is_critical && (
                                                                <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                                                    CRITICAL
                                                                </span>
                                                            )}
                                                        </p>
                                                        {criterion.is_critical && pass !== null && (
                                                            <p className={`mt-1 text-xs font-semibold ${pass ? "text-emerald-600" : "text-red-600"}`}>
                                                                {pass ? "PASS" : "FAIL"}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="flex shrink-0 items-center gap-3">
                                                        <span className="text-lg font-bold text-slate-700">
                                                            {score !== null ? score.toFixed(0) : "—"}
                                                        </span>
                                                        <FiChevronDown
                                                            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                                                        />
                                                    </div>
                                                </button>

                                                {isOpen && (
                                                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">

                                                        <div>
                                                            <p className="text-xs font-semibold uppercase text-slate-400">Evidence</p>
                                                            {criterion.evidence_quote ? (
                                                                <blockquote className="mt-1 rounded-lg bg-slate-50 p-3 italic text-slate-600">
                                                                    “{criterion.evidence_quote}”
                                                                    {criterion.evidence_segment && (
                                                                        <span className="ml-2 not-italic text-xs text-slate-400">
                                                                            {criterion.evidence_segment}
                                                                        </span>
                                                                    )}
                                                                </blockquote>
                                                            ) : (
                                                                <p className="mt-1 text-slate-400">No evidence returned.</p>
                                                            )}
                                                            {!trustworthy && (
                                                                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                                                                    <FiAlertTriangle size={13} />
                                                                    This quote could not be verified against the transcript — treat with caution.
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div>
                                                            <p className="text-xs font-semibold uppercase text-slate-400">AI rationale</p>
                                                            <p className="mt-1 text-slate-600">
                                                                {criterion.ai_rationale || "No rationale returned."}
                                                            </p>
                                                            {criterion.ai_confidence !== null && (
                                                                <p className="mt-1 text-xs text-slate-400">
                                                                    AI confidence: {criterion.ai_confidence}%
                                                                </p>
                                                            )}
                                                        </div>

                                                        {criterion.overridden && (
                                                            <div className="rounded-lg bg-amber-50 p-3 text-amber-800">
                                                                <p className="text-xs font-semibold uppercase">Human review</p>
                                                                <p className="mt-1">
                                                                    Score: {criterion.human_score ?? "unchanged"}
                                                                    {criterion.disputed && " · Disputed"}
                                                                </p>
                                                                {criterion.human_comment && (
                                                                    <p className="mt-1">{criterion.human_comment}</p>
                                                                )}
                                                            </div>
                                                        )}

                                                        {canOverride && (
                                                            <div className="rounded-lg border border-slate-200 p-3">
                                                                <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
                                                                    Override this score
                                                                </p>

                                                                <div className="flex flex-wrap items-end gap-3">
                                                                    <div>
                                                                        <label className="block text-xs text-slate-500">Score (0-100)</label>
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            max={100}
                                                                            value={draft.human_score}
                                                                            onChange={(e) =>
                                                                                updateDraft(criterion.criterion_result_id, {
                                                                                    human_score: e.target.value
                                                                                })
                                                                            }
                                                                            className="mt-1 w-24 rounded-lg border p-2"
                                                                        />
                                                                    </div>

                                                                    {criterion.is_critical && (
                                                                        <div>
                                                                            <label className="block text-xs text-slate-500">Pass?</label>
                                                                            <select
                                                                                value={
                                                                                    draft.human_pass === true
                                                                                        ? "pass"
                                                                                        : draft.human_pass === false
                                                                                            ? "fail"
                                                                                            : ""
                                                                                }
                                                                                onChange={(e) =>
                                                                                    updateDraft(criterion.criterion_result_id, {
                                                                                        human_pass:
                                                                                            e.target.value === ""
                                                                                                ? null
                                                                                                : e.target.value === "pass"
                                                                                    })
                                                                                }
                                                                                className="mt-1 rounded-lg border p-2"
                                                                            >
                                                                                <option value="">Unchanged</option>
                                                                                <option value="pass">Pass</option>
                                                                                <option value="fail">Fail</option>
                                                                            </select>
                                                                        </div>
                                                                    )}

                                                                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={Boolean(draft.disputed)}
                                                                            onChange={(e) =>
                                                                                updateDraft(criterion.criterion_result_id, {
                                                                                    disputed: e.target.checked
                                                                                })
                                                                            }
                                                                        />
                                                                        Mark as disputed
                                                                    </label>
                                                                </div>

                                                                <textarea
                                                                    placeholder="Evaluator comment"
                                                                    value={draft.human_comment}
                                                                    onChange={(e) =>
                                                                        updateDraft(criterion.criterion_result_id, {
                                                                            human_comment: e.target.value
                                                                        })
                                                                    }
                                                                    className="mt-3 w-full rounded-lg border p-2 text-sm"
                                                                    rows={2}
                                                                />

                                                                <button
                                                                    onClick={() => saveOverride(criterion)}
                                                                    disabled={savingId === criterion.criterion_result_id}
                                                                    className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                                                                >
                                                                    {savingId === criterion.criterion_result_id ? "Saving..." : "Save review"}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
