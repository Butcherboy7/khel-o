from fastapi import APIRouter, Depends, status
from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.booking import BookingCreate, BookingResponse
from app.repositories.booking_repository import BookingRepository
from app.services.booking_service import BookingService
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = BookingRepository(db)
    service = BookingService(repo)
    return await service.create_booking(current_user.id, payload)

@router.get("", response_model=List[BookingResponse])
async def list_my_bookings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = BookingRepository(db)
    service = BookingService(repo)
    return await service.list_gamer_bookings(current_user.id)

@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking(booking_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = BookingRepository(db)
    service = BookingService(repo)
    return await service.get_booking(booking_id)
