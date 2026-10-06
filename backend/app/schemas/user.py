from pydantic import BaseModel, EmailStr, Field, field_validator
from enum import Enum
from datetime import datetime

from app.core.password_policy import validate_password


class UserRole(str, Enum):
    MANAGER = "manager"
    EMPLOYEE = "employee"


class UserCreate(BaseModel):

    full_name: str = Field(
        ...,
        min_length=2,
        max_length=100
    )

    email: EmailStr

    password: str

    role: UserRole

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password(value)


class UserLogin(BaseModel):

    email: EmailStr

    password: str = Field(
        ...,
        min_length=6,
        max_length=100
    )


class UserResponse(BaseModel):

    id: int

    full_name: str

    email: EmailStr

    role: UserRole

    is_active: bool

    created_at: datetime

    class Config:
        from_attributes = True
