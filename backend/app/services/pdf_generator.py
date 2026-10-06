import logging
import os
import re
from datetime import datetime, timezone, timedelta
from xml.sax.saxutils import escape as _xml_escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate,
    PageTemplate,
    Frame,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    Image,
    HRFlowable,
    KeepTogether,
    Flowable,
    NextPageTemplate,
)
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger(__name__)

# ======================================================================
# BRAND CONFIG — Shatarupax AI Labs
# ======================================================================

COMPANY_NAME = "SHATARUPAX AI LABS"
COMPANY_TAGLINE = "INTELLIGENCE. INNOVATION. IMPACT."
REPORT_TITLE = "AI SERVICE DESK REPORT"

IST = timezone(timedelta(hours=5, minutes=30), name="IST")


def _now_ist():
    """Current wall-clock time in India Standard Time (UTC+5:30)."""
    return datetime.now(IST)


# ======================================================================
# FONTS — Unicode support (English + Hindi/Devanagari)
#
# Helvetica (the ReportLab default) only covers Latin-1, so Hindi text came
# out blank and characters such as the rupee sign were lost. Report text now
# uses the bundled "Hind" family (SIL Open Font License, assets/fonts/OFL-Hind.txt).
# One file covers Latin AND Devanagari, which matters: ReportLab's shaper
# cannot handle a single word that switches between two fonts (e.g. "है,"
# or "INC-राहुल-42"), so splitting scripts across fonts is not an option.
#
# Paragraphs that contain Devanagari are shaped with HarfBuzz (uharfbuzz) so
# conjuncts and matras render correctly. Latin-only paragraphs are left
# unshaped, which keeps their text extractable (shaping turns ligatures such
# as "fi" into glyphs with no Unicode mapping in the PDF). Hind has no italic
# face, so "italic" styles use the regular weight.
# ======================================================================

FONT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "fonts")
)

_FONT_FILES = {
    "Hind-Regular": "Hind-Regular.ttf",
    "Hind-Bold": "Hind-Bold.ttf",
}


def _register_fonts():
    """Register the bundled fonts. Returns False if any file is unusable."""
    try:
        for name, filename in _FONT_FILES.items():
            pdfmetrics.registerFont(TTFont(name, os.path.join(FONT_DIR, filename)))

        pdfmetrics.registerFontFamily(
            "Hind",
            normal="Hind-Regular",
            bold="Hind-Bold",
            italic="Hind-Regular",
            boldItalic="Hind-Bold",
        )
        return True
    except Exception:
        logger.warning(
            "Bundled Unicode fonts could not be loaded from %s; falling back to "
            "Helvetica (Hindi text will not render).",
            FONT_DIR,
            exc_info=True,
        )
        return False


UNICODE_FONTS = _register_fonts()

if UNICODE_FONTS:
    FONT_REGULAR = "Hind-Regular"
    FONT_BOLD = "Hind-Bold"
    FONT_ITALIC = "Hind-Regular"
else:
    FONT_REGULAR = "Helvetica"
    FONT_BOLD = "Helvetica-Bold"
    FONT_ITALIC = "Helvetica-Oblique"

# Devanagari, Devanagari Extended, Vedic Extensions
_DEVANAGARI_CHAR = re.compile("[ऀ-ॿ꣠-ꣿ᳐-᳿]")


def has_devanagari(text):
    return bool(text) and bool(_DEVANAGARI_CHAR.search(str(text)))


_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _esc(value, default="N/A"):
    """
    Make arbitrary text safe to embed in a ReportLab Paragraph.

    Paragraph parses an XML-like markup, so raw report content containing
    '<', '&' etc. (e.g. "AT&T", "<5 minutes", "Bob <i") would otherwise
    raise or silently drop text. Newlines become explicit line breaks.
    """
    if value is None or value == "":
        text = default
    else:
        text = str(value)

    text = _CONTROL_CHARS.sub("", text)
    text = _xml_escape(text)

    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")


_shaped_styles = {}


def _shaped(style):
    """Copy of a paragraph style with HarfBuzz shaping switched on (cached)."""
    key = id(style)
    if key not in _shaped_styles:
        _shaped_styles[key] = style.clone(f"{style.name}Shaped", shaping=1)
    return _shaped_styles[key]


def _P(markup, style):
    """
    Paragraph factory. Paragraphs that contain Devanagari are shaped so
    conjuncts/matras render correctly; everything else is left as plain text.
    (Without uharfbuzz installed ReportLab silently skips shaping.)
    """
    if UNICODE_FONTS and has_devanagari(markup):
        style = _shaped(style)

    return Paragraph(markup, style)


def _latin_safe(text):
    """For canvas.drawString: replace characters the font lacks with '?'."""
    text = str(text)

    if not UNICODE_FONTS:
        return text.encode("latin-1", "replace").decode("latin-1")

    glyphs = pdfmetrics.getFont(FONT_REGULAR).face.charToGlyph

    return "".join(ch if (ord(ch) in glyphs and ch >= " ") else "?" for ch in text)


def _draw_text(c, x, y, text, font, size, color, max_width=None):
    """
    Draw one line on a canvas. Plain text uses drawString; text with
    Devanagari goes through a (shaped) Paragraph so conjuncts render.
    """
    text = str(text)

    if not (UNICODE_FONTS and has_devanagari(text)):
        c.setFont(font, size)
        c.setFillColor(color)
        c.drawString(x, y, _latin_safe(text))
        return

    style = ParagraphStyle(
        "CanvasLine", fontName=font, fontSize=size, leading=size * 1.25, textColor=color
    )
    paragraph = _P(_esc(text), style)
    _, height = paragraph.wrap(max_width or 400, 1000)
    paragraph.drawOn(c, x, y - (height - size))


def _as_dict(container, key):
    """container[key] if it is a dict, else {} (tolerates null / wrong types)."""
    value = container.get(key) if isinstance(container, dict) else None
    return value if isinstance(value, dict) else {}


def _resolve_logo_path():
    """
    The official ShatarupaX AI Labs logo (navy "D"-spiral monogram +
    wordmark, white background, no transparency). Bundled into backend
    assets so the PDF generator never depends on the frontend's public/
    folder existing at runtime.
    """
    here = os.path.dirname(os.path.abspath(__file__))

    env_path = os.environ.get("LOGO_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path

    logo_path = os.path.join(here, "..", "..", "assets", "shatarupax_logo.jpeg")
    logo_path = os.path.abspath(logo_path)

    if not os.path.isfile(logo_path):
        print(f"[pdf_report_generator] WARNING: logo not found at {logo_path}. "
              f"Set LOGO_PATH in your .env to override, or confirm the file is at "
              f"backend/assets/shatarupax_logo.jpeg.")

    return logo_path


LOGO_PATH = _resolve_logo_path()
# The logo's own real pixel dimensions (766x371) — used so it is NEVER
# stretched/distorted; every placement derives height from a chosen width.
LOGO_ASPECT = 766 / 371
REPORT_SUBTITLE = "Call Analysis & Confidence Intelligence Report"

# ======================================================================
# BRAND PALETTE — derived from the actual logo (sampled ink colour of the
# monogram/wordmark: RGB(21, 37, 97) = #152561), extended with a coherent
# secondary/accent/semantic system. Every colour used anywhere in the
# report traces back to this one palette — nothing introduced ad hoc.
# ======================================================================

BRAND_NAVY = colors.HexColor("#152561")        # primary — sampled from the logo
BRAND_NAVY_DEEP = colors.HexColor("#0D1740")   # darker variant for small text/accents
BRAND_BLUE = colors.HexColor("#2546A8")        # secondary brand blue
BRAND_CYAN = colors.HexColor("#06AED4")        # tech/intelligence accent
BRAND_PURPLE = colors.HexColor("#7C5CFC")      # "AI insight" accent

SUCCESS = colors.HexColor("#16A34A")
WARNING = colors.HexColor("#D97706")
DANGER = colors.HexColor("#DC2626")

TEXT_DARK = colors.HexColor("#1B2130")
TEXT_MUTED = colors.HexColor("#64748B")
TEXT_FAINT = colors.HexColor("#94A3B8")

BORDER = colors.HexColor("#E7E9F2")
BORDER_SOFT = colors.HexColor("#EEF0F8")
BG_PALE = colors.HexColor("#F6F8FD")           # very light brand-blue wash
BG_WHITE = colors.white
BG_TRANSCRIPT = colors.HexColor("#FAFBFD")

# Kept for the handful of internal helpers that still reason about a single
# "navy"/"accent" pair (section accent bars etc.).
NAVY = BRAND_NAVY
ACCENT_BLUE = BRAND_BLUE
TEAL = BRAND_CYAN

GRAD_BLUE = (colors.HexColor("#1E3A8A"), BRAND_BLUE)
GRAD_PURPLE = (colors.HexColor("#6D3FE0"), BRAND_PURPLE)
GRAD_GREEN = (colors.HexColor("#059669"), SUCCESS)
GRAD_AMBER = (colors.HexColor("#B45309"), WARNING)
GRAD_RED = (colors.HexColor("#B91C1C"), DANGER)

PAGE_W, PAGE_H = A4
MARGIN_L = 20 * mm
MARGIN_R = 20 * mm
MARGIN_TOP = 36 * mm
MARGIN_BOTTOM = 28 * mm

CONTENT_WIDTH = PAGE_W - MARGIN_L - MARGIN_R


def _alpha(color, a):
    return colors.Color(color.red, color.green, color.blue, alpha=a)


# ======================================================================
# STYLES
# ======================================================================

def build_styles():
    base = getSampleStyleSheet()
    styles = {}

    styles["CoverTitle"] = ParagraphStyle(
        "CoverTitle", parent=base["Title"],
        fontName=FONT_BOLD, fontSize=30, leading=35,
        textColor=BRAND_NAVY, alignment=TA_LEFT, spaceAfter=6,
    )
    styles["CoverSubtitle"] = ParagraphStyle(
        "CoverSubtitle", parent=base["Normal"],
        fontName=FONT_REGULAR, fontSize=12.5, leading=17,
        textColor=TEXT_MUTED, alignment=TA_LEFT,
    )
    styles["CoverMeta"] = ParagraphStyle(
        "CoverMeta", parent=base["Normal"],
        fontName=FONT_REGULAR, fontSize=9.5, leading=15,
        textColor=TEXT_MUTED, alignment=TA_LEFT,
    )
    styles["CoverMetaLabel"] = ParagraphStyle(
        "CoverMetaLabel", parent=base["Normal"],
        fontName=FONT_BOLD, fontSize=7.5, leading=11,
        textColor=BRAND_CYAN, alignment=TA_LEFT,
    )
    styles["CoverFooter"] = ParagraphStyle(
        "CoverFooter", parent=base["Normal"],
        fontName=FONT_REGULAR, fontSize=8, leading=12,
        textColor=TEXT_FAINT, alignment=TA_LEFT,
    )
    styles["SectionHeading"] = ParagraphStyle(
        "SectionHeading", parent=base["Heading2"],
        fontName=FONT_BOLD, fontSize=13, leading=16,
        textColor=BRAND_NAVY, spaceBefore=0, spaceAfter=0,
    )
    styles["SubHeading"] = ParagraphStyle(
        "SubHeading", parent=base["Heading3"],
        fontName=FONT_BOLD, fontSize=10.5, leading=14,
        textColor=BRAND_BLUE, spaceBefore=8, spaceAfter=4,
    )
    styles["Body"] = ParagraphStyle(
        "Body", parent=base["BodyText"],
        fontName=FONT_REGULAR, fontSize=9.7, leading=14.5,
        textColor=TEXT_DARK, spaceAfter=6,
    )
    styles["BodyMuted"] = ParagraphStyle(
        "BodyMuted", parent=base["BodyText"],
        fontName=FONT_ITALIC, fontSize=9.2, leading=13,
        textColor=TEXT_MUTED,
    )
    styles["Quote"] = ParagraphStyle(
        "Quote", parent=base["BodyText"],
        fontName=FONT_ITALIC, fontSize=9.5, leading=14,
        textColor=BRAND_NAVY_DEEP, leftIndent=10, spaceAfter=4,
    )
    styles["TranscriptBody"] = ParagraphStyle(
        "TranscriptBody", parent=base["BodyText"],
        fontName=FONT_REGULAR, fontSize=9, leading=13.5,
        textColor=TEXT_DARK,
    )
    styles["TranscriptTime"] = ParagraphStyle(
        "TranscriptTime", parent=base["Normal"],
        fontName=FONT_BOLD, fontSize=7.8, leading=11,
        textColor=BRAND_BLUE,
    )
    styles["CardTitle"] = ParagraphStyle(
        "CardTitle", parent=base["Normal"],
        fontName=FONT_BOLD, fontSize=16, leading=19,
        textColor=TEXT_DARK,
    )
    styles["CardSubtitle"] = ParagraphStyle(
        "CardSubtitle", parent=base["Normal"],
        fontName=FONT_BOLD, fontSize=7.3, leading=10,
        textColor=TEXT_MUTED,
    )
    styles["CardCaption"] = ParagraphStyle(
        "CardCaption", parent=base["Normal"],
        fontName=FONT_REGULAR, fontSize=8, leading=11,
        textColor=TEXT_MUTED,
    )
    styles["TimelineTitle"] = ParagraphStyle(
        "TimelineTitle", parent=base["Normal"],
        fontName=FONT_BOLD, fontSize=9.7, leading=13,
        textColor=TEXT_DARK,
    )
    styles["LevelLabel"] = ParagraphStyle(
        "LevelLabel", parent=base["Normal"],
        fontName=FONT_BOLD, fontSize=8.3, leading=11,
        textColor=TEXT_MUTED,
    )
    return styles


SEVERITY_COLORS = {
    "critical": DANGER,
    "high": DANGER,
    "medium": WARNING,
    "moderate": WARNING,
    "low": SUCCESS,
}

LEVEL_PCT = {"low": 0.34, "medium": 0.67, "moderate": 0.67, "high": 1.0}


def severity_badge(text):
    key = str(text).strip().lower()
    color = SEVERITY_COLORS.get(key, TEXT_MUTED)
    hexcolor = color.hexval() if hasattr(color, "hexval") else "#64748B"
    return f'<font color="{hexcolor}"><b>{_esc(str(text).upper())}</b></font>'


def sentiment_gradient(label):
    """Maps a sentiment label to a gradient pair, mirroring the web card colors."""
    key = str(label).strip().lower()
    if key == "positive":
        return GRAD_GREEN
    if key == "negative":
        return GRAD_RED
    return GRAD_AMBER


def sentiment_color(label):
    key = str(label).strip().lower()
    if key == "positive":
        return SUCCESS
    if key == "negative":
        return DANGER
    return WARNING


# ======================================================================
# BRAND MOTIF — a reusable abstract flowing-curve mark echoing the nested
# spiral inside the logo's "D" monogram. Drawn at very low opacity so it
# never competes with text; used as a watermark on the cover and a small
# corner decoration on content pages.
# ======================================================================

def _draw_brand_motif(c, cx, cy, scale=1.0, alpha=0.07, accent=False):
    c.saveState()
    radii = [scale * 95, scale * 68, scale * 44]
    palette = [BRAND_NAVY, BRAND_BLUE, BRAND_CYAN]
    for i, radius in enumerate(radii):
        col = palette[i % len(palette)]
        c.setStrokeColor(_alpha(col, alpha))
        c.setLineWidth(max(scale * 5, 1.2))
        c.arc(cx - radius, cy - radius, cx + radius, cy + radius, 205, 150)
    if accent:
        c.setStrokeColor(_alpha(BRAND_CYAN, min(alpha * 2.4, 0.35)))
        c.setLineWidth(max(scale * 2.2, 0.8))
        r = scale * 26
        c.arc(cx - r, cy - r, cx + r, cy + r, 20, 200)
    c.restoreState()


# ======================================================================
# PAGE BACKGROUND SYSTEM
# ======================================================================

def draw_page_background(c, kind):
    """
    One reusable background per page "family" (rule: pages must not all
    look identical, but decoration must never fight with body text).
    """
    c.saveState()

    if kind == "cover":
        c.setFillColor(BG_WHITE)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        # Large, very faint flowing curves anchored off the top-right
        # corner — an abstract echo of the logo's spiral, never under the
        # text column (which stays in the left two-thirds of the page).
        _draw_brand_motif(c, PAGE_W + 10 * mm, PAGE_H - 60 * mm, scale=1.5, alpha=0.055)
        _draw_brand_motif(c, PAGE_W - 8 * mm, 36 * mm, scale=0.9, alpha=0.05, accent=True)
        # Thin brand line top + bottom, echoing the former full-bleed cover
        # without the solid navy block.
        c.setFillColor(BRAND_NAVY)
        c.rect(0, PAGE_H - 2.2, PAGE_W, 2.2, fill=1, stroke=0)
        c.setFillColor(BRAND_CYAN)
        c.rect(0, 0, PAGE_W, 2.2, fill=1, stroke=0)

    elif kind == "dashboard":
        c.setFillColor(BG_WHITE)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        c.setFillColor(BG_PALE)
        c.rect(0, PAGE_H - 92 * mm, PAGE_W, 92 * mm, fill=1, stroke=0)
        _draw_brand_motif(c, PAGE_W + 4 * mm, PAGE_H - 18 * mm, scale=0.8, alpha=0.05)

    elif kind == "transcript":
        c.setFillColor(BG_TRANSCRIPT)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    else:  # "analysis" — clean, minimal, a single faint corner motif
        c.setFillColor(BG_WHITE)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        _draw_brand_motif(c, PAGE_W + 6 * mm, -6 * mm, scale=0.7, alpha=0.045)

    c.restoreState()


# ======================================================================
# CUSTOM FLOWABLES
# ======================================================================

class KpiCard(Flowable):
    """
    A premium KPI card: white fill, soft offset "shadow", a slim coloured
    accent bar along the top, a small tinted icon bubble, a large bold
    value and a muted caption underneath — replaces the old solid-gradient
    tile with something closer to a modern analytics product.
    """

    def __init__(self, width, height, accent, icon, value, caption, subcaption=None):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.accent = accent
        self.icon = icon
        self.value = value
        self.caption = caption
        self.subcaption = subcaption

    def _icon(self, c, cx, cy):
        c.saveState()
        c.setStrokeColor(self.accent)
        c.setFillColor(self.accent)
        c.setLineWidth(1.3)
        if self.icon == "pulse":
            c.line(cx - 7, cy, cx - 3, cy)
            c.line(cx - 3, cy, cx - 1, cy + 5)
            c.line(cx - 1, cy + 5, cx + 2, cy - 6)
            c.line(cx + 2, cy - 6, cx + 4, cy)
            c.line(cx + 4, cy, cx + 7, cy)
        elif self.icon == "shield":
            p = c.beginPath()
            p.moveTo(cx, cy + 7)
            p.lineTo(cx + 6, cy + 4)
            p.lineTo(cx + 6, cy - 3)
            p.lineTo(cx, cy - 7)
            p.lineTo(cx - 6, cy - 3)
            p.lineTo(cx - 6, cy + 4)
            p.close()
            c.drawPath(p, fill=0, stroke=1)
        elif self.icon == "user":
            c.circle(cx, cy + 3, 3, fill=1, stroke=0)
            c.ellipse(cx - 5.5, cy - 7, cx + 5.5, cy - 1, fill=1, stroke=0)
        elif self.icon == "star":
            c.circle(cx, cy, 5, fill=0, stroke=1)
            c.circle(cx, cy, 1.6, fill=1, stroke=0)
        c.restoreState()

    def draw(self):
        c = self.canv
        c.saveState()

        # Soft shadow: a slightly larger, offset, low-alpha rounded rect.
        c.setFillColor(_alpha(colors.black, 0.06))
        c.roundRect(1.1, -1.3, self.width, self.height, 7)

        # Card body.
        c.setFillColor(BG_WHITE)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.7)
        c.roundRect(0, 0, self.width, self.height, 7, fill=1, stroke=1)

        # Top accent bar (clipped to the card's rounded corners).
        path = c.beginPath()
        path.roundRect(0, 0, self.width, self.height, 7)
        c.clipPath(path, stroke=0)
        c.setFillColor(self.accent)
        c.rect(0, self.height - 3.2, self.width, 3.2, fill=1, stroke=0)
        c.restoreState()

        # Icon bubble.
        c.saveState()
        c.setFillColor(_alpha(self.accent, 0.13))
        c.circle(16, self.height - 20, 10, fill=1, stroke=0)
        self._icon(c, 16, self.height - 20)
        c.restoreState()

        # Value + caption.
        c.saveState()
        value_text = self.value if len(str(self.value)) <= 16 else str(self.value)[:14] + "…"
        _draw_text(c, 11, self.height - 42, value_text, FONT_BOLD, 15.5,
                   TEXT_DARK, max_width=self.width - 20)
        _draw_text(c, 11, 18, self.caption.upper(), FONT_BOLD, 7.6,
                   TEXT_MUTED, max_width=self.width - 20)
        if self.subcaption:
            _draw_text(c, 11, 8, self.subcaption, FONT_REGULAR, 6.8,
                       TEXT_FAINT, max_width=self.width - 20)
        c.restoreState()


class ScoreBar(Flowable):
    """
    A horizontal score indicator: label left, track + filled bar, numeric
    (or categorical) value right. Used both for real 0-100 scores and for
    Low/Medium/High categorical fields — the fill length communicates the
    comparison, the printed label stays exactly as generated (never a
    fabricated number for a categorical field).
    """

    def __init__(self, width, label, pct, display_value, color, height=15):
        Flowable.__init__(self)
        self.width = width
        self.label = label
        self.pct = max(0.0, min(1.0, pct))
        self.display_value = display_value
        self.color = color
        self.height = height

    def draw(self):
        c = self.canv
        c.saveState()

        label_w = self.width * 0.37
        value_w = 30
        track_x = label_w
        track_w = self.width - label_w - value_w - 8

        _draw_text(c, 0, self.height / 2 - 3.2, self.label, FONT_REGULAR, 8.6, TEXT_DARK)

        bar_y = self.height / 2 - 3.5
        c.setFillColor(BORDER_SOFT)
        c.roundRect(track_x, bar_y, track_w, 7, 3.5, fill=1, stroke=0)
        fill_w = max(track_w * self.pct, 7 if self.pct > 0 else 0)
        if fill_w > 0:
            c.setFillColor(self.color)
            c.roundRect(track_x, bar_y, fill_w, 7, 3.5, fill=1, stroke=0)

        _draw_text(c, track_x + track_w + 8, self.height / 2 - 3.2,
                   str(self.display_value), FONT_BOLD, 8.6, self.color)
        c.restoreState()


class ScoreRing(Flowable):
    """Radial "hero" indicator for the single most important confidence
    figure — a thin grey full ring with a coloured progress arc overlaid,
    the numeric score centred inside."""

    def __init__(self, diameter, pct, label, color):
        Flowable.__init__(self)
        self.width = diameter
        self.height = diameter
        self.pct = max(0.0, min(1.0, pct))
        self.label = label
        self.color = color

    def draw(self):
        c = self.canv
        cx = self.width / 2
        cy = self.height / 2
        r = self.width / 2 - 6
        thickness = 7

        c.saveState()
        c.setLineCap(1)
        c.setStrokeColor(BORDER_SOFT)
        c.setLineWidth(thickness)
        c.arc(cx - r, cy - r, cx + r, cy + r, 0, 360)

        if self.pct > 0:
            c.setStrokeColor(self.color)
            c.setLineWidth(thickness)
            c.arc(cx - r, cy - r, cx + r, cy + r, 90, -360 * self.pct)

        score_text = self.label
        c.setFont(FONT_BOLD, 17)
        c.setFillColor(TEXT_DARK)
        c.drawCentredString(cx, cy - 6, _latin_safe(score_text))
        c.setFont(FONT_BOLD, 6.6)
        c.setFillColor(TEXT_MUTED)
        c.drawCentredString(cx, cy - 17, "OVERALL")
        c.restoreState()


class TimelineStep(Flowable):
    """One numbered node in a vertical timeline (used for action items and
    the critical-moments timeline): a circular index badge, a connecting
    line to the next node, and a title/body block to its right."""

    def __init__(self, width, index_label, color, title_style, title_markup,
                 body_flowables=None, is_last=False):
        Flowable.__init__(self)
        self.width = width
        self.index_label = index_label
        self.color = color
        self.title_para = _P(title_markup, title_style)
        self.body_flowables = body_flowables or []
        self.is_last = is_last
        self._content_width = width - 34

        for f in self.body_flowables:
            if hasattr(f, "wrapOn"):
                pass

    def wrap(self, availWidth, availHeight):
        self.width = min(self.width, availWidth)
        self._content_width = self.width - 34
        _, title_h = self.title_para.wrap(self._content_width, availHeight)
        body_h = 0
        for f in self.body_flowables:
            _, h = f.wrap(self._content_width, availHeight)
            body_h += h
        self.height = max(26, title_h + body_h + 14)
        return self.width, self.height

    def draw(self):
        c = self.canv
        badge_r = 9
        badge_cx = badge_r + 1
        badge_cy = self.height - badge_r - 1

        if not self.is_last:
            c.saveState()
            c.setStrokeColor(BORDER)
            c.setLineWidth(1.3)
            c.line(badge_cx, badge_cy - badge_r, badge_cx, 0)
            c.restoreState()

        c.saveState()
        c.setFillColor(self.color)
        c.circle(badge_cx, badge_cy, badge_r, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont(FONT_BOLD, 8)
        c.drawCentredString(badge_cx, badge_cy - 2.8, str(self.index_label))
        c.restoreState()

        text_x = 34
        y = self.height
        _, title_h = self.title_para.wrap(self._content_width, self.height)
        y -= title_h
        self.title_para.drawOn(c, text_x, y)

        for f in self.body_flowables:
            _, h = f.wrap(self._content_width, self.height)
            y -= h
            f.drawOn(c, text_x, y)


def timeline(story, styles, items, color=BRAND_BLUE):
    """items: list of (index_label, title_markup, [body_flowables])."""
    for i, (index_label, title_markup, body) in enumerate(items):
        is_last = i == len(items) - 1
        step = TimelineStep(
            CONTENT_WIDTH, index_label, color, styles["TimelineTitle"],
            title_markup, body_flowables=body, is_last=is_last,
        )
        story.append(step)
    story.append(Spacer(1, 6))



def severity_legend(story, styles):
    items = [("Low", SUCCESS), ("Medium", WARNING), ("High", colors.HexColor("#F97316")), ("Critical", DANGER)]
    cells = []
    for label, color in items:
        swatch = Table([[""]], colWidths=[6], rowHeights=[6])
        swatch.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), color)]))
        cells.append(swatch)
        cells.append(_P(label, styles["BodyMuted"]))

    t = Table([cells], colWidths=[8, 44] * 4)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))


def stat_cards_row(story, cards, gap=7):
    n = len(cards)
    col_width = (CONTENT_WIDTH - gap * (n - 1)) / n
    t = Table([cards], colWidths=[col_width] * n)
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), gap),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t)
    story.append(Spacer(1, 14))


def concern_card(index, text, styles, accent=BRAND_BLUE):
    number = _P(f'<font color="{accent.hexval()}"><b>{index:02d}</b></font>', styles["CardSubtitle"])
    body = _P(_esc(text), styles["Body"])
    t = Table([[number, body]], colWidths=[20, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


# ======================================================================
# HEADER / FOOTER
# ======================================================================

class BrandedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            if self._pageNumber > 1:
                self._draw_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def _draw_footer(self, total_pages):
        self.saveState()
        self.setStrokeColor(BORDER)
        self.setLineWidth(0.6)
        self.line(MARGIN_L, MARGIN_BOTTOM - 14, PAGE_W - MARGIN_R, MARGIN_BOTTOM - 14)

        self.setFont(FONT_REGULAR, 8)
        self.setFillColor(TEXT_MUTED)
        self.drawString(MARGIN_L, MARGIN_BOTTOM - 26,
                         "Confidential  |  AI Service Desk Report  |  Shatarupax AI Labs")

        # Real physical page number / real physical total — never an
        # offset count that excludes the cover (rule: "never hardcode
        # Page 1 of 4"; this must match what the reader is actually
        # looking at).
        page_label = f"Page {self._pageNumber} of {total_pages}"
        self.drawRightString(PAGE_W - MARGIN_R, MARGIN_BOTTOM - 26, page_label)
        self.restoreState()


def _draw_running_header(c, doc):
    if doc.page == 1:
        return

    c.saveState()

    try:
        logo_h = 8 * mm
        logo_w = logo_h * LOGO_ASPECT
        c.drawImage(LOGO_PATH, MARGIN_L, PAGE_H - MARGIN_TOP + 11,
                    width=logo_w, height=logo_h,
                    preserveAspectRatio=True, mask="auto")
    except Exception:
        pass

    c.setFont(FONT_BOLD, 8.5)
    c.setFillColor(BRAND_NAVY)
    c.drawRightString(PAGE_W - MARGIN_R, PAGE_H - MARGIN_TOP + 15, REPORT_TITLE)

    c.setFont(FONT_REGULAR, 7)
    c.setFillColor(TEXT_MUTED)
    c.drawRightString(PAGE_W - MARGIN_R, PAGE_H - MARGIN_TOP + 7, REPORT_SUBTITLE)

    c.setStrokeColor(BRAND_CYAN)
    c.setLineWidth(1.2)
    c.line(MARGIN_L, PAGE_H - MARGIN_TOP, PAGE_W - MARGIN_R, PAGE_H - MARGIN_TOP)

    c.restoreState()


# ======================================================================
# COVER PAGE — light, editorial, asymmetric; the logo sits in open white
# space (it has no transparency) with brand curves kept well clear of it
# and of the text column.
# ======================================================================

def build_cover_page(story, styles, meta=None):
    meta = meta or {}

    story.append(Spacer(1, 34 * mm))

    try:
        logo_w = 46 * mm
        logo_h = logo_w / LOGO_ASPECT
        img = Image(LOGO_PATH, width=logo_w, height=logo_h)
        img.hAlign = "LEFT"
        story.append(img)
    except Exception:
        pass

    story.append(Spacer(1, 2 * mm))
    story.append(_P(COMPANY_TAGLINE, ParagraphStyle(
        "CoverTag", fontName=FONT_BOLD, fontSize=7, leading=10,
        textColor=BRAND_CYAN, alignment=TA_LEFT,
    )))

    story.append(Spacer(1, 20 * mm))
    story.append(HRFlowable(width="18%", thickness=2.4, color=BRAND_CYAN,
                             spaceBefore=0, spaceAfter=10, hAlign="LEFT"))
    story.append(_P(REPORT_TITLE, styles["CoverTitle"]))
    story.append(_P(REPORT_SUBTITLE, styles["CoverSubtitle"]))

    story.append(Spacer(1, 16 * mm))

    call_id = meta.get("call_id") or "N/A"
    generated = meta.get("generated_on") or _now_ist().strftime("%d %B %Y, %I:%M %p")
    agent = meta.get("agent_name") or "N/A"

    story.append(_P("CALL REFERENCE", styles["CoverMetaLabel"]))
    story.append(_P(_esc(call_id), styles["CoverMeta"]))
    story.append(Spacer(1, 4))
    story.append(_P("AGENT", styles["CoverMetaLabel"]))
    story.append(_P(_esc(agent), styles["CoverMeta"]))
    story.append(Spacer(1, 4))
    # Exact "Generated on: <value>" wording preserved (not split into a
    # separate label line) — downstream tooling/tests key off this literal
    # phrase to confirm a real timestamp was stamped, never "None".
    story.append(_P(f"Generated on: {_esc(generated)}", styles["CoverMeta"]))

    story.append(Spacer(1, 30 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=BORDER,
                             spaceBefore=0, spaceAfter=8, hAlign="LEFT"))
    story.append(_P("CONFIDENTIAL — INTERNAL USE ONLY", styles["CoverFooter"]))
    story.append(PageBreak())


# ======================================================================
# REUSABLE SECTION HELPERS
# ======================================================================

def section_heading(story, styles, text, accent_color=BRAND_BLUE):
    """Section heading with a slim colour accent bar on the left."""
    bar = Table([[""]], colWidths=[3.2], rowHeights=[15])
    bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), accent_color)]))

    heading_row = Table(
        [[bar, _P(text.upper(), styles["SectionHeading"])]],
        colWidths=[9, None],
    )
    heading_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    story.append(Spacer(1, 13))
    story.append(heading_row)
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER,
                             spaceBefore=6, spaceAfter=9))


_LEVEL_COLOR_BY_POLARITY = {
    # polarity "positive": High is desirable (Professionalism, Cooperation...)
    "positive": {"low": DANGER, "medium": WARNING, "moderate": WARNING, "high": SUCCESS},
    # polarity "negative": High is undesirable (Frustration...)
    "negative": {"low": SUCCESS, "medium": WARNING, "moderate": WARNING, "high": DANGER},
}


def level_rows(story, styles, rows):
    """rows: list of (label, raw_value, polarity) where raw_value is
    typically Low/Medium/High (or any free text) and polarity says whether
    "High" is good ("positive", e.g. Professionalism) or bad ("negative",
    e.g. Frustration) for THIS field — otherwise "High Professionalism"
    and "High Frustration" would wrongly get the same colour. The fill
    length always reflects the level; the printed value is always the
    exact text generated, never a fabricated number."""
    for label, value, polarity in rows:
        key = str(value).strip().lower()
        pct = LEVEL_PCT.get(key, 0.0 if value in (None, "", "N/A") else 0.5)
        color = _LEVEL_COLOR_BY_POLARITY.get(polarity, {}).get(key) or BRAND_BLUE
        if key in ("", "n/a", "none"):
            color = TEXT_FAINT
        story.append(ScoreBar(CONTENT_WIDTH, label, pct, _esc(value, "N/A"), color))
        story.append(Spacer(1, 5))
    story.append(Spacer(1, 4))


def bullet_list(story, styles, items, empty_text="None reported."):
    if not items:
        story.append(_P(empty_text, styles["BodyMuted"]))
        return
    for item in items:
        story.append(_P(f"•  {_esc(item)}", styles["Body"]))


def critical_moment_timeline(story, styles, moments, color_fn=None):
    items = []
    for i, moment in enumerate(moments, start=1):
        sev = str(moment.get("severity") or "N/A")
        accent = SEVERITY_COLORS.get(sev.strip().lower(), TEXT_MUTED)

        title = f'<b>{_esc(moment.get("category", "Moment"))}</b> &nbsp; {severity_badge(sev)}'

        meta_line = _P(
            f'<font color="#64748B">{_esc(moment.get("start_time", "N/A"))} &nbsp;·&nbsp; '
            f'{_esc(moment.get("speaker", "N/A"))}</font>',
            styles["BodyMuted"],
        )
        quote = _P(f'&ldquo;{_esc(moment.get("quote"))}&rdquo;', styles["Quote"])

        items.append((i, title, [Spacer(1, 2), meta_line, Spacer(1, 2), quote, Spacer(1, 10)]))

    timeline(story, styles, items, color=BRAND_BLUE)


# Risk-level keywords the AI's OWN free-text risk_assessment may already
# contain (e.g. "Low risk of recurrence...", "...poses minimal disruption
# risk."). Only used to pick an honest accent colour/badge for the risk
# card — never to invent a level the text doesn't itself state.
_RISK_KEYWORDS = [
    ("critical", DANGER), ("severe", DANGER), ("high", DANGER), ("significant", DANGER),
    ("moderate", WARNING), ("medium", WARNING),
    ("low", SUCCESS), ("minimal", SUCCESS), ("minor", SUCCESS), ("negligible", SUCCESS),
]

# A level word directly negated ("no significant risk", "not a high risk")
# means the OPPOSITE of that word's usual colour — naive keyword matching
# would otherwise show a red "SIGNIFICANT RISK" badge on text that is
# explicitly saying there is no such risk. Only the few words immediately
# before the keyword are checked, so an unrelated earlier "no" elsewhere in
# the sentence doesn't suppress a real, later risk statement.
_NEGATION_WORDS = ("no", "not", "non", "without", "never", "n't")


def _detect_risk_level(text):
    lowered = str(text or "").lower()
    for keyword, color in _RISK_KEYWORDS:
        for match in re.finditer(r"\b" + re.escape(keyword) + r"\b", lowered):
            preceding = lowered[max(0, match.start() - 20):match.start()].split()
            if any(w in _NEGATION_WORDS for w in preceding[-3:]):
                continue
            return keyword.upper(), color
    return None, TEXT_MUTED


def risk_card(story, styles, risk_text):
    level, color = _detect_risk_level(risk_text)
    label = f"{level} RISK" if level else "RISK NOTED"

    header = _P(f'<font color="{color.hexval()}"><b>{label}</b></font>', styles["SubHeading"])
    body = _P(_esc(risk_text), styles["Body"])

    card = Table([["", [header, Spacer(1, 3), body]]], colWidths=[4, None])
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), color),
        ("BACKGROUND", (1, 0), (1, -1), BG_PALE),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 12), ("RIGHTPADDING", (1, 0), (1, 0), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(KeepTogether(card))
    story.append(Spacer(1, 6))


def _investigation_icon(c, cx, cy, color):
    """A small magnifying-glass mark (circle + handle) for the root-cause
    card — a restrained visual cue, not a fabricated multi-stage diagram."""
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(1.4)
    c.circle(cx - 1, cy + 1, 4.5, fill=0, stroke=1)
    c.line(cx + 2.1, cy - 2.1, cx + 5, cy - 5)
    c.restoreState()


class IconLabel(Flowable):
    def __init__(self, text, color, style):
        Flowable.__init__(self)
        self.para = _P(text, style)
        self.color = color

    def wrap(self, availWidth, availHeight):
        w, h = self.para.wrap(availWidth - 16, availHeight)
        self.width, self.height = availWidth, max(h, 14)
        return self.width, self.height

    def draw(self):
        _investigation_icon(self.canv, 5, self.height - 7, self.color)
        self.para.drawOn(self.canv, 15, self.height - 11)


def root_cause_card(story, styles, text):
    header = IconLabel("<b>ROOT CAUSE ANALYSIS</b>", BRAND_NAVY, styles["SubHeading"])
    body = _P(_esc(text), styles["Body"])
    card = Table([["", [header, Spacer(1, 4), body]]], colWidths=[4, None])
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), BRAND_NAVY),
        ("BACKGROUND", (1, 0), (1, -1), BG_PALE),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 12), ("RIGHTPADDING", (1, 0), (1, 0), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(KeepTogether(card))
    story.append(Spacer(1, 6))


# ---- emotional cues -> timeline (only using real, already-generated data) --

_EMOTION_CUE_RE = re.compile(
    r"^(?P<label>[^(]+?)\s*(?:\((?P<start>\d{1,2}:\d{2}(?::\d{2})?)"
    r"(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\))?\s*$"
)


def _parse_emotional_cue(cue):
    match = _EMOTION_CUE_RE.match(str(cue).strip())
    if not match:
        return str(cue).strip(), None
    label = match.group("label").strip()
    start = match.group("start")
    return label, start


def _timestamp_sort_key(ts):
    if not ts:
        return (9999, 9999, 9999)
    parts = [int(p) for p in ts.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    return tuple(parts)


def emotion_timeline(story, styles, cues):
    if not cues:
        story.append(_P("No emotional cues detected.", styles["BodyMuted"]))
        return

    parsed = [(_parse_emotional_cue(cue), cue) for cue in cues]
    parsed.sort(key=lambda item: _timestamp_sort_key(item[0][1]))

    items = []
    for i, ((label, start), _raw) in enumerate(parsed, start=1):
        title = f"<b>{_esc(label.title())}</b>"
        body = []
        if start:
            body.append(_P(f'<font color="#64748B">{_esc(start)}</font>', styles["BodyMuted"]))
        body.append(Spacer(1, 8))
        items.append((i, title, body))

    timeline(story, styles, items, color=BRAND_PURPLE)


# ---- transcript: grouped into real timestamp windows, no fabricated speakers --

def _group_segments_by_window(segments, window_seconds=20):
    """Merge consecutive Whisper segments into ~window_seconds blocks. Pure
    regrouping of real (start, end, text) data — no words are changed."""
    blocks = []
    current_start = None
    current_end = None
    current_text = []

    for seg in segments:
        start = seg.get("start", 0) or 0
        end = seg.get("end", start) or start
        text = (seg.get("text") or "").strip()
        if not text:
            continue

        if current_start is None:
            current_start, current_end, current_text = start, end, [text]
            continue

        if start - current_start > window_seconds and current_text:
            blocks.append({"start": current_start, "end": current_end, "text": " ".join(current_text)})
            current_start, current_end, current_text = start, end, [text]
        else:
            current_end = end
            current_text.append(text)

    if current_text:
        blocks.append({"start": current_start, "end": current_end, "text": " ".join(current_text)})

    return blocks


def _fmt_ts(seconds):
    try:
        seconds = int(seconds)
    except (TypeError, ValueError):
        return "00:00:00"
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02}:{m:02}:{s:02}"


def transcript_blocks(story, styles, segments):
    for block in segments:
        ts_label = f"{_fmt_ts(block['start'])} – {_fmt_ts(block['end'])}"
        row = Table(
            [[_P(ts_label, styles["TranscriptTime"]), _P(_esc(block["text"]), styles["TranscriptBody"])]],
            colWidths=[62, None],
        )
        row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDER_SOFT),
        ]))
        story.append(row)


# ======================================================================
# MAIN ENTRY POINT
# ======================================================================

def generate_pdf_report(transcript, analysis, output_path, meta=None, segments=None):
    if meta is None:
        call_meta = analysis.get("call_metadata", {})
        if not isinstance(call_meta, dict):
            call_meta = {}
        meta = {
            "call_id": analysis.get("call_id") or call_meta.get("call_id", "N/A"),
            "agent_name": analysis.get("agent_name") or call_meta.get("agent_name", "N/A"),
            "generated_on": _now_ist().strftime("%d %B %Y, %I:%M %p"),
        }
        meta = {k: (v if v else "N/A") for k, v in meta.items()}

    # Always stamp a real generation time — callers may pass None/omit it.
    meta = dict(meta)
    meta["generated_on"] = meta.get("generated_on") or _now_ist().strftime("%d %B %Y, %I:%M %p")
    meta["call_id"] = meta.get("call_id") or "N/A"
    meta["agent_name"] = meta.get("agent_name") or "N/A"

    styles = build_styles()
    story = []

    # ---------- Cover Page ----------
    build_cover_page(story, styles, meta)

    # ---------- Executive dashboard ----------
    scorecard = _as_dict(analysis, "confidence_scorecard")
    overall_score = scorecard.get("overall_call_confidence_score", 0)
    customer_score = scorecard.get("customer_experience_score", 0)
    agent_score = scorecard.get("agent_performance_score", 0)
    customer_sentiment_label = _as_dict(analysis, "customer_sentiment").get("overall") or "Neutral"
    agent_sentiment_label = _as_dict(analysis, "agent_sentiment").get("overall") or "Neutral"

    def _to_float(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    section_heading(story, styles, "Call Intelligence Overview", accent_color=BRAND_CYAN)
    story.append(_P(f'<b>{_esc(meta.get("call_id"))}</b>', styles["CardTitle"]))
    story.append(_P(f"Generated {_esc(meta.get('generated_on'))} &nbsp;·&nbsp; Agent: {_esc(meta.get('agent_name'))}",
                     styles["CardCaption"]))
    story.append(Spacer(1, 10))

    card_h = 30 * mm
    gap = 7
    ring_w = (CONTENT_WIDTH - gap * 2) / 3
    card1 = KpiCard(ring_w, card_h, sentiment_color(customer_sentiment_label), "pulse",
                     str(customer_sentiment_label), "Overall Sentiment")
    card2 = KpiCard(ring_w, card_h, BRAND_PURPLE, "star",
                     f"{customer_score or 0:.0f}/100", "Customer Experience")
    card3 = KpiCard(ring_w, card_h, BRAND_BLUE, "shield",
                     f"{agent_score or 0:.0f}/100", "Agent Performance")
    stat_cards_row(story, [card1, card2, card3])

    ring = ScoreRing(32 * mm, _to_float(overall_score) / 100.0, f"{_to_float(overall_score):.0f}", BRAND_NAVY)
    ring_caption = _P(
        "<b>Overall Call Confidence</b><br/>"
        "<font color='#64748B' size='8'>Weighted across customer experience and agent "
        "performance.</font>",
        styles["Body"],
    )
    ring_row = Table([[ring, ring_caption]], colWidths=[40 * mm, None])
    ring_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(ring_row)

    # ---------- Executive Summary ----------
    section_heading(story, styles, "Executive Summary")
    story.append(_P(_esc(analysis.get("executive_summary")), styles["Body"]))

    # ---------- Customer Analysis ----------
    story.append(PageBreak())
    section_heading(story, styles, "Customer Analysis", accent_color=GRAD_GREEN[1])
    customer_sentiment = _as_dict(analysis, "customer_sentiment")
    customer_behavior = _as_dict(analysis, "customer_behavior")
    story.append(ScoreBar(CONTENT_WIDTH, "Overall Sentiment", 1.0 if customer_sentiment_label else 0,
                          _esc(customer_sentiment.get("overall", "N/A")),
                          sentiment_color(customer_sentiment_label)))
    story.append(Spacer(1, 5))
    story.append(ScoreBar(CONTENT_WIDTH, "Journey", 1.0 if customer_sentiment.get("journey") else 0,
                          _esc(customer_sentiment.get("journey", "N/A")), BRAND_BLUE))
    story.append(Spacer(1, 9))
    level_rows(story, styles, [
        ("Frustration Level", customer_behavior.get("frustration_level", "N/A"), "negative"),
        ("Cooperation Level", customer_behavior.get("cooperation_level", "N/A"), "positive"),
        ("Satisfaction Level", customer_behavior.get("satisfaction_level", "N/A"), "positive"),
    ])
    story.append(_P("Detailed Analysis", styles["SubHeading"]))
    story.append(_P(_esc(customer_sentiment.get("detailed_analysis")), styles["Body"]))
    story.append(_P(_esc(customer_behavior.get("detailed_analysis")), styles["Body"]))

    # ---------- Agent Analysis ----------
    section_heading(story, styles, "Agent Analysis", accent_color=GRAD_BLUE[1])
    agent_sentiment = _as_dict(analysis, "agent_sentiment")
    agent_behavior = _as_dict(analysis, "agent_behavior")
    story.append(ScoreBar(CONTENT_WIDTH, "Overall Sentiment", 1.0 if agent_sentiment_label else 0,
                          _esc(agent_sentiment.get("overall", "N/A")),
                          sentiment_color(agent_sentiment_label)))
    story.append(Spacer(1, 9))
    level_rows(story, styles, [
        ("Professionalism", agent_behavior.get("professionalism", "N/A"), "positive"),
        ("Empathy", agent_behavior.get("empathy", "N/A"), "positive"),
        ("Resolution Focus", agent_behavior.get("resolution_focus", "N/A"), "positive"),
        ("Communication Quality", agent_behavior.get("communication_quality", "N/A"), "positive"),
    ])
    story.append(_P("Detailed Analysis", styles["SubHeading"]))
    story.append(_P(_esc(agent_sentiment.get("detailed_analysis")), styles["Body"]))
    story.append(_P(_esc(agent_behavior.get("detailed_analysis")), styles["Body"]))

    # ---------- Confidence Score ----------
    section_heading(story, styles, "Confidence Score", accent_color=BRAND_PURPLE)

    def score_color(v):
        v = _to_float(v)
        if v >= 70:
            return SUCCESS
        if v >= 40:
            return WARNING
        return DANGER

    for label, key in [
        ("Customer Experience", "customer_experience_score"),
        ("Agent Performance", "agent_performance_score"),
        ("Overall Call Confidence", "overall_call_confidence_score"),
    ]:
        val = scorecard.get(key)
        pct = _to_float(val) / 100.0
        story.append(ScoreBar(CONTENT_WIDTH, label, pct, f"{_to_float(val):.0f}", score_color(val)))
        story.append(Spacer(1, 6))
    story.append(Spacer(1, 4))

    # ---------- Key Concerns ----------
    section_heading(story, styles, "Key Customer Concerns", accent_color=WARNING)
    concerns = analysis.get("key_customer_concerns") or []
    if concerns:
        for i, concern in enumerate(concerns, start=1):
            story.append(concern_card(i, concern, styles, accent=WARNING))
    else:
        story.append(_P("None reported.", styles["BodyMuted"]))

    # ---------- Emotional Cues ----------
    section_heading(story, styles, "Customer Emotional Journey", accent_color=BRAND_PURPLE)
    emotion_timeline(story, styles, analysis.get("emotional_cues") or [])

    # ---------- Action Items ----------
    section_heading(story, styles, "Action Plan", accent_color=GRAD_BLUE[1])
    actions = analysis.get("action_items") or []
    if actions:
        items = [(i, f"<b>{_esc(a)}</b>", [Spacer(1, 10)]) for i, a in enumerate(actions, start=1)]
        timeline(story, styles, items, color=BRAND_BLUE)
    else:
        story.append(_P("None reported.", styles["BodyMuted"]))

    # ---------- Positive Observations ----------
    section_heading(story, styles, "Positive Observations", accent_color=SUCCESS)
    bullet_list(story, styles, analysis.get("positive_observations") or [])

    # ---------- Root Cause ----------
    section_heading(story, styles, "Root Cause Analysis")
    root_cause_card(story, styles, analysis.get("root_cause_analysis"))

    # ---------- Risk ----------
    section_heading(story, styles, "Risk Assessment", accent_color=DANGER)
    risk_card(story, styles, analysis.get("risk_assessment"))

    # ---------- Critical Conversation Moments ----------
    section_heading(story, styles, "Critical Conversation Moments", accent_color=WARNING)
    critical_moments = [
        m for m in (analysis.get("critical_conversation_moments") or [])
        if isinstance(m, dict)
    ]
    if critical_moments:
        severity_legend(story, styles)
        critical_moment_timeline(story, styles, critical_moments)
    else:
        story.append(_P("✓  No critical conversation moments detected.", styles["BodyMuted"]))

    # ---------- Full Transcript ----------
    story.append(NextPageTemplate("Transcript"))
    story.append(PageBreak())
    section_heading(story, styles, "Full Transcript", accent_color=BRAND_NAVY)

    if segments:
        blocks = _group_segments_by_window(segments)
        if blocks:
            transcript_blocks(story, styles, blocks)
        else:
            story.append(_P(_esc(transcript), styles["TranscriptBody"]))
    else:
        story.append(_P(_esc(transcript), styles["TranscriptBody"]))

    # ---------- Build doc ----------
    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title=REPORT_TITLE,
        author=COMPANY_NAME,
    )

    cover_frame = Frame(0, 0, PAGE_W, PAGE_H, id="cover", leftPadding=28 * mm,
                         rightPadding=24 * mm, topPadding=0, bottomPadding=0)

    content_frame = Frame(MARGIN_L, MARGIN_BOTTOM + 16, PAGE_W - MARGIN_L - MARGIN_R,
                       PAGE_H - MARGIN_TOP - MARGIN_BOTTOM - 16, id="content",
                       topPadding=14, bottomPadding=10,
                       leftPadding=0, rightPadding=0)

    transcript_frame = Frame(MARGIN_L, MARGIN_BOTTOM + 16, PAGE_W - MARGIN_L - MARGIN_R,
                       PAGE_H - MARGIN_TOP - MARGIN_BOTTOM - 16, id="transcript_content",
                       topPadding=14, bottomPadding=10,
                       leftPadding=0, rightPadding=0)

    def on_cover(c, d):
        draw_page_background(c, "cover")

    def on_dashboard(c, d):
        draw_page_background(c, "dashboard")
        _draw_running_header(c, d)

    def on_content(c, d):
        draw_page_background(c, "analysis")
        _draw_running_header(c, d)

    def on_transcript(c, d):
        draw_page_background(c, "transcript")
        _draw_running_header(c, d)

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=on_cover),
        PageTemplate(id="Dashboard", frames=[content_frame], onPage=on_dashboard),
        PageTemplate(id="Content", frames=[content_frame], onPage=on_content),
        PageTemplate(id="Transcript", frames=[transcript_frame], onPage=on_transcript),
    ])

    story.insert(0, NextPageTemplate("Cover"))
    # The dashboard template applies to the page right after the cover's
    # own PageBreak; everything from "Customer Analysis" onward (the next
    # forced PageBreak) switches to the plainer "Content" analysis
    # template. The transcript's own NextPageTemplate (inserted above,
    # right before its PageBreak) takes over from there. Indices are
    # collected from the ORIGINAL, unmodified list first and inserted
    # highest-index-first so each insertion never shifts a not-yet-handled
    # index (inserting in iteration order into a list being iterated would
    # misplace every marker after the first).
    page_break_indices = [i for i, f in enumerate(story) if isinstance(f, PageBreak)]
    for template_name, break_idx in reversed(list(zip(
        ["Dashboard", "Content"], page_break_indices[:2]
    ))):
        story.insert(break_idx, NextPageTemplate(template_name))

    doc.build(story, canvasmaker=BrandedCanvas)
    return output_path
