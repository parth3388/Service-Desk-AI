from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta

from app.core.config import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    EMAIL_VERIFICATION_EXPIRE_MINUTES,
    PASSWORD_RESET_EXPIRE_MINUTES
)


pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


def hash_password(password: str) -> str:
    """
    Hash plain password before storing in database.
    """
    return pwd_context.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    """
    Verify plain password against hashed password.
    """
    return pwd_context.verify(
        plain_password,
        hashed_password
    )


def create_access_token(
    *,
    user_id: int,
    email: str,
    role: str
) -> str:
    """
    Create JWT Access Token.

    Payload contains:
    - user_id
    - email
    - role
    - expiration
    """

    expire = datetime.utcnow() + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": expire
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def verify_token(token: str):
    """
    Decode an ACCESS (session) token.

    Returns payload dictionary if valid AND type is "access" AND it carries
    an integer user_id, otherwise returns None. Email-verification and
    password-reset tokens are signed with the same key, so the type claim
    is what keeps them from working as Bearer tokens.
    """

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        if payload.get("type") != "access":
            return None

        user_id = payload.get("user_id")

        if not isinstance(user_id, int) or isinstance(user_id, bool):
            return None

        return {
            "user_id": user_id,
            "email": payload.get("email"),
            "role": payload.get("role")
        }

    except JWTError:
        return None


def create_email_verification_token(
    *,
    user_id: int,
    email: str
) -> str:
    """
    Create a short-lived JWT specifically for email verification.

    Separate 'type' field so this token can NEVER be used as a login
    access token, even if someone tries to reuse it on a protected route.
    """

    expire = datetime.utcnow() + timedelta(
        minutes=EMAIL_VERIFICATION_EXPIRE_MINUTES
    )

    payload = {
        "user_id": user_id,
        "email": email,
        "type": "email_verification",
        "exp": expire
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def verify_email_verification_token(token: str):
    """
    Decode an email-verification token.

    Returns payload dict if valid AND type matches "email_verification",
    otherwise returns None.
    """

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        if payload.get("type") != "email_verification":
            return None

        return {
            "user_id": payload.get("user_id"),
            "email": payload.get("email")
        }

    except JWTError:
        return None


def create_password_reset_token(
    *,
    user_id: int,
    email: str
) -> str:
    """
    Create a short-lived JWT specifically for password reset.

    Separate 'type' field so this token can NEVER be used as a login
    access token or email verification token.

    Includes 'iat' (issued-at) so we can invalidate this token if the
    user's password changes after this token was issued (see
    verify_password_reset_token + User.password_changed_at).
    """

    now = datetime.utcnow()

    expire = now + timedelta(
        minutes=PASSWORD_RESET_EXPIRE_MINUTES
    )

    payload = {
        "user_id": user_id,
        "email": email,
        "type": "password_reset",
        "iat": now,
        "exp": expire
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def verify_password_reset_token(token: str):
    """
    Decode a password-reset token.

    Returns payload dict if valid AND type matches "password_reset",
    otherwise returns None.

    Note: does NOT check password_changed_at here, since this function
    has no DB access. That check happens in the route handler
    (app/api/auth.py), by comparing payload["iat"] against
    user.password_changed_at.
    """

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        if payload.get("type") != "password_reset":
            return None

        return {
            "user_id": payload.get("user_id"),
            "email": payload.get("email"),
            "iat": payload.get("iat")
        }

    except JWTError:
        return None