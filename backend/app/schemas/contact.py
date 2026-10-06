import re

from pydantic import BaseModel, EmailStr, Field, field_validator

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

# Keep in sync with CONTACT_LIMITS in frontend/src/lib/validation.mjs.
NAME_MAX = 100
PHONE_MAX = 30
COMPANY_MAX = 150
INTEREST_MAX = 100
MESSAGE_MAX = 5000


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=NAME_MAX)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=PHONE_MAX)
    company: str | None = Field(default=None, max_length=COMPANY_MAX)
    interest: str | None = Field(default=None, max_length=INTEREST_MAX)
    message: str = Field(..., min_length=1, max_length=MESSAGE_MAX)

    @field_validator("name", "phone", "company", "interest", mode="before")
    @classmethod
    def _single_line(cls, value):
        # These end up in email headers/subject: no newlines/control chars.
        if isinstance(value, str):
            return _CONTROL_CHARS.sub(" ", value).strip()
        return value

    @field_validator("name", "message", mode="after")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value
