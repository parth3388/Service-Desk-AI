"""
app/services/email_service.py
------------------------------
Handles sending emails via Gmail SMTP:
  1. send_report_email()          -> PDF attachment + summary (Feature #1)
  2. send_verification_email()    -> registration verification link (Feature #2)
  3. send_contact_email()         -> Contact Us form submissions (Feature #3)
  4. send_password_reset_email()  -> forgot-password reset link (Feature #4)

Uses SMTP settings from app.core.config (same pattern as rest of the app).
"""

import smtplib
from email.message import EmailMessage
from pathlib import Path

from app.core import config


def _send(msg: EmailMessage) -> None:
    """
    Low-level sender — shared by all email types.

    The timeout applies to the connection and to every socket operation, so
    an unreachable/stalled SMTP server raises instead of hanging forever.
    """
    with smtplib.SMTP(
        config.SMTP_HOST,
        config.SMTP_PORT,
        timeout=config.SMTP_TIMEOUT,
    ) as server:
        server.starttls()
        server.login(config.SMTP_USERNAME, config.SMTP_APP_PASSWORD)
        server.send_message(msg)


def send_report_email(
    to_email: str,
    subject: str,
    summary_text: str,
    pdf_path: str,
) -> None:
    """
    Feature #1 — send generated PDF report + summary to a recipient.
    Call this right after pdf_generator finishes generating the PDF.
    """
    pdf_file = Path(pdf_path)
    if not pdf_file.exists():
        raise FileNotFoundError(f"PDF not found at {pdf_path}")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{config.FROM_NAME} <{config.SMTP_USERNAME}>"
    msg["To"] = to_email
    msg.set_content(
        f"""Hi,

Here is the latest report summary:

{summary_text}

The full report is attached as a PDF.

— {config.FROM_NAME}
"""
    )

    msg.add_attachment(
        pdf_file.read_bytes(),
        maintype="application",
        subtype="pdf",
        filename=pdf_file.name,
    )

    _send(msg)


def send_verification_email(to_email: str, token: str) -> None:
    """
    Feature #2 — send account verification link on registration.
    """
    verify_link = f"{config.BACKEND_URL}/auth/verify-email?token={token}"

    msg = EmailMessage()
    msg["Subject"] = "Verify your email — AI Service Desk"
    msg["From"] = f"{config.FROM_NAME} <{config.SMTP_USERNAME}>"
    msg["To"] = to_email
    msg.set_content(
        f"""Hi,

Thanks for registering. Please verify your email address by clicking the link below:

{verify_link}

This link will expire in 24 hours. If you didn't create this account, ignore this email.

— {config.FROM_NAME}
"""
    )

    _send(msg)


def send_contact_email(
    name: str,
    email: str,
    phone: str,
    company: str,
    interest: str,
    message: str,
) -> None:
    """
    Feature #3 — Contact Us form submission. Sends the inquiry straight
    to the admin inbox (SMTP_USERNAME). Nothing is saved to the database.
    """
    msg = EmailMessage()
    msg["Subject"] = f"New Contact Inquiry — {interest or 'General'}"
    msg["From"] = f"{config.FROM_NAME} <{config.SMTP_USERNAME}>"
    msg["To"] = config.SMTP_USERNAME
    # So replying to this email goes straight back to the person who
    # submitted the form, instead of back to your own inbox.
    msg["Reply-To"] = email

    msg.set_content(
        f"""New contact form submission:

Name: {name}
Email: {email}
Phone: {phone or "N/A"}
Company: {company or "N/A"}
Reason: {interest or "N/A"}

Message:
{message}
"""
    )

    _send(msg)


def send_password_reset_email(to_email: str, token: str) -> None:
    """
    Feature #4 — send password reset link on forgot-password request.

    Unlike send_verification_email (which links to a BACKEND route that
    does the verification directly), this links to a FRONTEND page
    (forgot-password/reset-password UI) that will collect the new
    password and POST it + token to the backend /auth/reset-password
    route.
    """
    reset_link = f"{config.FRONTEND_URL}/reset-password?token={token}"

    msg = EmailMessage()
    msg["Subject"] = "Reset your password — AI Service Desk"
    msg["From"] = f"{config.FROM_NAME} <{config.SMTP_USERNAME}>"
    msg["To"] = to_email
    msg.set_content(
        f"""Hi,

We received a request to reset your password. Click the link below to set a new password:

{reset_link}

This link will expire in 30 minutes. If you didn't request this, you can safely ignore this email — your password will not be changed.

— {config.FROM_NAME}
"""
    )

    _send(msg)