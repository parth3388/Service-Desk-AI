import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.database import engine

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/")
def health_check():
    return {"message": "AI Service Desk Backend Running"}

@router.get("/db-test")
def db_test():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "success",
            "message": "Database Connected"
        }

    except Exception:
        logger.exception("Database health check failed")

        # 503 so monitors / load balancers see a real failure.
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "message": "Database connection failed"
            }
        )