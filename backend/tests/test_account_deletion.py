"""Self-service account deletion (Google Play account-deletion policy).

Players are anonymised in place and locked out; their bookings stay on the
café's books. Café owners get a support ticket instead. See
app/services/account_deletion_service.py.
"""
from datetime import date, time, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.hardware_tier import HardwareTier
from app.models.push_subscription import PushSubscription
from app.models.support_ticket import SupportTicket
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.services.account_deletion_service import DELETED_NAME
from app.services.auth_service import AuthService
from tests.conftest import create_test_user, auth_headers

URL = "/api/v1/auth/delete-account"


async def _cafe_with_tier(db, owner):
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Deletion Test Cafe", address_line1="1 Test St",
        city="Hyderabad", state="Telangana", pincode="500081", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(0, 0), closing_time=time(23, 59), bookable_stations=1,
    )
    db.add(cafe)
    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={"gpu": "RTX 3060"},
        price_per_hour=100.0, total_seats=1, app_bookable_seats=1, active_seats_count=1, is_active=True,
    )
    db.add(tier)
    return cafe, tier


def _booking(gamer, cafe, tier, session_date, status):
    return Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=session_date,
        start_time=time(10, 0), end_time=time(11, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=0.0, total_amount=100.0,
        convenience_fee=0.0, status=status,
    )


async def test_requires_current_password(db_session, async_client):
    user = await create_test_user(db_session, email="del1@real.com", password="rightpass1")
    await db_session.commit()

    resp = await async_client.post(URL, headers=auth_headers(user), json={})
    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "CURRENT_PASSWORD_REQUIRED"

    resp = await async_client.post(URL, headers=auth_headers(user), json={"currentPassword": "nope"})
    assert resp.status_code == 400, resp.text

    await db_session.refresh(user)
    assert user.is_active and user.email == "del1@real.com"


async def test_player_is_anonymised_and_locked_out(db_session, async_client):
    owner = await create_test_user(db_session, email="del2-owner@real.com", role=UserRole.CAFE_OWNER)
    user = await create_test_user(
        db_session, email="del2@real.com", full_name="Real Name", password="rightpass1"
    )
    user.phone_number = "9876543210"
    user.city = "Hyderabad"
    cafe, tier = await _cafe_with_tier(db_session, owner)
    past = _booking(user, cafe, tier, date.today() - timedelta(days=3), BookingStatus.COMPLETED)
    db_session.add(past)
    db_session.add(PushSubscription(
        id=uuid4(), user_id=user.id, endpoint=f"https://push.example/{uuid4().hex}",
        p256dh_key="k", auth_key="a",
    ))
    db_session.add(CafeWaitlistEntry(
        id=uuid4(), cafe_id=cafe.id, user_id=user.id, session_id="s-del2",
        phone="9876543210", contact_method="whatsapp",
    ))
    await db_session.commit()
    headers = auth_headers(user)
    user_id, past_id = user.id, past.id

    resp = await async_client.post(URL, headers=headers, json={"currentPassword": "rightpass1"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "deleted"

    db_session.expire_all()
    gone = (await db_session.execute(select(User).where(User.id == user_id))).scalar_one()
    assert gone.is_active is False
    assert gone.deleted_at is not None
    assert gone.full_name == DELETED_NAME
    assert gone.email != "del2@real.com" and gone.email.endswith("@deleted.khel-o.com")
    assert gone.password_hash is None and gone.phone_number is None and gone.city is None

    # The café keeps its booking record.
    kept = (await db_session.execute(select(Booking).where(Booking.id == past_id))).scalar_one()
    assert kept.gamer_id == user_id

    assert (await db_session.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )).first() is None
    assert (await db_session.execute(
        select(UserRoleMapping).where(UserRoleMapping.user_id == user_id)
    )).first() is None
    vote = (await db_session.execute(
        select(CafeWaitlistEntry).where(CafeWaitlistEntry.user_id == user_id)
    )).scalar_one()
    assert vote.phone is None and vote.unsubscribed_at is not None

    # The old session no longer works, and the old login is gone.
    assert (await async_client.get("/api/v1/auth/me", headers=headers)).status_code in (401, 403)
    login = await async_client.post(
        "/api/v1/auth/login", json={"email": "del2@real.com", "password": "rightpass1"}
    )
    assert login.status_code >= 400


async def test_unfinished_paid_booking_blocks_deletion(db_session, async_client):
    owner = await create_test_user(db_session, email="del3-owner@real.com", role=UserRole.CAFE_OWNER)
    user = await create_test_user(db_session, email="del3@real.com", password="rightpass1")
    cafe, tier = await _cafe_with_tier(db_session, owner)
    db_session.add(_booking(user, cafe, tier, date.today() + timedelta(days=2), BookingStatus.CONFIRMED))
    await db_session.commit()

    resp = await async_client.post(URL, headers=auth_headers(user), json={"currentPassword": "rightpass1"})
    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "UNFINISHED_BOOKINGS"

    await db_session.refresh(user)
    assert user.is_active


async def test_cafe_owner_gets_one_ticket_not_a_deletion(db_session, async_client):
    owner = await create_test_user(
        db_session, email="del4-owner@real.com", role=UserRole.CAFE_OWNER, password="rightpass1"
    )
    await _cafe_with_tier(db_session, owner)
    await db_session.commit()

    for _ in range(2):
        resp = await async_client.post(
            URL, headers=auth_headers(owner), json={"currentPassword": "rightpass1"}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["status"] == "requested"

    await db_session.refresh(owner)
    assert owner.is_active and owner.email == "del4-owner@real.com"
    tickets = (await db_session.execute(
        select(SupportTicket).where(SupportTicket.user_id == owner.id)
    )).scalars().all()
    assert len(tickets) == 1 and tickets[0].category == "account_deletion"


async def test_google_only_account_needs_matching_google_reauth(db_session, async_client, monkeypatch):
    user = await create_test_user(
        db_session, email="del5@real.com", password=None, google_id="google-sub-del5"
    )
    await db_session.commit()

    resp = await async_client.post(URL, headers=auth_headers(user), json={})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "GOOGLE_REAUTH_REQUIRED"

    async def fake_verify(self, id_token):
        return {"sub": "google-sub-del5", "aud": "test"}

    monkeypatch.setattr(AuthService, "verify_google_id_token", fake_verify)
    resp = await async_client.post(URL, headers=auth_headers(user), json={"googleIdToken": "t"})
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert user.is_active is False and user.google_id is None


async def test_admin_cannot_self_delete(db_session, async_client):
    admin = await create_test_user(
        db_session, email="del6@real.com", role=UserRole.ADMIN, password="rightpass1"
    )
    await db_session.commit()

    resp = await async_client.post(
        URL, headers=auth_headers(admin, is_admin=True), json={"currentPassword": "rightpass1"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ADMIN_ACCOUNT"
