from fastapi import APIRouter, Depends, status, Request, Header
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.payment import PaymentCreateRequest, PaymentVerifyRequest
from app.repositories.payment_repository import PaymentRepository
from app.repositories.booking_repository import BookingRepository
from app.services.payment_service import PaymentService
from app.api.deps import require_gamer
from app.models.user import User

router = APIRouter()

@router.post("/create-order", status_code=status.HTTP_200_OK)
async def create_payment_order(
    payload: PaymentCreateRequest,
    current_gamer: User = Depends(require_gamer),
    db: AsyncSession = Depends(get_db)
):
    payment_repo = PaymentRepository(db)
    booking_repo = BookingRepository(db)
    service = PaymentService(payment_repo, booking_repo)
    result = await service.create_razorpay_order(payload.booking_id, gamer_id=current_gamer.id)
    return {
        "success": True,
        "data": result
    }

@router.post("/verify", status_code=status.HTTP_200_OK)
async def verify_payment(
    payload: PaymentVerifyRequest,
    current_gamer: User = Depends(require_gamer),
    db: AsyncSession = Depends(get_db)
):
    payment_repo = PaymentRepository(db)
    booking_repo = BookingRepository(db)
    service = PaymentService(payment_repo, booking_repo)
    result = await service.verify_payment(payload, gamer_id=current_gamer.id)
    return {
        "success": True,
        "data": {
            "payment": result
        }
    }

@router.post("/webhook", status_code=status.HTTP_200_OK)
async def payment_webhook(
    request: Request,
    x_razorpay_signature: Optional[str] = Header(None, alias="X-Razorpay-Signature"),
    db: AsyncSession = Depends(get_db)
):
    body_bytes = await request.body()
    signature = x_razorpay_signature or ""
    payment_repo = PaymentRepository(db)
    booking_repo = BookingRepository(db)
    service = PaymentService(payment_repo, booking_repo)
    result = await service.handle_webhook(raw_body_bytes=body_bytes, signature=signature)
    return result
