from typing import Any, List, Optional
from fastapi import status

class BaseAppException(Exception):
    """Base exception class for all application errors."""
    def __init__(
        self,
        message: str,
        error_code: str = "INTERNAL_SERVER_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[List[Any]] = None
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or []
        super().__init__(self.message)

class AuthException(BaseAppException):
    def __init__(self, message: str = "Authentication failed", error_code: str = "UNAUTHORIZED"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_401_UNAUTHORIZED)

class ForbiddenException(BaseAppException):
    def __init__(self, message: str = "Access forbidden", error_code: str = "FORBIDDEN"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_403_FORBIDDEN)

class NotFoundException(BaseAppException):
    def __init__(self, message: str = "Resource not found", error_code: str = "NOT_FOUND"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_404_NOT_FOUND)

class ConflictException(BaseAppException):
    def __init__(self, message: str = "Resource conflict", error_code: str = "CONFLICT"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_409_CONFLICT)

class ValidationException(BaseAppException):
    def __init__(self, message: str = "Validation failed", error_code: str = "VALIDATION_ERROR", details: Optional[List[Any]] = None):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, details=details)

class PaymentException(BaseAppException):
    def __init__(self, message: str = "Payment processing error", error_code: str = "PAYMENT_FAILED"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_400_BAD_REQUEST)

class BookingException(BaseAppException):
    def __init__(self, message: str = "Booking operation error", error_code: str = "BOOKING_ERROR"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_400_BAD_REQUEST)

class CafeException(BaseAppException):
    def __init__(self, message: str = "Café operation error", error_code: str = "CAFE_ERROR"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_400_BAD_REQUEST)

class PromotionException(BaseAppException):
    def __init__(self, message: str = "Promotion operation error", error_code: str = "PROMOTION_ERROR"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_400_BAD_REQUEST)
