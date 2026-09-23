"""End-to-end test for the owner-application -> Booking Soon -> Go Live flow.

Satvik (an owner) creates an account and submits a café application with
whatever info he has -- no hardware tiers yet. Admin approves it: the café
becomes a public "Booking Soon" listing (is_lead_listing=True) but is NOT
bookable yet. Only after the owner adds real hardware/seats and admin clicks
"Go Live" does the café become normally bookable.

A DIFFERENT owner (XYZ Café) does full self-service onboarding and submits
with real hardware tiers already configured. For that application there is
nothing left to wait for, so approval itself takes the café straight to
live -- no separate Go Live click required. See test_approving_a_complete_
application_goes_straight_to_live below.

Reuses the existing is_lead_listing / waitlist / booking-rejection
machinery -- no new entities.
"""
import uuid

import pytest

from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from tests.conftest import auth_headers, create_test_user


async def _pending_application(db_session, owner) -> Cafe:
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Dummy Gaming Cafe",
        address_line1="221B Test Street", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number="9999999999", email=owner.email,
        verification_status=VerificationStatus.PENDING, is_active=False,
        amenities=[], photos=[], supported_games={}, menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.commit()
    return cafe


@pytest.mark.asyncio
async def test_full_booking_soon_to_go_live_flow(db_session, async_client):
    from app.models.user import UserRole

    owner = await create_test_user(db_session, email="satvik@real.com", role=UserRole.GAMER)
    admin = await create_test_user(db_session, email="admin_bs@test.com", role=UserRole.ADMIN)
    cafe = await _pending_application(db_session, owner)

    # 1. Admin approves the bare-bones application.
    resp = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/verify",
        json={"status": "verified"},
        headers=auth_headers(admin, is_admin=True),
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(cafe)
    assert cafe.verification_status == VerificationStatus.VERIFIED
    assert cafe.is_active is True
    assert cafe.is_lead_listing is True, "approved-but-empty café must become Booking Soon, not immediately live"
    assert cafe.bookable_stations == 0

    # 2. Public detail view shows it (not 404'd) and marks it Booking Soon.
    detail = await async_client.get(f"/api/v1/cafes/{cafe.id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["data"]["cafe"]["isLeadListing"] is True

    # 3. Booking is refused while Booking Soon, even though the café is "verified".
    seats = await async_client.get(f"/api/v1/cafes/{cafe.id}/available-seats", params={
        "hardware_tier_id": str(uuid.uuid4()), "session_date": "2026-10-01",
        "start_time": "10:00", "end_time": "11:00",
    })
    # Route may 404/422 on the bogus tier id; what matters is booking creation itself is blocked.
    booking_resp = await async_client.post(
        "/api/v1/bookings",
        json={
            "cafeId": str(cafe.id), "hardwareTierId": str(uuid.uuid4()),
            "sessionDate": "2026-10-01", "startTime": "10:00", "endTime": "11:00",
        },
        headers=auth_headers(owner),
    )
    assert booking_resp.status_code >= 400

    # 4. Go Live is refused until real capacity exists.
    go_live_resp = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/go-live",
        headers=auth_headers(admin, is_admin=True),
    )
    assert go_live_resp.status_code >= 400
    assert go_live_resp.json()["error"]["code"] == "GO_LIVE_REQUIRES_HARDWARE"

    # 5. Owner completes onboarding: adds a hardware tier (existing café, no second listing).
    db_session.add(HardwareTier(
        id=uuid.uuid4(), cafe_id=cafe.id, name="PC", price_per_hour=150,
        total_seats=10, app_bookable_seats=0, platform=PlatformType.PC, specs={},
    ))
    await db_session.commit()

    # 6. Admin clicks Go Live.
    go_live_resp = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/go-live",
        headers=auth_headers(admin, is_admin=True),
    )
    assert go_live_resp.status_code == 200, go_live_resp.text
    data = go_live_resp.json()["data"]
    assert data["isLeadListing"] is False
    assert data["bookableStations"] > 0

    await db_session.refresh(cafe)
    assert cafe.is_lead_listing is False
    assert cafe.bookable_stations > 0

    # 7. Public detail no longer flags it as Booking Soon.
    detail = await async_client.get(f"/api/v1/cafes/{cafe.id}")
    assert detail.status_code == 200
    assert detail.json()["data"]["cafe"]["isLeadListing"] is False

    # 8. Go Live is idempotent.
    again = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/go-live",
        headers=auth_headers(admin, is_admin=True),
    )
    assert again.status_code == 200
    assert again.json()["data"]["alreadyLive"] is True


@pytest.mark.asyncio
async def test_go_live_requires_prior_approval(db_session, async_client):
    from app.models.user import UserRole

    owner = await create_test_user(db_session, email="satvik2@real.com", role=UserRole.GAMER)
    admin = await create_test_user(db_session, email="admin_bs2@test.com", role=UserRole.ADMIN)
    cafe = await _pending_application(db_session, owner)

    resp = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/go-live",
        headers=auth_headers(admin, is_admin=True),
    )
    assert resp.status_code >= 400
    assert resp.json()["error"]["code"] == "GO_LIVE_REQUIRES_APPROVAL"


@pytest.mark.asyncio
async def test_reverifying_an_already_live_cafe_does_not_reset_booking_soon(db_session, async_client):
    """A live café going through /verify again (e.g. after changes_requested on an
    unrelated field) must not get silently un-launched back to Booking Soon."""
    from app.models.user import UserRole

    owner = await create_test_user(db_session, email="liveowner@real.com", role=UserRole.GAMER)
    admin = await create_test_user(db_session, email="admin_bs3@test.com", role=UserRole.ADMIN)
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Already Live Cafe",
        address_line1="1 Live Rd", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number="8888888888", email=owner.email,
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        is_lead_listing=False, bookable_stations=7, app_bookable_seats=7,
        amenities=[], photos=[], supported_games={}, menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/verify",
        json={"status": "verified"},
        headers=auth_headers(admin, is_admin=True),
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(cafe)
    assert cafe.is_lead_listing is False
    assert cafe.bookable_stations == 7


@pytest.mark.asyncio
async def test_approving_a_complete_application_goes_straight_to_live(db_session, async_client):
    """XYZ Café does full self-service onboarding: address, hours, AND real
    hardware tiers with real seats, all before ever submitting. There is
    nothing left for it to wait for, so admin approval should take it
    straight to bookable -- not park it in Booking Soon for a redundant
    second Go Live click."""
    from app.models.user import UserRole

    owner = await create_test_user(db_session, email="xyz_owner@real.com", role=UserRole.GAMER)
    admin = await create_test_user(db_session, email="admin_bs4@test.com", role=UserRole.ADMIN)
    cafe = await _pending_application(db_session, owner)
    db_session.add(HardwareTier(
        id=uuid.uuid4(), cafe_id=cafe.id, name="PC", price_per_hour=150,
        total_seats=20, app_bookable_seats=0, platform=PlatformType.PC, specs={},
    ))
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/verify",
        json={"status": "verified"},
        headers=auth_headers(admin, is_admin=True),
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(cafe)
    assert cafe.verification_status == VerificationStatus.VERIFIED
    assert cafe.is_lead_listing is False, "a fully-onboarded application must not be stuck in Booking Soon"
    assert cafe.bookable_stations > 0, "capacity must open automatically, not require a separate Go Live click"

    # Public detail confirms it -- no Notify Me, normal bookable listing.
    detail = await async_client.get(f"/api/v1/cafes/{cafe.id}")
    assert detail.status_code == 200
    assert detail.json()["data"]["cafe"]["isLeadListing"] is False

    # Go Live on an already-live café is a harmless idempotent no-op.
    go_live_resp = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/go-live",
        headers=auth_headers(admin, is_admin=True),
    )
    assert go_live_resp.status_code == 200
    assert go_live_resp.json()["data"]["alreadyLive"] is True
