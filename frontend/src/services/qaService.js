import api from "./api";


/*
|--------------------------------------------------------------------------
| AutoQA (Pillar 3/4) — see backend/app/api/qa.py
|--------------------------------------------------------------------------
*/

export const getQaEvaluation = async (reportId) => {
    const response = await api.get(`/qa/evaluations/${reportId}`);
    return response.data;
};

export const getQaEvaluationHistory = async (reportId) => {
    const response = await api.get(`/qa/evaluations/${reportId}/history`);
    return response.data;
};

export const getQaEvaluationVersion = async (reportId, evaluationId) => {
    const response = await api.get(`/qa/evaluations/${reportId}/versions/${evaluationId}`);
    return response.data;
};

export const rerunQaEvaluation = async (reportId) => {
    const response = await api.post(`/qa/evaluations/${reportId}/rerun`);
    return response.data;
};

export const overrideQaCriterion = async (reportId, criterionResultId, payload) => {
    const response = await api.put(
        `/qa/evaluations/${reportId}/criteria/${criterionResultId}`,
        payload
    );
    return response.data;
};

export const getQaCalibration = async () => {
    const response = await api.get("/qa/calibration");
    return response.data;
};

export const getQaScorecard = async () => {
    const response = await api.get("/qa/scorecard");
    return response.data;
};
