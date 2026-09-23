"""Public café search ranking: live (bookable) cafés rank above Booking Soon
ones, and within each group, more-reviewed / higher-rated cafés lead --
that's the point of a ranked explore page, not created_at recency.

CafeRepository.flex_search_verified (aka search_verified) is the query
behind CafeService.list_cafes, the public /cafes search endpoint.
"""
import pytest
from datetime import date, time, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe
from app.models.review import Review
from app.repositories.cafe_repository import CafeRepository
from app.repositories.review_repository import ReviewRepository
from app.services.cafe_service import CafeService
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment


async def _add_booking(db_session, gamer, cafe: Cafe, tier_id):
    tomorrow = date.today() + timedelta(days=3)
    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier_id, session_date=tomorrow,
        start_time=time(20, 0), end_time=time(21, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=0.0, total_amount=100.0,
        convenience_fee=0.0, status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    await db_session.commit()
    return booking


async def _add_review(db_session, gamer, cafe_id, booking, rating: int):
    db_session.add(Review(
        id=uuid4(), cafe_id=cafe_id, gamer_id=gamer.id,
        booking_id=booking.id, rating=rating, is_visible=True,
    ))
    await db_session.commit()


async def _set_city(db_session, cafe_id, city: str):
    """Pin a café to a test-unique city so list_cafes(city=...) can isolate
    just this test's cafés -- the shared session-scoped test DB accumulates
    hundreds of cafés from other tests, which would otherwise drown out a
    zero-review/lead-listing café well past any reasonable page size."""
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == cafe_id))).scalar_one()
    cafe.city = city
    await db_session.commit()


@pytest.mark.asyncio
async def test_live_cafe_ranks_above_booking_soon_cafe(db_session):
    gamer = await _make_gamer(db_session, "rank_live_gamer")
    city = f"RankCity{uuid4().hex[:8]}"

    live_booking, _ = await _make_booking_with_payment(db_session, gamer)
    live_cafe_id = live_booking.cafe_id
    await _set_city(db_session, live_cafe_id, city)

    # Booking Soon café, created after the live one -- would win under a
    # created_at-only sort, but must not outrank a live café.
    soon_booking, _ = await _make_booking_with_payment(db_session, gamer)
    soon_cafe_id = soon_booking.cafe_id
    await _set_city(db_session, soon_cafe_id, city)
    soon_cafe = (await db_session.execute(
        select(Cafe).where(Cafe.id == soon_cafe_id)
    )).scalar_one()
    soon_cafe.is_lead_listing = True
    await db_session.commit()

    cafe_repo = CafeRepository(db_session)
    review_repo = ReviewRepository(db_session)
    service = CafeService(cafe_repo, review_repo=review_repo)
    result = await service.list_cafes(city=city, page=1, limit=50)

    ids = [str(i.id) for i in result["items"]]
    assert ids.index(str(live_cafe_id)) < ids.index(str(soon_cafe_id))


@pytest.mark.asyncio
async def test_more_reviewed_live_cafe_ranks_above_fewer_reviewed(db_session):
    gamer = await _make_gamer(db_session, "rank_reviews_gamer")
    city = f"RankCity{uuid4().hex[:8]}"

    popular_booking, _ = await _make_booking_with_payment(db_session, gamer)
    popular_cafe = (await db_session.execute(
        select(Cafe).where(Cafe.id == popular_booking.cafe_id)
    )).scalar_one()
    popular_cafe.city = city
    await db_session.commit()
    tier_id = popular_booking.hardware_tier_id
    await _add_review(db_session, gamer, popular_cafe.id, popular_booking, 5)
    for rating in (4, 3):
        extra_booking = await _add_booking(db_session, gamer, popular_cafe, tier_id)
        await _add_review(db_session, gamer, popular_cafe.id, extra_booking, rating)

    # Quiet café: created after the popular one (would win under a
    # created_at-only sort) but has only one review.
    quiet_booking, _ = await _make_booking_with_payment(db_session, gamer)
    await _set_city(db_session, quiet_booking.cafe_id, city)
    await _add_review(db_session, gamer, quiet_booking.cafe_id, quiet_booking, 5)

    cafe_repo = CafeRepository(db_session)
    review_repo = ReviewRepository(db_session)
    service = CafeService(cafe_repo, review_repo=review_repo)
    result = await service.list_cafes(city=city, page=1, limit=50)

    ids = [str(i.id) for i in result["items"]]
    assert ids.index(str(popular_cafe.id)) < ids.index(str(quiet_booking.cafe_id))


@pytest.mark.asyncio
async def test_equal_review_count_breaks_tie_by_higher_rating(db_session):
    gamer = await _make_gamer(db_session, "rank_rating_gamer")
    city = f"RankCity{uuid4().hex[:8]}"

    high_rated_booking, _ = await _make_booking_with_payment(db_session, gamer)
    low_rated_booking, _ = await _make_booking_with_payment(db_session, gamer)
    await _set_city(db_session, high_rated_booking.cafe_id, city)
    await _set_city(db_session, low_rated_booking.cafe_id, city)

    await _add_review(db_session, gamer, high_rated_booking.cafe_id, high_rated_booking, 5)
    await _add_review(db_session, gamer, low_rated_booking.cafe_id, low_rated_booking, 2)

    cafe_repo = CafeRepository(db_session)
    review_repo = ReviewRepository(db_session)
    service = CafeService(cafe_repo, review_repo=review_repo)
    result = await service.list_cafes(city=city, page=1, limit=50)

    ids = [str(i.id) for i in result["items"]]
    assert ids.index(str(high_rated_booking.cafe_id)) < ids.index(str(low_rated_booking.cafe_id))
