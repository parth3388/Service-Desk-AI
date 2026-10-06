"""
Single password policy used by registration AND password reset.

The frontend mirrors these constants in src/lib/validation.mjs. Login is
deliberately NOT subject to this policy so existing users with older,
shorter passwords can still sign in.
"""

PASSWORD_MIN_LENGTH = 8

# bcrypt only uses the first 72 bytes of a password. Longer inputs are
# rejected instead of being silently truncated.
PASSWORD_MAX_BYTES = 72


def validate_password(password: str) -> str:
    """Return the password unchanged if valid, otherwise raise ValueError."""

    if not isinstance(password, str) or not password.strip():
        raise ValueError("Password must not be empty.")

    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(
            f"Password must be at least {PASSWORD_MIN_LENGTH} characters long."
        )

    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError(
            f"Password must be at most {PASSWORD_MAX_BYTES} bytes long."
        )

    return password
