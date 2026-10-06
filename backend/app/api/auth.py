import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.password_policy import validate_password
from app.core.rate_limit import rate_limit
from app.models.user import User
from app.schemas.user import UserCreate
from fastapi.responses import HTMLResponse

from app.services.email_service import (
    send_verification_email,
    send_password_reset_email
)
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_email_verification_token,
    verify_email_verification_token,
    create_password_reset_token,
    verify_password_reset_token
)
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password(value)


@router.post(
    "/register",
    dependencies=[Depends(rate_limit("register"))]
)
def register_user(
    user: UserCreate,
    db: Session = Depends(get_db)
):

    email = user.email.lower()

    existing_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered."
        )

    new_user = User(
        full_name=user.full_name,
        email=email,
        hashed_password=hash_password(user.password),
        role=user.role
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    verification_token = create_email_verification_token(
        user_id=new_user.id,
        email=new_user.email
    )

    email_sent = True

    try:
        send_verification_email(
            to_email=new_user.email,
            token=verification_token
        )
    except Exception:
        logger.exception(
            "Verification email failed for user %s", new_user.id
        )
        email_sent = False

    if email_sent:
        message = (
            "Account created successfully. "
            "Please check your email to verify your account."
        )
    else:
        message = (
            "Account created, but the verification email could not be sent. "
            "Use \"Resend verification email\" on the login page to get a new link."
        )

    return {
        "status": "success",
        "message": message,
        "verification_email_sent": email_sent,
        "user": {
            "id": new_user.id,
            "full_name": new_user.full_name,
            "email": new_user.email,
            "role": new_user.role.value,
            "is_active": new_user.is_active,
            "is_verified": new_user.is_verified,
            "created_at": new_user.created_at
        }
    }


@router.get("/verify-email", response_class=HTMLResponse)
def verify_email(
    token: str,
    db: Session = Depends(get_db)
):

    payload = verify_email_verification_token(token)

    if payload is None:
        return """
        <html>
            <body style="font-family: sans-serif; text-align: center; margin-top: 60px;">
                <h2 style="color: #DC2626;">Verification link is invalid or expired.</h2>
                <p>Go to the login page and choose "Resend verification email" to get a new link.</p>
            </body>
        </html>
        """

    db_user = (
        db.query(User)
        .filter(User.id == payload["user_id"])
        .first()
    )

    if db_user is None:
        return """
        <html>
            <body style="font-family: sans-serif; text-align: center; margin-top: 60px;">
                <h2 style="color: #DC2626;">User not found.</h2>
            </body>
        </html>
        """

    if db_user.is_verified:
        return """
        <html>
            <body style="font-family: sans-serif; text-align: center; margin-top: 60px;">
                <h2 style="color: #16A34A;">Email already verified.</h2>
                <p>You can log in now.</p>
            </body>
        </html>
        """

    db_user.is_verified = True
    db.commit()

    return """
    <html>
        <body style="font-family: sans-serif; text-align: center; margin-top: 60px;">
            <h2 style="color: #16A34A;">✅ Email verified successfully!</h2>
            <p>You can now log in to your account.</p>
        </body>
    </html>
    """


@router.post(
    "/login",
    dependencies=[Depends(rate_limit("login"))]
)
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):

    email = form_data.username.lower()

    db_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    if not verify_password(
        form_data.password,
        db_user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    if not db_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Account has been deactivated."
        )

    if not db_user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before logging in."
        )

    access_token = create_access_token(
        user_id=db_user.id,
        email=db_user.email,
        role=db_user.role.value
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": db_user.id,
            "full_name": db_user.full_name,
            "email": db_user.email,
            "role": db_user.role.value,
            "is_active": db_user.is_active,
            "is_verified": db_user.is_verified
        }
    }


@router.get("/profile")
def get_profile(
    db_user: User = Depends(get_current_user)
):
    # get_current_user validates the ACCESS token and rejects unknown or
    # deactivated users, same as every other protected route.

    return {
        "status": "success",
        "user": {
            "id": db_user.id,
            "full_name": db_user.full_name,
            "email": db_user.email,
            "role": db_user.role.value,
            "is_active": db_user.is_active,
            "created_at": db_user.created_at,
            "updated_at": db_user.updated_at
        }
    }


@router.post(
    "/forgot-password",
    dependencies=[Depends(rate_limit("forgot_password"))]
)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Sends a password reset link if the email exists.

    IMPORTANT: response message is always the same, regardless of
    whether the email exists or not — this prevents attackers from
    using this endpoint to discover which emails are registered.
    """

    email = payload.email.lower()

    db_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if db_user:
        reset_token = create_password_reset_token(
            user_id=db_user.id,
            email=db_user.email
        )

        try:
            send_password_reset_email(
                to_email=db_user.email,
                token=reset_token
            )
        except Exception:
            # Logged, but the response stays identical so this endpoint
            # cannot be used to probe which emails are registered.
            logger.exception(
                "Password reset email failed for user %s", db_user.id
            )

    return {
        "status": "success",
        "message": "If an account with that email exists, a password reset link has been sent."
    }


@router.post(
    "/resend-verification",
    dependencies=[Depends(rate_limit("resend_verification"))]
)
def resend_verification(
    payload: ResendVerificationRequest,
    db: Session = Depends(get_db)
):
    """
    Sends a fresh verification link to an unverified account.

    The response is identical whether or not the email exists / is already
    verified, so this cannot be used to enumerate accounts.
    """

    email = payload.email.lower()

    db_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if db_user and db_user.is_active and not db_user.is_verified:

        token = create_email_verification_token(
            user_id=db_user.id,
            email=db_user.email
        )

        try:
            send_verification_email(
                to_email=db_user.email,
                token=token
            )
        except Exception:
            logger.exception(
                "Resend verification email failed for user %s", db_user.id
            )

    return {
        "status": "success",
        "message": "If an unverified account with that email exists, a new verification email has been sent."
    }


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db)
):

    token_data = verify_password_reset_token(payload.token)

    if token_data is None:
        raise HTTPException(
            status_code=400,
            detail="Reset link is invalid or expired."
        )

    db_user = (
        db.query(User)
        .filter(User.id == token_data["user_id"])
        .first()
    )

    if db_user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    # Single-use enforcement: if the password has already been changed
    # AFTER this token was issued, reject it (token was already used,
    # or a newer reset happened since).
    if db_user.password_changed_at is not None:
        token_issued_at = datetime.fromtimestamp(
            token_data["iat"],
            tz=timezone.utc
        ).replace(tzinfo=None)

        if token_issued_at < db_user.password_changed_at:
            raise HTTPException(
                status_code=400,
                detail="Reset link is invalid or expired."
            )

    db_user.hashed_password = hash_password(payload.new_password)
    db_user.password_changed_at = datetime.utcnow()

    db.commit()

    return {
        "status": "success",
        "message": "Password has been reset successfully. You can now log in with your new password."
    }