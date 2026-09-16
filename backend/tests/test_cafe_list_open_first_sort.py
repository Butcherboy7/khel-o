"""
Admin's café list should surface currently-open cafés first (then by
created_at desc within each group), based on the café's actual configured
opening_time/closing_time — interpreted as IST wall-clock, matching the
"KHEL-O is India-only" convention already established in app/core/time.py
and mirrored on the frontend by lib/format.ts's isCafeOpenNow.

CafeRepository.get_all_admin is the method behind the admin-facing café
list (see app/services/admin_service.py's get_all_cafes, which calls
cafe_repo.get_all_admin). The other order_by(Cafe.created_at.desc()) call
site in cafe_repository.py, flex_search_verified/search_verified, serves
the public customer search and must NOT be touched by this change.
"""
import pytest
from datetime import timedelta
from app.repositories.cafe_repository import CafeRepository
from app.core.time import now_ist


@pytest.mark.asyncio
async def test_admin_cafe_list_sorts_open_cafes_first(db_session):
    from app.models.cafe import Cafe, VerificationStatus
    from app.models.user import User
    import uuid

    owner = User(
        email=f"sortowner{uuid.uuid4().hex[:6]}@test.com",
        full_name="Owner",
        password_hash="x",
        is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()

    # Compute hours relative to the current IST wall-clock time so the test
    # is deterministic regardless of when it runs.
    now_t = now_ist().time()
    closed_open = (now_ist() + timedelta(hours=1)).time()
    closed_close = (now_ist() + timedelta(hours=2)).time()
    open_open = (now_ist() - timedelta(hours=1)).time()
    open_close = (now_ist() + timedelta(hours=1)).time()

    # Open café created earlier.
    open_cafe = Cafe(
        owner_id=owner.id, name="Open Cafe", address_line1="2 St", city="C", state="S",
        pincode="123456", phone_number="9999999999", verification_status=VerificationStatus.VERIFIED,
        opening_time=open_open, closing_time=open_close,  # open right now
    )
    db_session.add(open_cafe)
    await db_session.flush()

    # Closed café created most recently — would sort first under
    # created_at-only ordering.
    closed_cafe = Cafe(
        owner_id=owner.id, name="Closed Cafe", address_line1="1 St", city="C", state="S",
        pincode="123456", phone_number="9999999999", verification_status=VerificationStatus.VERIFIED,
        opening_time=closed_open, closing_time=closed_close,  # not open right now
    )
    db_session.add(closed_cafe)
    await db_session.commit()

    repo = CafeRepository(db_session)
    items, total = await repo.get_all_admin(limit=50)
    names = [c.name for c, _email in items]
    assert names.index("Open Cafe") < names.index("Closed Cafe")
