"""
MVP-level PII / sensitive-data detection and redaction.

Scope (see project brief, Pillar 2): a practical safety baseline, not
enterprise-grade compliance. Regex-based, deterministic, and modular so the
`Detector` class can later be swapped for a stronger provider without
touching call sites.

Design:
  - Each `_Rule` has a priority (lower = more specific / trusted) and either
    a plain regex or a regex + `validate(match) -> bool` callback (used for
    credit-card Luhn checks so a random 16-digit string is not flagged).
  - `redact()` finds ALL rule matches, resolves overlaps (best priority,
    then longest match wins), and replaces them right-to-left so earlier
    offsets stay valid.
  - The redacted text is a placeholder token per finding type
    (e.g. "[EMAIL_REDACTED]") — the original matched value is NEVER
    returned, stored, or logged. Only a type + count summary is exposed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Optional


@dataclass(frozen=True)
class Finding:
    type: str
    start: int
    end: int


@dataclass(frozen=True)
class RedactionResult:
    text: str
    detected: bool
    findings: list[dict]  # [{"type": "EMAIL", "count": 2}, ...] — no raw values


@dataclass(frozen=True)
class _Rule:
    type: str
    pattern: "re.Pattern"
    priority: int
    validate: Optional[Callable[["re.Match"], bool]] = None


# ---------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------

def _luhn_valid(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _validate_card(match: "re.Match") -> bool:
    digits = re.sub(r"[ -]", "", match.group(0))
    return 13 <= len(digits) <= 19 and _luhn_valid(digits)


def _validate_phone(match: "re.Match") -> bool:
    digits = re.sub(r"\D", "", match.group(0))
    return 7 <= len(digits) <= 15


# ---------------------------------------------------------------------
# Rules (priority 0 = highest confidence / resolved first on overlap)
# ---------------------------------------------------------------------

DEFAULT_RULES: list[_Rule] = [
    _Rule(
        "SECRET",
        re.compile(
            r"(?i)\b(?:api[_ -]?key|secret|access[_ -]?token|bearer)\b\s*[:=]?\s*"
            r"[A-Za-z0-9._\-]{8,}"
        ),
        priority=0,
    ),
    _Rule(
        "PASSWORD",
        re.compile(
            r"(?i)\b(?:password|pwd|passcode|pin)\b\s*(?:is|was|:|=)\s*\S+"
        ),
        priority=0,
    ),
    _Rule(
        "EMAIL",
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
        priority=1,
    ),
    _Rule(
        "API_KEY",
        re.compile(
            r"\b(?:sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|"
            r"(?=[A-Za-z0-9_\-]{32,}\b)(?:[A-Za-z]*[0-9][A-Za-z0-9_\-]*[A-Za-z]"
            r"[A-Za-z0-9_\-]*|[A-Za-z0-9_\-]*[A-Za-z][A-Za-z0-9_\-]*[0-9]"
            r"[A-Za-z0-9_\-]*))\b"
        ),
        priority=2,
    ),
    _Rule(
        "CREDIT_CARD",
        re.compile(r"\b(?:\d[ -]?){13,19}\b"),
        priority=3,
        validate=_validate_card,
    ),
    _Rule(
        "AADHAAR",
        re.compile(r"\b\d{4}[ -]?\d{4}[ -]?\d{4}\b"),
        priority=4,
    ),
    _Rule(
        "PHONE",
        re.compile(r"\+?\d[\d\-\s().]{8,14}\d"),
        priority=5,
        validate=_validate_phone,
    ),
]


class PIIDetector:
    """Modular regex-based detector. Swap `rules` for a stronger provider later."""

    def __init__(self, rules: Optional[list[_Rule]] = None):
        self.rules = rules if rules is not None else DEFAULT_RULES

    def _matches(self, text: str) -> list[Finding]:
        candidates: list[Finding] = []

        for rule in self.rules:
            for match in rule.pattern.finditer(text):
                if rule.validate and not rule.validate(match):
                    continue
                candidates.append(
                    Finding(rule.type, match.start(), match.end())
                )

        return self._resolve_overlaps(candidates)

    @staticmethod
    def _priority_of(rules: list[_Rule], type_: str) -> int:
        for rule in rules:
            if rule.type == type_:
                return rule.priority
        return 99

    def _resolve_overlaps(self, candidates: list[Finding]) -> list[Finding]:
        ordered = sorted(
            candidates,
            key=lambda f: (f.start, self._priority_of(self.rules, f.type), -(f.end - f.start)),
        )

        result: list[Finding] = []

        for finding in ordered:
            if not result:
                result.append(finding)
                continue

            last = result[-1]

            if finding.start < last.end:
                last_priority = self._priority_of(self.rules, last.type)
                this_priority = self._priority_of(self.rules, finding.type)

                better = (this_priority, -(finding.end - finding.start)) < (
                    last_priority,
                    -(last.end - last.start),
                )

                if better:
                    result[-1] = finding

                continue

            result.append(finding)

        return result

    def redact(self, text: str) -> RedactionResult:
        if not text:
            return RedactionResult(text=text or "", detected=False, findings=[])

        findings = self._matches(text)

        if not findings:
            return RedactionResult(text=text, detected=False, findings=[])

        redacted = text
        counts: dict[str, int] = {}

        for finding in sorted(findings, key=lambda f: f.start, reverse=True):
            placeholder = f"[{finding.type}_REDACTED]"
            redacted = redacted[: finding.start] + placeholder + redacted[finding.end :]
            counts[finding.type] = counts.get(finding.type, 0) + 1

        summary = [
            {"type": type_, "count": count}
            for type_, count in sorted(counts.items())
        ]

        return RedactionResult(text=redacted, detected=True, findings=summary)


_default_detector = PIIDetector()


def redact_text(text: str) -> RedactionResult:
    """Module-level convenience using the default rule set."""
    return _default_detector.redact(text)
