/*
|--------------------------------------------------------------------------
| API error normalization
|--------------------------------------------------------------------------
| FastAPI returns `detail` as a string for HTTPException, but as an ARRAY of
| objects ({ loc, msg, type, ... }) for 422 validation errors. Rendering that
| array in JSX throws "Objects are not valid as a React child". Everything
| that shows an API error to the user goes through here so it is always a
| plain string.
*/

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

const cleanMessage = (message) =>
    String(message)
        .replace(/^value error,\s*/i, "")
        .trim();

const fieldLabel = (loc) => {

    if (!Array.isArray(loc)) return "";

    const field = [...loc]
        .reverse()
        .find((part) => typeof part === "string" && part !== "body");

    if (!field) return "";

    return field.replace(/_/g, " ");

};

export function normalizeApiDetail(detail, fallback = DEFAULT_MESSAGE) {

    if (typeof detail === "string") {
        return detail.trim() || fallback;
    }

    if (Array.isArray(detail)) {

        const messages = detail
            .map((item) => {

                if (typeof item === "string") return cleanMessage(item);

                if (item && typeof item === "object") {

                    const text = cleanMessage(item.msg ?? item.message ?? "");

                    if (!text) return "";

                    const label = fieldLabel(item.loc);

                    return label ? `${label}: ${text}` : text;

                }

                return "";

            })
            .filter(Boolean);

        return messages.length ? messages.join(" • ") : fallback;

    }

    if (detail && typeof detail === "object") {

        const text = detail.msg ?? detail.message ?? detail.detail;

        return typeof text === "string" && text.trim()
            ? cleanMessage(text)
            : fallback;

    }

    return fallback;

}

/**
 * Turn any thrown axios/fetch error into a user-facing string.
 */
export function getErrorMessage(error, fallback = DEFAULT_MESSAGE) {

    const response = error?.response;

    if (response) {

        // responseType "blob" errors carry a Blob, not JSON — nothing to read.
        return normalizeApiDetail(response.data?.detail, fallback);

    }

    if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
        return "The request timed out. Please try again.";
    }

    if (error?.request) {
        return "Unable to reach the server. Check your connection and try again.";
    }

    if (typeof error?.message === "string" && error.message.trim() && !error.isAxiosError) {
        return error.message;
    }

    return fallback;

}

/**
 * True only when the server said the session itself is bad (expired token,
 * deleted / deactivated user). Network errors, timeouts and 5xx responses
 * are NOT auth failures and must not log the user out.
 */
export function isAuthFailure(error) {

    const status = error?.response?.status;

    return status === 401 || status === 403;

}
