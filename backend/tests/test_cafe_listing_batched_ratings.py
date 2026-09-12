import pytest
from uuid import uuid4

from app.repositories.review_repository import ReviewRepository
from app.repositories.cafe_repository import CafeRepository
from app.services.cafe_service import CafeService
from app.models.review import Review
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_get_average_ratings_for_cafes_batches_across_multiple_cafes(db_session):
    gamer = await _make_gamer(db_session, "rating_gamer")
    booking_a, _ = await _make_booking_with_payment(db_session, gamer)
    booking_b, _ = await _make_booking_with_payment(db_session, gamer)

    db_session.add(Review(
        id=uuid4(), cafe_id=booking_a.cafe_id, gamer_id=gamer.id,
        booking_id=booking_a.id, rating=5, is_visible=True,
    ))
    db_session.add(Review(
        id=uuid4(), cafe_id=booking_b.cafe_id, gamer_id=gamer.id,
        booking_id=booking_b.id, rating=3, is_visible=True,
    ))
    await db_session.commit()

    repo = ReviewRepository(db_session)
    ratings = await repo.get_average_ratings_for_cafes([booking_a.cafe_id, booking_b.cafe_id])

    assert ratings[booking_a.cafe_id] == (5.0, 1)
    assert ratings[booking_b.cafe_id] == (3.0, 1)


@pytest.mark.asyncio
async def test_get_average_ratings_for_cafes_excludes_hidden_reviews(db_session):
    gamer = await _make_gamer(db_session, "hidden_review_gamer")
    booking, _ = await _make_booking_with_payment(db_session, gamer)

    db_session.add(Review(
        id=uuid4(), cafe_id=booking.cafe_id, gamer_id=gamer.id,
        booking_id=booking.id, rating=1, is_visible=False,
    ))
    await db_session.commit()

    repo = ReviewRepository(db_session)
    ratings = await repo.get_average_ratings_for_cafes([booking.cafe_id])

    assert booking.cafe_id not in ratings


@pytest.mark.asyncio
async def test_get_average_ratings_for_cafes_empty_list_returns_empty_dict(db_session):
    repo = ReviewRepository(db_session)
    assert await repo.get_average_ratings_for_cafes([]) == {}


@pytest.mark.asyncio
async def test_list_cafes_uses_one_batched_query_not_per_cafe(db_session, monkeypatch):
    gamer = await _make_gamer(db_session, "batch_list_gamer")
    booking, _ = await _make_booking_with_payment(db_session, gamer)
    db_session.add(Review(
        id=uuid4(), cafe_id=booking.cafe_id, gamer_id=gamer.id,
        booking_id=booking.id, rating=4, is_visible=True,
    ))
    await db_session.commit()

    cafe_repo = CafeRepository(db_session)
    review_repo = ReviewRepository(db_session)

    call_count = {"n": 0}
    original = review_repo.get_average_rating_and_count

    async def counting_wrapper(*args, **kwargs):
        call_count["n"] += 1
        return await original(*args, **kwargs)

    monkeypatch.setattr(review_repo, "get_average_rating_and_count", counting_wrapper)

    service = CafeService(cafe_repo, review_repo=review_repo)
    result = await service.list_cafes(page=1, limit=20)

    assert call_count["n"] == 0, "list_cafes must not call the per-café rating method"
    matching = [i for i in result["items"] if i.id == booking.cafe_id]
    assert len(matching) == 1
    assert matching[0].average_rating == 4.0
    assert matching[0].total_reviews == 1
