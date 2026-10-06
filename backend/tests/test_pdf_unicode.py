"""Hindi / Hinglish / English in the PDF: bundled Unicode font, shaping, no blanks."""

import os
import re

import pytest
import uharfbuzz as hb
from reportlab import rl_config
from reportlab.pdfbase import pdfmetrics

from app.services import pdf_generator as pg
from conftest import valid_analysis

HINDI = "ग्राहक ने उत्पाद के बारे में जानकारी मांगी।"
HINGLISH = "Customer ne product ke baare mein information maangi."
ENGLISH = "Customer requested information about the product."
SPECIAL = "R&D <5 min> & \"quoted\" 'single' AT&T"
MULTILINE = "पहली पंक्ति\nSecond line\r\nतीसरी पंक्ति <b>"

FONT_PATH = os.path.join(pg.FONT_DIR, "Hind-Regular.ttf")


@pytest.fixture(autouse=True)
def uncompressed_pdf(monkeypatch):
    monkeypatch.setattr(rl_config, "pageCompression", 0)


def build(tmp_path, analysis, transcript, meta=None):
    out = tmp_path / "unicode.pdf"
    pg.generate_pdf_report(transcript, analysis, str(out), meta=meta)
    return out.read_bytes()


def multilingual_analysis():
    return valid_analysis(
        executive_summary=f"{ENGLISH}\n{HINGLISH}\n{HINDI}",
        customer_sentiment={
            "overall": "Negative",
            "journey": "Worsened",
            "detailed_analysis": f"{HINDI} Price ₹500 & {SPECIAL}",
        },
        customer_behavior={"frustration_level": "High", "detailed_analysis": HINDI},
        agent_sentiment={"overall": "Positive", "detailed_analysis": HINGLISH},
        agent_behavior={"professionalism": "High", "detailed_analysis": ENGLISH},
        key_customer_concerns=[HINDI, HINGLISH, ENGLISH, SPECIAL, MULTILINE],
        emotional_cues=["निराशा", "Frustration"],
        action_items=[f"{HINDI} (refund ₹1,200)"],
        positive_observations=[ENGLISH],
        risk_assessment=HINDI,
        root_cause_analysis=MULTILINE,
        critical_conversation_moments=[
            {"start_time": "00:00:03", "speaker": "ग्राहक", "category": "Escalation",
             "severity": "High", "quote": HINDI},
            {"start_time": "00:00:09", "speaker": "Agent", "category": "Positive Behaviour",
             "severity": "Low", "quote": SPECIAL},
        ],
    )


# ---- font packaging ---------------------------------------------------------

def test_font_files_are_bundled_with_the_backend_and_paths_are_app_relative():
    assert os.path.isabs(pg.FONT_DIR)
    assert pg.FONT_DIR.replace("\\", "/").endswith("backend/assets/fonts")
    for name in ("Hind-Regular.ttf", "Hind-Bold.ttf", "OFL-Hind.txt"):
        assert os.path.isfile(os.path.join(pg.FONT_DIR, name)), name

    source = open(pg.__file__, encoding="utf-8").read()
    assert "D:\\" not in source and "C:\\" not in source


def test_unicode_fonts_are_registered_and_used_for_all_styles():
    assert pg.UNICODE_FONTS is True
    assert pg.FONT_REGULAR == "Hind-Regular" and pg.FONT_BOLD == "Hind-Bold"
    styles = pg.build_styles()
    assert {s.fontName for s in styles.values()} <= {"Hind-Regular", "Hind-Bold"}


def test_missing_font_files_fall_back_gracefully(monkeypatch, tmp_path):
    monkeypatch.setattr(pg, "FONT_DIR", str(tmp_path))

    assert pg._register_fonts() is False  # logs a warning, does not raise


def test_font_covers_every_character_of_the_test_strings():
    cmap = pdfmetrics.getFont("Hind-Regular").face.charToGlyph

    for text in (HINDI, HINGLISH, ENGLISH, MULTILINE, "₹ “ ” ‘ ’ – — • …"):
        missing = [c for c in text if c not in "\n\r" and ord(c) not in cmap]
        assert missing == [], f"font lacks {missing!r} in {text!r}"


# ---- Hindi is genuinely renderable (not blank / .notdef) ---------------------------

def shape(text):
    face = hb.Face(hb.Blob.from_file_path(FONT_PATH))
    font = hb.Font(face)
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(font, buffer, {})
    return [info.codepoint for info in buffer.glyph_infos]


@pytest.mark.parametrize("text", [HINDI, "निराशा", "क्षत्रिय ज्ञान श्री", "आपका ₹500 का refund"])
def test_hindi_shapes_to_real_glyphs_never_notdef(text):
    glyphs = shape(text)

    assert glyphs and 0 not in glyphs                      # glyph 0 is .notdef (a blank box)

    cmap = pdfmetrics.getFont("Hind-Regular").face.charToGlyph
    unshaped = [cmap[ord(c)] for c in text]
    if "\u094d" in text:                                  # virama => conjunct forms exist
        assert glyphs != unshaped                          # shaping actually composed them


def test_paragraph_shaping_is_used_only_for_devanagari():
    styles = pg.build_styles()

    hindi = pg._P(pg._esc(HINDI), styles["Body"])
    english = pg._P(pg._esc(ENGLISH), styles["Body"])
    mixed = pg._P(pg._esc(f"{HINGLISH} {HINDI}, ठीक?"), styles["Body"])

    assert hindi.style.shaping == 1
    assert mixed.style.shaping == 1
    assert english.style.shaping == 0                      # keeps ligature-free, extractable text
    assert styles["Body"].shaping == 0                     # shaped style is a copy, not a mutation


# ---- full documents ----------------------------------------------------------------

def test_pdf_with_hindi_hinglish_english_special_and_multiline_builds(tmp_path):
    pdf = build(
        tmp_path,
        multilingual_analysis(),
        f"[00:00:00 - 00:00:03]\n{HINDI}\n\n[00:00:03 - 00:00:06]\n{HINGLISH}\n\n"
        f"[00:00:06 - 00:00:09]\n{ENGLISH} {SPECIAL}\n{MULTILINE}",
        meta={"call_id": "INC-राहुल-42", "agent_name": "राहुल शर्मा"},
    )

    assert pdf.startswith(b"%PDF") and pdf.rstrip().endswith(b"%%EOF")


def test_pdf_embeds_the_unicode_font_and_no_longer_relies_on_helvetica_for_text(tmp_path):
    pdf = build(tmp_path, multilingual_analysis(), HINDI)

    assert re.search(rb"/BaseFont /[A-Z]{6}\+Hind-Regular", pdf)
    assert re.search(rb"/BaseFont /[A-Z]{6}\+Hind-Bold", pdf)
    assert b"/FontFile2" in pdf                            # the subset is embedded, not referenced
    assert b"Noto" not in pdf


def test_hindi_text_is_drawn_with_the_embedded_font(tmp_path):
    with_hindi = build(tmp_path, valid_analysis(executive_summary=HINDI * 6), HINDI * 20)
    without = build(tmp_path, valid_analysis(executive_summary=ENGLISH * 6), ENGLISH * 20)

    # Hindi characters add glyphs to the embedded subset that English does not:
    # the font program (FontFile2 stream) is larger when Devanagari is used.
    def font_program_bytes(pdf):
        return sum(int(m) for m in re.findall(rb"/Length1 (\d+)", pdf))

    assert font_program_bytes(with_hindi) > font_program_bytes(without)


def test_english_only_report_text_stays_extractable(tmp_path):
    pdf = build(tmp_path, valid_analysis(executive_summary="Please review the financial office refund"), ENGLISH)

    assert b"financial" in pdf and b"refund" in pdf        # no ligature glyph substitution


def test_table_content_scorecard_and_cards_accept_hindi(tmp_path):
    analysis = multilingual_analysis()
    analysis["customer_sentiment"]["overall"] = "नकारात्मक"
    analysis["agent_behavior"]["empathy"] = HINDI

    pdf = build(tmp_path, analysis, HINDI, meta={"call_id": HINDI, "agent_name": HINGLISH})

    assert pdf.startswith(b"%PDF")


def test_latin_safe_never_leaves_undrawable_characters_on_canvas_text():
    safe = pg._latin_safe("abc ₹ é \x07 日本")

    assert "₹" in safe and "é" in safe
    assert "\x07" not in safe and "日" not in safe and "本" not in safe


# ---- optional: actually rasterise a page when PyMuPDF is available ----------------------

def test_hindi_paragraph_renders_visible_ink(tmp_path):
    pymupdf = pytest.importorskip("pymupdf")
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.styles import ParagraphStyle

    def ink(text):
        path = tmp_path / "ink.pdf"
        c = rl_canvas.Canvas(str(path), pagesize=(300, 80))
        style = ParagraphStyle("t", fontName="Hind-Regular", fontSize=18, leading=24)
        p = pg._P(pg._esc(text), style)
        p.wrap(280, 60)
        p.drawOn(c, 10, 20)
        c.save()
        pixmap = pymupdf.open(str(path))[0].get_pixmap(dpi=96)
        return sum(1 for i in range(0, len(pixmap.samples), pixmap.n) if pixmap.samples[i] < 128)

    assert ink(HINDI) > 300                               # visibly drawn
    assert ink(HINDI) > ink("") + 300
