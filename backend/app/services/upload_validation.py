"""
Validation and safe storage of uploaded audio.

One supported format set for the whole app (the frontend mirrors it in
src/lib/validation.mjs). These are the formats the pipeline is verified
against; OGG/FLAC are intentionally NOT accepted.

Validation layers (the backend is the final authority, the frontend is UX):
  1. filename extension           (validate_upload)
  2. declared content type        (validate_upload)
  3. actual file content          (save_upload_stream -> audio_signature)
  4. size limit, enforced while streaming
Files are always stored under a generated UUID name, never the client's.
"""

import os
import re
from pathlib import PureWindowsPath

from app.services.audio_signature import detect_audio_format

ALLOWED_EXTENSIONS = (".mp3", ".wav", ".aac", ".m4a")

FORMATS_LABEL = "MP3, WAV, AAC, M4A"

ALLOWED_CONTENT_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/x-mpeg-3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/vnd.wave",
    "audio/aac",
    "audio/x-aac",
    "audio/aacp",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
}

# Browsers / OS file pickers sometimes send no useful type at all; the
# extension check still applies in that case.
UNKNOWN_CONTENT_TYPES = {"", "application/octet-stream"}

MAX_FILENAME_LENGTH = 200

_CHUNK_SIZE = 1024 * 1024

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


class UploadValidationError(Exception):
    """User-facing reason an upload was rejected."""


def sanitize_filename(name: str | None) -> str:
    """
    Reduce a client-supplied filename to a safe display name: no directory
    components (either separator style), no control characters, bounded
    length. The name is only ever used for display/email — files are stored
    under a generated UUID.
    """

    if not name:
        return ""

    # PureWindowsPath understands both "/" and "\" separators.
    base = PureWindowsPath(name).name

    base = _CONTROL_CHARS.sub("", base).strip()

    if len(base) > MAX_FILENAME_LENGTH:
        stem, ext = os.path.splitext(base)
        base = stem[:MAX_FILENAME_LENGTH - len(ext)] + ext

    return base


def sanitize_single_line(value: str | None, max_length: int) -> str | None:
    """Strip control chars / newlines from a short free-text field."""

    if value is None:
        return None

    cleaned = _CONTROL_CHARS.sub(" ", value).strip()

    return cleaned[:max_length] or None


def validate_upload(file) -> tuple[str, str]:
    """
    Validate name + declared content type of an UploadFile.
    Returns (lowercase extension, sanitized display filename).
    """

    display_name = sanitize_filename(file.filename)

    if not display_name:
        raise UploadValidationError("The uploaded file has no name.")

    extension = os.path.splitext(display_name)[1].lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise UploadValidationError(
            f"Unsupported audio format. Allowed formats: {FORMATS_LABEL}."
        )

    content_type = (file.content_type or "").split(";")[0].strip().lower()

    if (
        content_type not in UNKNOWN_CONTENT_TYPES
        and content_type not in ALLOWED_CONTENT_TYPES
    ):
        raise UploadValidationError(
            f"Unsupported file type. Allowed formats: {FORMATS_LABEL}."
        )

    return extension, display_name


def save_upload_stream(source, destination: str, max_bytes: int) -> int:
    """
    Copy `source` (a binary file object) to `destination` in chunks,
    enforcing the size limit while streaming.

    The first chunk is inspected BEFORE anything is written: an empty upload,
    or one whose bytes are not a supported audio container (see
    audio_signature), is rejected without touching the disk. Removes the
    partial file and raises UploadValidationError if the size limit is
    exceeded. Returns the number of bytes written.
    """

    first = source.read(_CHUNK_SIZE)

    if not first:
        raise UploadValidationError("The uploaded file is empty.")

    if detect_audio_format(first) is None:
        raise UploadValidationError(
            f"The file content is not valid {FORMATS_LABEL} audio. "
            "It may be corrupt or a different kind of file renamed as audio."
        )

    written = 0

    try:

        with open(destination, "wb") as buffer:

            chunk = first

            while chunk:

                written += len(chunk)

                if written > max_bytes:
                    raise UploadValidationError(
                        "File is too large. Maximum size is "
                        f"{max_bytes // (1024 * 1024)} MB."
                    )

                buffer.write(chunk)

                chunk = source.read(_CHUNK_SIZE)

    except BaseException:

        if os.path.exists(destination):
            os.remove(destination)

        raise

    return written
