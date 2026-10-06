import re
import threading

import whisper

# Load Whisper model once when the application starts
model = whisper.load_model("base")

# Whisper's decoder installs per-call hooks on the shared model, so two
# threads transcribing at the same time can corrupt each other's output.
# Upload handlers run in worker threads, so transcription is serialized.
_model_lock = threading.Lock()

# A transcript needs at least this many words to be worth an LLM call.
MIN_TRANSCRIPT_WORDS = 3


def transcribe_audio(file_path: str):

    with _model_lock:

        result = model.transcribe(
            file_path,
            fp16=False,
            verbose=False
        )

    transcript = result.get("text", "").strip()

    segments = []

    for segment in result.get("segments", []):
        segments.append(
            {
                "start": round(segment["start"], 2),
                "end": round(segment["end"], 2),
                "text": segment["text"].strip()
            }
        )

    duration = 0

    if result.get("segments"):
        duration = round(
         result["segments"][-1]["end"],
         2
        )

    return {
        "text": transcript,
        "segments": segments,
        "duration": duration,
        "language": result.get("language")
    }


def format_timestamp(seconds: float) -> str:

    total_seconds = int(seconds)

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60

    return f"{hours:02}:{minutes:02}:{secs:02}"


def format_timestamped_transcript(segments) -> str:
    """
    Build the "[HH:MM:SS - HH:MM:SS]\\ntext" transcript the LLM analyses
    from segments that were already produced by ONE transcribe_audio call.
    """

    formatted = []

    for segment in segments:

        start = format_timestamp(segment["start"])
        end = format_timestamp(segment["end"])

        formatted.append(
            f"[{start} - {end}]\n{segment['text']}"
        )

    return "\n\n".join(formatted)


def get_timestamped_transcript(file_path: str):
    """
    Convenience wrapper that transcribes the file itself. The upload
    pipeline does NOT use this (it would transcribe a second time); it
    calls transcribe_audio once and formats the segments.
    """

    data = transcribe_audio(file_path)

    return format_timestamped_transcript(data["segments"])


def is_meaningful_transcript(text: str) -> bool:
    """
    False for empty / whitespace-only / punctuation-only transcripts and
    for ones too short to analyse (silence, hold music, a stray "you").
    """

    if not text:
        return False

    words = re.findall(r"\w+", text, flags=re.UNICODE)

    return len(words) >= MIN_TRANSCRIPT_WORDS
