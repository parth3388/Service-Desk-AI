
let pendingUpload = null;

export const setPendingFiles = (mode, files) => {

    pendingUpload = {
        kind: "files",
        mode,
        files
    };

};

export const setPendingLibraryGenerate = (recordId) => {

    pendingUpload = {
        kind: "library",
        recordId
    };

};

export const getPendingUpload = () => {

    return pendingUpload;

};

export const clearPendingUpload = () => {

    pendingUpload = null;

};