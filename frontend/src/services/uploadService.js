import api from "./api";

/*
|--------------------------------------------------------------------------
| Upload Service
|--------------------------------------------------------------------------
| Handles audio file uploads for call analysis.
|
| NOTE: The endpoint below ("/api/upload") is a placeholder based on your
| backend folder structure (backend/app/api/upload.py). Please confirm the
| exact route path and the expected form field name against your actual
| upload.py router — adjust UPLOAD_ENDPOINT / the FormData key below if
| they differ.
*/

const UPLOAD_ENDPOINT = "/api/upload";

/**
 * Upload a single audio file.
 * @param {File} file - the audio file selected/dropped by the user
 * @param {(percent: number) => void} [onProgress] - optional progress callback (0-100)
 * @returns {Promise<object>} the created upload record from the backend
 */
export async function uploadAudioFile(file, onProgress) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post(UPLOAD_ENDPOINT, formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (event) => {
            if (onProgress && event.total) {
                const percent = Math.round((event.loaded * 100) / event.total);
                onProgress(percent);
            }
        },
    });

    return response.data;
}

/**
 * Upload multiple audio files sequentially, reporting per-file progress.
 * @param {File[]} files
 * @param {(fileIndex: number, percent: number) => void} [onProgress]
 * @returns {Promise<object[]>} array of created upload records, same order as input
 */
export async function uploadAudioFiles(files, onProgress) {
    const results = [];

    for (let i = 0; i < files.length; i++) {
        const result = await uploadAudioFile(files[i], (percent) => {
            if (onProgress) onProgress(i, percent);
        });
        results.push(result);
    }

    return results;
}

const uploadService = {
    uploadAudioFile,
    uploadAudioFiles,
};

export default uploadService;