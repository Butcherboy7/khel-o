from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.core.logging import setup_logging, logger
from app.core.exceptions import BaseAppException
from app.api.v1.router import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("starting_khel_o_backend", environment=settings.ENVIRONMENT)
    yield
    logger.info("stopping_khel_o_backend")

app = FastAPI(
    title="KHEL-O Backend API",
    description="Marketplace and Demand-Generation Platform for Gaming Cafés in India",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Router
app.include_router(api_router, prefix="/api/v1")

# Custom Exception Handler
@app.exception_handler(BaseAppException)
async def custom_app_exception_handler(request: Request, exc: BaseAppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }
    )

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "service": "khel-o-backend",
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
