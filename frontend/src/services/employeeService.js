import api from "./api";


/*
|--------------------------------------------------------------------------
| Employee Dashboard APIs
|--------------------------------------------------------------------------
*/


export const getDashboard = async () => {

    const response = await api.get(
        "/employee/dashboard"
    );

    return response.data;

};


/*
|--------------------------------------------------------------------------
| Employee Reports
|--------------------------------------------------------------------------
*/


export const getMyReports = async () => {

    const response = await api.get(
        "/report/my-reports"
    );

    return response.data;

};


export const getReportDetails = async (reportId) => {

    const response = await api.get(
        `/report/${reportId}`
    );

    return response.data;

};


export const downloadReport = async (reportId) => {

    const response = await api.get(
        `/report/download/${reportId}`,
        {
            responseType: "blob"
        }
    );

    return response.data;

};


export const deleteReport = async (reportId) => {

    const response = await api.delete(
        `/report/${reportId}`
    );

    return response.data;

};

export const getReportAudio = async (reportId) => {

    const response = await api.get(
        `/report/audio/${reportId}`,
        {
            responseType: "blob"
        }
    );

    return response.data;

};


/*
|--------------------------------------------------------------------------
| Audio Library (store-now, process-later flow)
|--------------------------------------------------------------------------
*/


export const uploadToLibrary = async (files, incidentNumber) => {

    const formData = new FormData();

    files.forEach((file) => {

        formData.append("files", file);

    });

    if (incidentNumber) {

        formData.append("incident_number", incidentNumber);

    }

    const response = await api.post(

        "/upload/library",

        formData,

        {

            headers: {

                "Content-Type": "multipart/form-data"

            },

            timeout: 60000 // storing only, should be fast

        }

    );

    return response.data;

};


export const getAudioLibrary = async (pendingOnly = false) => {

    const response = await api.get(

        "/upload/library",

        {

            params: {

                pending_only: pendingOnly

            }

        }

    );

    return response.data;

};


export const generateReportFromLibrary = async (recordId) => {

    // Only STARTS the pipeline — it runs in the background and this
    // request returns almost immediately. Poll getUploadStatus() for the
    // outcome instead of waiting on this call.
    const response = await api.post(
        `/upload/library/${recordId}/generate`,
        {}
    );

    return response.data;

};


/*
|--------------------------------------------------------------------------
| Processing status polling
|--------------------------------------------------------------------------
| The upload/generate endpoints above only START the AI pipeline; these
| poll its progress. See backend/app/api/upload.py's status endpoints.
*/


export const getUploadStatus = async (reportId) => {

    const response = await api.get(
        `/upload/status/${reportId}`
    );

    return response.data;

};


export const getUploadStatuses = async (reportIds) => {

    const response = await api.get(
        "/upload/status",
        {
            params: {
                ids: reportIds.join(",")
            }
        }
    );

    return response.data;

};


/*
|--------------------------------------------------------------------------
| Email delivery (see backend services/email_delivery.py)
|--------------------------------------------------------------------------
*/


export const resendReportEmail = async (reportId) => {

    const response = await api.post(
        `/report/${reportId}/resend-email`
    );

    return response.data;

};