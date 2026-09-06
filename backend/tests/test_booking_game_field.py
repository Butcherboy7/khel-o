import pytest
from datetime import date, time, timedelta
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash
from app.repositories.cafe_repository import CafeRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.booking_service import BookingService
from app.schemas.booking import BookingCreateRequest


@pytest.mark.asyncio
async def test_create_booking_persists_game(db_session):
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Game Test Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
        supported_games=["FIFA 24", "Call of Duty"],
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.commit()

    service = BookingService(
        booking_repo=BookingRepository(db_session),
        cafe_repo=CafeRepository(db_session),
        tier_repo=HardwareTierRepository(db_session),
    )
    tomorrow = date.today() + timedelta(days=2)
    request = BookingCreateRequest(
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=tomorrow,
        start_time=time(18, 0), duration_hours=1.0, seats_count=1, game="FIFA 24",
    )
    result = await service.create_booking(gamer.id, request)
    assert result.game == "FIFA 24"
