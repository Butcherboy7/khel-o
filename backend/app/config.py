from pathlib import Path
from typing import Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # e:\KHEL-O\backend

# Locate .env in backend directory first, then root directory
_backend_env = BASE_DIR / ".env"
_root_env = BASE_DIR.parent / ".env"
_env_files = [str(f) for f in [_backend_env, _root_env] if f.exists()]

class Settings(BaseSettings):
    # App Config
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "super-secret-key-change-in-production-at-least-32-chars"
    FRONTEND_URL: str = "http://localhost:3000"
    
    # Database Config
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgrespassword@localhost:5434/khel_o_db"
    
    # Security Expiry
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # Google OAuth 2.0
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    
    # Razorpay Payment Gateway
    RAZORPAY_KEY_ID: str = "rzp_test_placeholder_key_id"
    RAZORPAY_KEY_SECRET: str = "rzp_test_placeholder_key_secret"
    RAZORPAY_WEBHOOK_SECRET: str = "rzp_test_webhook_secret"

    # Server-side mirror of the frontend's NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS
    # flag. Signature verification NEVER depends on ENVIRONMENT (a staging box
    # accidentally pointed at prod must still reject forged signatures) — this
    # is the only switch that unlocks the literal 'mock_signature_valid' test
    # marker, and it must be turned on explicitly, never implied by "not prod".
    ENABLE_SANDBOX_MOCK_PAYMENTS: bool = False
    
    # Resend Email Service
    RESEND_API_KEY: Optional[str] = None

    # KHEL-O V2 Configurations
    RAZORPAY_ROUTE_ENABLED: bool = False
    CONVENIENCE_FEE_AMOUNT: int = 10
    UNVERIFIED_CAFE_BOOKING_CAP_VALUE: int = 5000
    UNVERIFIED_CAFE_BOOKING_CAP_COUNT: int = 15

    # Platform service fee, charged to the gamer on top of the booking subtotal.
    # Replaces the old separate "gateway fee (2%) + flat convenience fee" line
    # items with a single combined percentage: Razorpay's real processing cost
    # (payment gateway fee + Route transfer fee, both +18% GST) plus KHEL-O's
    # margin. Bump PLATFORM_MARGIN_PERCENT via env var to change pricing without
    # a code change — no redeploy of logic needed, just the env var.
    RAZORPAY_COST_PERCENT: float = 2.65
    PLATFORM_MARGIN_PERCENT: float = 1.20
    
    # Sentry Error Monitoring
    SENTRY_DSN: Optional[str] = None

    # AWS S3 — café photo storage
    AWS_REGION: str = "ap-south-1"
    AWS_S3_BUCKET: Optional[str] = None
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    CAFE_PHOTO_MAX_MB: int = 8
    CAFE_PHOTO_MAX_COUNT: int = 10

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def normalize_sqlite_url(cls, v: str) -> str:
        """Resolve relative SQLite paths to absolute paths anchored to BASE_DIR."""
        if v and "sqlite" in v and ":///" in v:
            prefix, db_path = v.split(":///", 1)
            if db_path in (":memory:", ""):
                return v
            path_obj = Path(db_path)
            if not path_obj.is_absolute():
                abs_path = (BASE_DIR / path_obj).resolve()
                return f"{prefix}:///{abs_path.as_posix()}"
        return v

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        """Enforce strict security and database constraints in production."""
        if self.ENVIRONMENT == "production":
            if "sqlite" in self.DATABASE_URL.lower():
                raise ValueError("CRITICAL: SQLite cannot be used as DATABASE_URL in production. A PostgreSQL connection is required.")
            if self.SECRET_KEY == "super-secret-key-change-in-production-at-least-32-chars":
                raise ValueError("CRITICAL: Default insecure SECRET_KEY detected in production. A secure SECRET_KEY must be provided.")
        return self

    model_config = SettingsConfigDict(
        env_file=_env_files if _env_files else None,
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

