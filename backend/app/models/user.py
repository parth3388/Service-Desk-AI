from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    Enum,
    
)

from sqlalchemy.orm import relationship

from datetime import datetime
import enum

from app.core.database import Base


class UserRole(str, enum.Enum):
    MANAGER = "manager"
    EMPLOYEE = "employee"


class User(Base):

    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    full_name = Column(
        String,
        nullable=False
    )

    email = Column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    hashed_password = Column(
        String,
        nullable=False
    )

    role = Column(
        Enum(UserRole),
        nullable=False,
        default=UserRole.EMPLOYEE
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True
    )
    is_verified = Column(
        Boolean,
        nullable=False,
        default=False
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    password_changed_at = Column(
        DateTime,
        nullable=True
    )

    call_records = relationship(
        "CallAnalysis",
        back_populates="employee",
        cascade="all, delete-orphan"
    )