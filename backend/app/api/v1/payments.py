from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.payment import PaymentCreate, PaymentResponse, RazorpayVerifyRequest
from app.repositories.payment_repository import PaymentRepository
from app.repositories.booking_repository import BookingRepository
from app.services.payment_service import PaymentService

router = APIRouter()

@router.post("/orders", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment_order(payload: PaymentCreate, db: AsyncSession = Depends(get_db)):
    payment_repo = PaymentRepository(db)
    booking_repo = BookingRepository(db)
    service = PaymentService(payment_repo, booking_repo)
    return await service.create_payment_order(payload.booking_id)

@router.post("/verify", response_model=PaymentResponse)
async def verify_payment(payload: RazorpayVerifyRequest, db: AsyncSession = Depends(get_db)):
    payment_repo = PaymentRepository(db)
    booking_repo = BookingRepository(db)
    service = PaymentService(payment_repo, booking_repo)
    return await service.verify_payment(payload)
