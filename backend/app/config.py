from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

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
    
    # Resend Email Service
    RESEND_API_KEY: Optional[str] = None

    # KHEL-O V2 Configurations
    RAZORPAY_ROUTE_ENABLED: bool = False
    CONVENIENCE_FEE_AMOUNT: int = 10
    UNVERIFIED_CAFE_BOOKING_CAP_VALUE: int = 5000
    UNVERIFIED_CAFE_BOOKING_CAP_COUNT: int = 15

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
