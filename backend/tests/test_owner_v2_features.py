"""
Tests for owner-portal fixes: real review replies and the full (all-status)
owner promotions list, replacing what used to be frontend-only mock data.
"""
import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from httpx import AsyncClient

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.hardware_tier import HardwareTier
from app.models.review import Review
from app.core.security import get_password_hash
from tests.conftest import auth_headers
from app.main import app

IST = timezone(timedelta(hours=5, minutes=30))


async def _make_cafe_with_review(db_session):
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    other_owner = User(
        id=uuid4(), email=f"other_owner_{uuid4().hex[:8]}@test.com", full_name="Other Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([owner, other_owner, gamer])
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=other_owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Review Test Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=None, closing_time=None, bookable_stations=10,
    )
    db_session.add(cafe)

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={"gpu": "RTX 3060"},
        price_per_hour=100.0, total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=(datetime.now(IST) + timedelta(days=1)).date(),
        start_time=(datetime.now(IST) + timedelta(hours=2)).time(), end_time=(datetime.now(IST) + timedelta(hours=3)).time(),
        duration_hours=1.0, base_amount=100.0, discount_amount=0.0, gateway_fee=0.0, total_amount=100.0,
        convenience_fee=0.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)

    review = Review(
        id=uuid4(), cafe_id=cafe.id, gamer_id=gamer.id, booking_id=booking.id,
        rating=4, comment="Great vibe, could use more RAM.", is_visible=True,
    )
    db_session.add(review)
    await db_session.commit()
    return owner, other_owner, cafe, review


@pytest.mark.asyncio
async def test_owner_can_reply_to_review_on_own_cafe(db_session):
    owner, other_owner, cafe, review = await _make_cafe_with_review(db_session)

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/reviews/{review.id}/reply",
            json={"reply": "Thanks for the feedback — upgrading RAM next month!"},
            headers=auth_headers(owner),
        )
        assert res.status_code == 200, res.text
        data = res.json()["data"]["review"]
        assert data["ownerReply"] == "Thanks for the feedback — upgrading RAM next month!"
        assert data["ownerRepliedAt"] is not None

        # Reply persists on refetch
        list_res = await client.get(f"/api/v1/reviews/cafe/{cafe.id}")
        assert list_res.status_code == 200
        items = list_res.json()["data"]["items"]
        assert any(r["id"] == str(review.id) and r["ownerReply"] for r in items)


@pytest.mark.asyncio
async def test_owner_cannot_reply_to_review_on_someone_elses_cafe(db_session):
    owner, other_owner, cafe, review = await _make_cafe_with_review(db_session)

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/reviews/{review.id}/reply",
            json={"reply": "Trying to reply to someone else's review"},
            headers=auth_headers(other_owner),
        )
        assert res.status_code != 200


@pytest.mark.asyncio
async def test_owner_promotions_list_includes_all_statuses(db_session):
    """The old mock offers page never called this; now it should surface active AND inactive promos."""
    from app.models.promotion import Promotion

    owner, other_owner, cafe, _review = await _make_cafe_with_review(db_session)

    now = datetime.now(timezone.utc)
    active_promo = Promotion(
        id=uuid4(), cafe_id=cafe.id, title="Weekend Warrior", discount_percentage=20,
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
        days_of_week=[5, 6], start_hour=10, end_hour=22, is_active=True,
    )
    inactive_promo = Promotion(
        id=uuid4(), cafe_id=cafe.id, title="Expired Deal", discount_percentage=10,
        valid_from=now - timedelta(days=60), valid_until=now - timedelta(days=30),
        days_of_week=[0, 1, 2, 3, 4], start_hour=9, end_hour=21, is_active=False,
    )
    db_session.add_all([active_promo, inactive_promo])
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get(f"/api/v1/promotions/owner/cafe/{cafe.id}", headers=auth_headers(owner))
        assert res.status_code == 200, res.text
        titles = {p["title"] for p in res.json()["data"]["promotions"]}
        assert titles == {"Weekend Warrior", "Expired Deal"}

        # Another owner can't see this café's promotions
        forbidden_res = await client.get(f"/api/v1/promotions/owner/cafe/{cafe.id}", headers=auth_headers(other_owner))
        assert forbidden_res.status_code != 200


@pytest.mark.asyncio
async def test_update_cafe_details_persists_amenities_photos_and_location(db_session):
    owner, _other_owner, cafe, _review = await _make_cafe_with_review(db_session)

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/owner/cafes/{cafe.id}/details",
            json={
                "amenities": ["Air conditioned", "Free Wi-Fi"],
                "photos": ["https://example.com/photo1.jpg"],
                "latitude": 12.9716,
                "longitude": 77.5946,
            },
            headers=auth_headers(owner),
        )
        assert res.status_code == 200, res.text
        data = res.json()["data"]["cafe"]
        assert data["amenities"] == ["Air conditioned", "Free Wi-Fi"]
        assert data["photos"] == ["https://example.com/photo1.jpg"]
        assert data["latitude"] == 12.9716
        assert data["longitude"] == 77.5946

        settings_res = await client.get("/api/v1/owner/settings", headers=auth_headers(owner))
        settings_cafe = settings_res.json()["data"]["cafe"]
        assert settings_cafe["amenities"] == ["Air conditioned", "Free Wi-Fi"]
        assert settings_cafe["latitude"] == 12.9716
