"""Offers count as redeemed only once paid; reviews can be edited (marked
edited), owner replies are public, and walk-in reviews follow the setting."""
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import update

from app.core.exceptions import ValidationException
from app.models.booking import Booking, BookingStatus
from app.models.platform_setting import PlatformSetting
from app.models.promotion import Promotion, PromotionType
from app.models.user import UserRole
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.promotion_repository import PromotionRepository
from app.services.promotion_service import PromotionService
from tests.conftest import auth_headers, create_test_user
from tests.test_growth_reports import _cafe


async def _offer(db, cafe, max_uses=None):
    now = datetime.now(timezone.utc)
    promo = Promotion(
        id=uuid.uuid4(), cafe_id=cafe.id, title="20% off", promotion_type=PromotionType.PERCENTAGE,
        discount_percentage=20, valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
        days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24, is_active=True,
        max_uses=max_uses, current_uses=0,
    )
    db.add(promo)
    await db.commit()
    return promo


def _pending(gamer, cafe, tier, promo, created_at=None):
    return Booking(
        id=uuid.uuid4(), booking_reference=f"OR-{uuid.uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=20.0, gateway_fee=0.0, convenience_fee=0.0,
        total_amount=80.0, status=BookingStatus.PENDING_PAYMENT, promotion_id=promo.id,
        **({"created_at": created_at} if created_at else {}),
    )


async def _uses(db, promo_id):
    db.expire_all()
    return (await db.get(Promotion, promo_id)).current_uses


async def test_offer_counts_only_after_payment_and_is_released_on_cancel(db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    gamer = await create_test_user(db_session)
    cafe, tier = await _cafe(db_session, owner, "Offer Cafe")
    promo = await _offer(db_session, cafe)
    booking = _pending(gamer, cafe, tier, promo)
    db_session.add(booking)
    await db_session.commit()
    promo_id, booking_id = promo.id, booking.id
    repo = BookingRepository(db_session)

    assert await _uses(db_session, promo_id) == 0  # pending payment: not redeemed
    await repo.update(booking_id, {"status": BookingStatus.CONFIRMED})
    assert await _uses(db_session, promo_id) == 1  # paid
    await repo.update(booking_id, {"status": BookingStatus.CONFIRMED})
    assert await _uses(db_session, promo_id) == 1  # webhook + verify both firing: still 1
    await repo.update(booking_id, {"status": BookingStatus.CANCELLED})
    assert await _uses(db_session, promo_id) == 0  # cancelled/refunded: slot freed


async def test_failed_payment_never_counts(db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    gamer = await create_test_user(db_session)
    cafe, tier = await _cafe(db_session, owner, "Failed Pay Cafe")
    promo = await _offer(db_session, cafe)
    booking = _pending(gamer, cafe, tier, promo)
    db_session.add(booking)
    await db_session.commit()
    promo_id = promo.id
    await BookingRepository(db_session).update(booking.id, {"status": BookingStatus.FAILED})
    assert await _uses(db_session, promo_id) == 0


async def test_last_slot_is_held_during_checkout_then_freed(db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    gamer = await create_test_user(db_session)
    cafe, tier = await _cafe(db_session, owner, "Last Slot Cafe")
    promo = await _offer(db_session, cafe, max_uses=1)
    booking = _pending(gamer, cafe, tier, promo)
    db_session.add(booking)
    await db_session.commit()
    booking_id = booking.id
    service = PromotionService(PromotionRepository(db_session), CafeRepository(db_session), HardwareTierRepository(db_session))
    now = datetime.now(timezone.utc)
    args = dict(promotion_id=promo.id, cafe_id=cafe.id, tier_id=tier.id, base_amount=Decimal("100"), session_datetime=now)

    with pytest.raises(ValidationException):
        await service.apply_promotion_to_booking(**args)  # someone is paying for the last slot
    await db_session.rollback()

    # Their checkout lapses (15-minute payment window): the slot is free again.
    await db_session.execute(
        update(Booking).where(Booking.id == booking_id).values(created_at=now - timedelta(minutes=20))
    )
    await db_session.commit()
    assert await service.apply_promotion_to_booking(**args) == Decimal("20.00")
    await db_session.rollback()


async def _setting(db, require_booking: bool):
    await db.execute(update(PlatformSetting).values(reviews_require_booking=require_booking))
    await db.commit()


async def test_walk_in_review_edit_and_owner_reply(db_session, async_client):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    gamer = await create_test_user(db_session, full_name="Riya Sharma")
    other = await create_test_user(db_session)
    await db_session.commit()
    cafe, _ = await _cafe(db_session, owner, "Review Cafe")
    await async_client.get("/api/v1/reviews/settings")  # makes sure the settings row exists

    try:
        await _setting(db_session, True)
        r = await async_client.post("/api/v1/reviews", json={"cafeId": str(cafe.id), "rating": 4, "comment": "Nice"}, headers=auth_headers(gamer))
        assert r.status_code == 422 and r.json()["error"]["code"] == "REVIEW_REQUIRES_BOOKING"

        await _setting(db_session, False)
        r = await async_client.post("/api/v1/reviews", json={"cafeId": str(cafe.id), "rating": 4, "comment": "Nice"}, headers=auth_headers(gamer))
        assert r.status_code == 201, r.text
        review_id = r.json()["data"]["review"]["id"]
        assert r.json()["data"]["review"]["editedAt"] is None

        dup = await async_client.post("/api/v1/reviews", json={"cafeId": str(cafe.id), "rating": 2}, headers=auth_headers(gamer))
        assert dup.status_code == 409

        # Only the author can edit; an unchanged save doesn't mark it edited.
        assert (await async_client.patch(f"/api/v1/reviews/{review_id}", json={"rating": 1}, headers=auth_headers(other))).status_code == 403
        same = await async_client.patch(f"/api/v1/reviews/{review_id}", json={"rating": 4, "comment": "Nice"}, headers=auth_headers(gamer))
        assert same.json()["data"]["review"]["editedAt"] is None
        edited = await async_client.patch(f"/api/v1/reviews/{review_id}", json={"rating": 5, "comment": "Great PCs"}, headers=auth_headers(gamer))
        assert edited.status_code == 200
        assert edited.json()["data"]["review"]["editedAt"] is not None

        # The owner's reply shows on the public list, and replying doesn't
        # mark the customer's review as edited by them.
        rep = await async_client.patch(f"/api/v1/reviews/{review_id}/reply", json={"reply": "Thanks Riya!"}, headers=auth_headers(owner))
        assert rep.status_code == 200, rep.text
        items = (await async_client.get(f"/api/v1/reviews/cafe/{cafe.id}")).json()["data"]["items"]
        mine = next(i for i in items if i["id"] == review_id)
        assert mine["ownerReply"] == "Thanks Riya!" and mine["rating"] == 5 and mine["comment"] == "Great PCs"
        assert mine["editedAt"] == edited.json()["data"]["review"]["editedAt"]
    finally:
        await _setting(db_session, False)


async def test_review_qr_code_is_a_png(db_session, async_client):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    cafe, _ = await _cafe(db_session, owner, "QR Cafe")
    r = await async_client.get(f"/api/v1/reviews/cafe/{cafe.id}/qr.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert (await async_client.get(f"/api/v1/reviews/cafe/{uuid.uuid4()}/qr.png")).status_code == 404
