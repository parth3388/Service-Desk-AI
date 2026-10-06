import api from "./api";


/*
|--------------------------------------------------------------------------
| Manager Dashboard
|--------------------------------------------------------------------------
*/

export const getManagerDashboard = async () => {

    const response = await api.get(
        "/manager/dashboard"
    );

    return response.data;

};


/*
|--------------------------------------------------------------------------
| Employees
|--------------------------------------------------------------------------
*/

export const getEmployees = async () => {

    const response = await api.get(
        "/manager/employees"
    );

    return response.data;

};


/*
|--------------------------------------------------------------------------
| Reports
|--------------------------------------------------------------------------
*/

export const getCompanyReports = async () => {

    const response = await api.get(
        "/manager/reports"
    );

    return response.data;

};


export const getCompanyReport = async (reportId) => {

    const response = await api.get(
        `/manager/report/${reportId}`
    );

    return response.data;

};
/*
|--------------------------------------------------------------------------
| Download Company Report
|--------------------------------------------------------------------------
*/

export const downloadCompanyReport = async (reportId) => {

    const response = await api.get(

        `/report/download/${reportId}`,

        {

            responseType: "blob"

        }

    );

    return response.data;

};
export const deleteCompanyReport = async (reportId) => {

    const response = await api.delete(
        `/manager/report/${reportId}`
    );

    return response.data;

};
/*
|--------------------------------------------------------------------------
| Delete Employee
|--------------------------------------------------------------------------
*/
export const deleteEmployee = async (employeeId) => {

    const response = await api.delete(`/manager/employee/${employeeId}`);

    return response.data;

};
export const getEmployeesList = async () => {
    const response = await api.get("/manager/employees/list");
    return response.data;
};

export const generateReportForEmployee = async (employeeId, files) => {
    const formData = new FormData();
    formData.append("employee_id", employeeId);
    files.forEach((f) => formData.append("files", f));

    // Only STARTS the pipeline for each file — it runs in the background
    // and this request returns almost immediately. Poll getUploadStatuses()
    // for the outcome instead of waiting on this call.
    const response = await api.post(
        "/upload/manager/audio",
        formData,
        {
            headers: { "Content-Type": "multipart/form-data" }
        }
    );

    return response.data;
};


/*
|--------------------------------------------------------------------------
| Processing status polling — see backend/app/api/upload.py
|--------------------------------------------------------------------------
*/

export const getUploadStatus = async (reportId) => {
    const response = await api.get(`/upload/status/${reportId}`);
    return response.data;
};

export const getUploadStatuses = async (reportIds) => {
    const response = await api.get("/upload/status", {
        params: { ids: reportIds.join(",") }
    });
    return response.data;
};