from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import DATABASE_URL



engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,
    echo=False
)


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)



Base = declarative_base()



def get_db():
    """
    Creates a new database session for every request
    and automatically closes it afterwards.
    """

    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()