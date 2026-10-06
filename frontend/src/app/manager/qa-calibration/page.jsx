"use client";

import { useEffect, useState } from "react";
import { FiCheckCircle, FiFlag, FiXCircle } from "react-icons/fi";

import DashboardLayout from "../../../components/DashboardLayout";
import StatCard from "../../../components/StatCard";

import { getQaCalibration } from "../../../services/qaService";
import { getErrorMessage } from "../../../lib/apiError.mjs";
import { describeCalibration } from "../../../lib/qaDisplay.mjs";

export default function QaCalibrationPage() {

    const [calibration, setCalibration] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function load() {
            try {
                const data = await getQaCalibration();
                setCalibration(data.calibration);
            } catch (err) {
                setError(getErrorMessage(err, "Unable to load calibration data."));
            } finally {
                setLoading(false);
            }
        }

        load();
    }, []);

    return (
        <DashboardLayout title="QA Calibration">

            <h1 className="text-4xl font-bold text-slate-900">AI vs. Human Calibration</h1>
            <p className="mt-2 text-slate-500">
                How often human review agrees with AutoQA&apos;s scores, based on criteria a
                manager has actually reviewed.
            </p>

            {loading && <p className="mt-8 text-slate-500">Loading...</p>}

            {error && <p className="mt-8 text-red-600">{error}</p>}

            {!loading && !error && calibration && (
                <>
                    <p className="mt-6 text-lg font-medium text-slate-700">
                        {describeCalibration(calibration)}
                    </p>

                    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
                        <StatCard
                            title="Criteria Reviewed"
                            value={calibration.override_count}
                            icon={<FiFlag />}
                            color="blue"
                        />
                        <StatCard
                            title="Agreement Rate"
                            value={
                                calibration.insufficient_data
                                    ? "N/A"
                                    : `${Math.round(calibration.agreement_rate * 100)}%`
                            }
                            icon={<FiCheckCircle />}
                            color="green"
                        />
                        <StatCard
                            title="Critical Fail Disagreements"
                            value={
                                calibration.insufficient_data
                                    ? "N/A"
                                    : calibration.critical_fail_disagreement_count
                            }
                            icon={<FiXCircle />}
                            color="red"
                        />
                    </div>

                    {calibration.insufficient_data && (
                        <p className="mt-6 text-sm text-slate-400">
                            Calibration fills in as managers override AutoQA criteria on
                            individual reports.
                        </p>
                    )}
                </>
            )}

        </DashboardLayout>
    );
}
