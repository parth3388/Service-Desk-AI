/*
|--------------------------------------------------------------------------
| Client-side validation
|--------------------------------------------------------------------------
| These constants deliberately mirror the backend (which is authoritative):
|   - backend/app/core/password_policy.py
|   - backend/app/services/upload_validation.py
|   - backend/app/schemas/contact.py
*/

// ---- Password (registration + reset) ------------------------------------

export const PASSWORD_MIN_LENGTH = 8;

// bcrypt only uses the first 72 bytes.
export const PASSWORD_MAX_BYTES = 72;

const utf8Length = (value) => new TextEncoder().encode(value).length;

/** Returns an error message, or null when the password is acceptable. */
export function validatePassword(password) {

    if (typeof password !== "string" || !password.trim()) {
        return "Password must not be empty.";
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
    }

    if (utf8Length(password) > PASSWORD_MAX_BYTES) {
        return `Password must be at most ${PASSWORD_MAX_BYTES} bytes long.`;
    }

    return null;

}

// ---- Audio uploads ------------------------------------------------------

export const ALLOWED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".aac", ".m4a"];

export const ALLOWED_AUDIO_LABEL = "MP3, WAV, AAC, M4A";

export const MAX_UPLOAD_MB = 100;

// Extensions first (reliable), MIME types as a hint for the file picker.
export const AUDIO_ACCEPT = [
    ...ALLOWED_AUDIO_EXTENSIONS,
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/aac",
    "audio/mp4",
    "audio/x-m4a"
].join(",");

const extensionOf = (name) => {

    const dot = typeof name === "string" ? name.lastIndexOf(".") : -1;

    return dot === -1 ? "" : name.slice(dot).toLowerCase();

};

/**
 * Splits a picked file list into files the backend will accept and
 * human-readable problems for the ones it will not.
 */
export function validateAudioFiles(files) {

    const valid = [];
    const errors = [];

    for (const file of Array.from(files || [])) {

        const name = file?.name || "Unnamed file";

        if (!ALLOWED_AUDIO_EXTENSIONS.includes(extensionOf(name))) {
            errors.push(`${name}: unsupported format. Allowed formats: ${ALLOWED_AUDIO_LABEL}.`);
            continue;
        }

        if (!file.size) {
            errors.push(`${name}: the file is empty.`);
            continue;
        }

        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
            errors.push(`${name}: file is too large. Maximum size is ${MAX_UPLOAD_MB} MB.`);
            continue;
        }

        valid.push(file);

    }

    return { valid, errors };

}

// ---- Contact form -------------------------------------------------------

export const CONTACT_LIMITS = {
    name: 100,
    phone: 30,
    company: 150,
    interest: 100,
    message: 5000
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns { field: message } — empty object when the form is valid. */
export function validateContactForm(form) {

    const errors = {};

    const name = (form?.name || "").trim();
    const email = (form?.email || "").trim();
    const message = (form?.message || "").trim();

    if (!name) errors.name = "Please enter your name.";
    else if (name.length > CONTACT_LIMITS.name) errors.name = `Name must be at most ${CONTACT_LIMITS.name} characters.`;

    if (!email) errors.email = "Please enter your email address.";
    else if (!EMAIL_PATTERN.test(email)) errors.email = "Please enter a valid email address (for example name@example.com).";

    if (!message) errors.message = "Please enter a message.";
    else if (message.length > CONTACT_LIMITS.message) errors.message = `Message must be at most ${CONTACT_LIMITS.message} characters.`;

    for (const field of ["phone", "company", "interest"]) {
        if ((form?.[field] || "").length > CONTACT_LIMITS[field]) {
            errors[field] = `Must be at most ${CONTACT_LIMITS[field]} characters.`;
        }
    }

    return errors;

}
