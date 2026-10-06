"""
PII detection/redaction (Pillar 2). Regex-based MVP baseline: detect common
identifiers, redact them with typed placeholders, and never expose the raw
matched value — only a type+count summary.
"""

from app.services.pii_redaction import redact_text


def test_email_is_redacted():
    result = redact_text("Please reach me at jane.doe@example.com for updates.")

    assert result.detected is True
    assert "jane.doe@example.com" not in result.text
    assert "[EMAIL_REDACTED]" in result.text
    assert result.findings == [{"type": "EMAIL", "count": 1}]


def test_credit_card_is_redacted_and_validated_with_luhn():
    # A real Luhn-valid test card number.
    result = redact_text("Card on file: 4532015112830366 expiring next year.")

    assert result.detected is True
    assert "4532015112830366" not in result.text
    assert any(f["type"] == "CREDIT_CARD" for f in result.findings)


def test_random_16_digit_number_failing_luhn_is_not_flagged_as_a_card():
    # Same length as a card number but not Luhn-valid, and not phone/aadhaar
    # shaped either -> should not be misreported as a credit card.
    result = redact_text("Order reference 1111111111111112 was cancelled.")

    assert not any(f["type"] == "CREDIT_CARD" for f in result.findings)


def test_aadhaar_like_number_is_redacted():
    result = redact_text("Aadhaar number 1234 5678 9012 was provided for verification.")

    assert result.detected is True
    assert "1234 5678 9012" not in result.text
    assert any(f["type"] == "AADHAAR" for f in result.findings)


def test_password_phrase_is_redacted():
    result = redact_text("He said the password is Summer2024! over the phone.")

    assert result.detected is True
    assert "Summer2024!" not in result.text
    assert any(f["type"] == "PASSWORD" for f in result.findings)


def test_api_key_like_secret_is_redacted():
    result = redact_text("Use api_key: sk-abcdefghijklmnopqrstuvwx1234 to authenticate.")

    assert result.detected is True
    assert "sk-abcdefghijklmnopqrstuvwx1234" not in result.text


def test_phone_number_is_redacted():
    result = redact_text("Call me back at +1 (555) 123-4567 tomorrow morning.")

    assert result.detected is True
    assert "555" not in result.text or "[PHONE_REDACTED]" in result.text
    assert any(f["type"] == "PHONE" for f in result.findings)


def test_clean_transcript_has_no_findings():
    result = redact_text(
        "Hello, thanks for calling support. How can I help you with your "
        "order today? I understand the issue and I will fix it right away."
    )

    assert result.detected is False
    assert result.findings == []
    assert "REDACTED" not in result.text


def test_short_numbers_and_dates_are_not_false_positives():
    result = redact_text(
        "The call lasted 45 minutes, cost was 100 dollars, and it happened "
        "on 12/05/2024 at case number 42."
    )

    assert result.detected is False


def test_overlapping_matches_keep_the_higher_priority_type():
    # An email contains digit-free text so this mainly checks that a
    # PASSWORD-context match does not also get double counted as PHONE/etc.
    result = redact_text("Login email is admin@example.com and password: Xk9!mZq2")

    types = {f["type"] for f in result.findings}
    assert "EMAIL" in types
    assert "PASSWORD" in types


def test_redaction_result_never_contains_raw_values_in_findings_summary():
    result = redact_text("Contact jane@example.com or 4532015112830366.")

    for finding in result.findings:
        assert set(finding.keys()) == {"type", "count"}


def test_empty_and_none_text_are_handled_safely():
    assert redact_text("").detected is False
    assert redact_text(None).detected is False
