from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_token
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login"
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):

    payload = verify_token(token)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token."
        )

    user = (
        db.query(User)
        .filter(User.id == payload["user_id"])
        .first()
    )

    # A valid token for a user that no longer exists is an invalid session,
    # not a missing resource: 401 lets the frontend clear it and re-login.
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Account has been deactivated."
        )

    return user


def manager_required(
    current_user: User = Depends(get_current_user)
):

    if current_user.role.value != "manager":
        raise HTTPException(
            status_code=403,
            detail="Manager access required."
        )

    return current_user


def employee_required(
    current_user: User = Depends(get_current_user)
):

    if current_user.role.value != "employee":
        raise HTTPException(
            status_code=403,
            detail="Employee access required."
        )

    return current_user