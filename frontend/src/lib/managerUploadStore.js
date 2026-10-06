let pendingManagerUpload = null;

export const setPendingManagerUpload = (employeeId, files) => {
    pendingManagerUpload = { employeeId, files };
};

export const getPendingManagerUpload = () => {
    return pendingManagerUpload;
};

export const clearPendingManagerUpload = () => {
    pendingManagerUpload = null;
};