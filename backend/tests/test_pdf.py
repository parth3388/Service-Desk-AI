"""PDF generation with hostile/special text and a real timestamp."""

import re

import pytest
from reportlab import rl_config
from reportlab.platypus import Paragraph

from app.services import pdf_generator
from conftest import valid_analysis

SPECIAL = "Tom & Jerry said <5 minutes> was \"fine\" isn't it </b> <i unclosed <font color='x'> &amp; &#0;"

TRANSCRIPT = (
    f"[00:00:00 - 00:00:03]\n{SPECIAL}\n\n"
    "[00:00:03 - 00:00:06]\nLine two with AT&T <3 and \"quotes\" and 'apostrophes'\n"
    "third line\r\nfourth line"
)


@pytest.fixture(autouse=True)
def uncompressed_pdf(monkeypatch):
    """Store page text uncompressed so tests can search the PDF bytes."""
    monkeypatch.setattr(rl_config, "pageCompression", 0)


def pdf_text(pdf: bytes) -> str:
    """Concatenate the text drawn by every Tj operator (ReportLab splits runs at '&')."""
    parts = re.findall(rb"\(((?:\\.|[^\\)])*)\) Tj", pdf)
    text = b"".join(parts).decode("latin-1")
    return re.sub(r"\\(.)", r"\1", text)


def build(tmp_path, analysis=None, transcript=TRANSCRIPT, meta=None):
    out = tmp_path / "report.pdf"
    pdf_generator.generate_pdf_report(
        transcript,
        analysis if analysis is not None else valid_analysis(),
        str(out),
        meta=meta,
    )
    return out.read_bytes()


def test_markup_breaking_text_is_escaped_not_parsed():
    # Without escaping, ReportLab tries to parse these and fails.
    with pytest.raises(Exception):
        Paragraph(SPECIAL, pdf_generator.build_styles()["Body"])

    Paragraph(pdf_generator._esc(SPECIAL), pdf_generator.build_styles()["Body"])


def test_pdf_builds_with_special_characters_everywhere(tmp_path):
    hostile = valid_analysis(
        executive_summary=SPECIAL,
        risk_assessment=SPECIAL,
        root_cause_analysis="Line one\nLine two <b>",
        key_customer_concerns=[SPECIAL, "R&D <team>"],
        emotional_cues=["<angry>"],
        action_items=["Call back & refund <today>"],
        positive_observations=["\"Polite\" & 'calm'"],
        customer_sentiment={"overall": "<Neg>", "detailed_analysis": SPECIAL, "journey": "&"},
        agent_behavior={"empathy": "<High>", "detailed_analysis": SPECIAL},
        critical_conversation_moments=[
            {
                "start_time": "00:00:03",
                "speaker": "Cust<omer>",
                "category": "Threat & Abuse",
                "severity": "High",
                "quote": SPECIAL,
            }
        ],
    )

    pdf = build(
        tmp_path,
        hostile,
        meta={"call_id": "INC-<1>&2", "agent_name": "Bob <i", "generated_on": None},
    )

    assert pdf.startswith(b"%PDF")
    assert pdf.rstrip().endswith(b"%%EOF")


def test_multiline_transcript_and_report_text_render(tmp_path):
    pdf = build(tmp_path, valid_analysis(executive_summary="First line\nSecond line\r\nThird line"))
    text = pdf_text(pdf)

    assert pdf.startswith(b"%PDF")
    assert "First line" in text and "Second line" in text and "Third line" in text
    assert "third line" in text and "fourth line" in text


def test_special_characters_survive_into_the_document_text(tmp_path):
    text = pdf_text(build(tmp_path))

    assert "AT&T <3" in text
    assert "<5 minutes>" in text
    assert "Tom & Jerry" in text


def test_control_characters_do_not_break_the_document(tmp_path):
    assert build(tmp_path, transcript="hello\x00\x01\x1f world this is a test").startswith(b"%PDF")


@pytest.mark.parametrize(
    "analysis",
    [
        valid_analysis(customer_sentiment=None, agent_behavior=None, confidence_scorecard=None),
        {"executive_summary": None},
        {},
        valid_analysis(critical_conversation_moments=["oops", None, 3]),
        valid_analysis(key_customer_concerns=None, action_items=None),
    ],
    ids=["null-sections", "null-summary", "empty", "junk-moments", "null-lists"],
)
def test_generator_tolerates_incomplete_analysis_without_crashing(tmp_path, analysis):
    assert build(tmp_path, analysis).startswith(b"%PDF")


@pytest.mark.parametrize("supplied", [None, ""], ids=["none", "empty"])
def test_generated_on_is_a_real_timestamp_never_none(tmp_path, supplied):
    pdf = build(tmp_path, meta={"call_id": "CALL-1", "agent_name": "Erin", "generated_on": supplied})

    assert b"Generated on: None" not in pdf
    assert b"Generated None" not in pdf
    assert re.search(rb"Generated on: \d{2} [A-Z][a-z]+ \d{4}, \d{2}:\d{2} [AP]M", pdf)
    assert re.search(rb"Generated \d{2} [A-Z][a-z]+ \d{4}", pdf)


def test_generated_on_is_a_real_timestamp_when_meta_is_omitted(tmp_path):
    pdf = build(tmp_path, meta=None)

    assert b"None" not in re.findall(rb"Generated[^)]*", pdf)[0]
    assert re.search(rb"Generated on: \d{2} [A-Z][a-z]+ \d{4}", pdf)


def test_an_explicit_generated_on_is_respected(tmp_path):
    pdf = build(tmp_path, meta={"call_id": "C", "agent_name": "A", "generated_on": "01 January 2030, 09:00 AM"})

    assert b"Generated on: 01 January 2030, 09:00 AM" in pdf


def test_pipeline_meta_no_longer_passes_a_null_timestamp(client, employee, storage):
    """upload.py used to pass generated_on=None, which printed 'None' on the cover."""
    from conftest import audio_files, auth_headers, wait_for_pipeline

    captured = {}
    original = pdf_generator.generate_pdf_report

    import app.api.upload as upload_module

    def spy(transcript, analysis, path, meta=None, segments=None):
        captured["meta"] = meta
        return original(transcript, analysis, path, meta=meta, segments=segments)

    upload_module.generate_pdf_report = spy
    try:
        client.post(
            "/upload/audio",
            files=audio_files(("a.wav", "audio/wav")),
            headers=auth_headers(employee),
        )
        # generate_pdf_report now runs in the background pipeline job
        # (Issue 1), not before the upload response — wait for it.
        wait_for_pipeline()
    finally:
        upload_module.generate_pdf_report = original

    assert "meta" in captured
    assert captured["meta"].get("generated_on") is not None or "generated_on" not in captured["meta"]
