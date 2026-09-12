"""Lead-listing behaviour: cafés KHEL-O listed from research that have not
yet agreed to take bookings.

See docs/superpowers/specs/2026-09-10-explore-real-cafes-design.md
"""
import uuid

from app.models.cafe import Cafe, VerificationStatus
from app.models.user import UserRole
from tests.conftest import create_test_user


async def _make_cafe(db_session, name: str, **overrides) -> Cafe:
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.flush()
    fields = dict(
        id=uuid.uuid4(),
        owner_id=owner.id,
        name=name,
        address_line1="1 Test Rd",
        city="Hyderabad",
        state="Telangana",
        pincode="500001",
        phone_number="0000000000",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        amenities=[],
        photos=[],
        supported_games=[],
        menu_photos=[],
        house_rules=[],
        social_links={},
    )
    fields.update(overrides)
    cafe = Cafe(**fields)
    db_session.add(cafe)
    await db_session.commit()
    return cafe


async def test_zero_tier_cafe_is_listed(db_session, async_client):
    """A café with no HardwareTier must still appear in customer search.

    Guards the spec requirement that cafés with unconfirmed hardware are
    listed showing 'Hardware coming soon' rather than being handed a
    fabricated tier to make them visible.
    """
    await _make_cafe(db_session, "Zero Tier Cafe")

    resp = await async_client.get("/api/v1/cafes", params={"limit": 50})
    assert resp.status_code == 200, resp.text

    payload = resp.json()
    items = payload["data"]["items"]
    names = [c["name"] for c in items]
    assert "Zero Tier Cafe" in names, (
        f"zero-tier café missing from search; returned {names}"
    )


async def test_cafe_has_is_lead_listing_defaulting_false(db_session):
    """Existing cafés must not become lead listings by accident."""
    cafe = await _make_cafe(db_session, "Flag Default Cafe")
    await db_session.refresh(cafe)
    assert cafe.is_lead_listing is False


async def test_waitlist_entry_persists(db_session):
    from app.models.cafe_waitlist import CafeWaitlistEntry

    cafe = await _make_cafe(db_session, "Waitlist Cafe", is_lead_listing=True)
    entry = CafeWaitlistEntry(
        id=uuid.uuid4(),
        cafe_id=cafe.id,
        user_id=None,
        session_id="sess-abc",
        contact="9999999999",
    )
    db_session.add(entry)
    await db_session.commit()

    assert entry.created_at is not None
    assert entry.notified_at is None


async def test_booking_rejected_for_lead_listing(db_session, async_client):
    """A player must not be able to pay for a slot at a café that has never
    heard of KHEL-O. The guard sits before tier validation so the message is
    about the listing, not about a missing tier."""
    from tests.conftest import auth_headers

    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    cafe = await _make_cafe(db_session, "Unclaimed Cafe", is_lead_listing=True)

    resp = await async_client.post(
        "/api/v1/bookings",
        headers=auth_headers(gamer),
        json={
            "cafeId": str(cafe.id),
            "hardwareTierId": str(uuid.uuid4()),
            "sessionDate": "2026-12-01",
            "startTime": "10:00:00",
            "durationHours": 1,
            "seatsCount": 1,
        },
    )
    assert resp.status_code >= 400, resp.text
    assert "isn't taking bookings on KHEL-O yet" in resp.text, resp.text


async def test_list_response_includes_lead_fields(db_session, async_client):
    """The card needs both to render: the badge comes from isLeadListing, the
    '37 waiting' line from waitlistCount."""
    cafe = await _make_cafe(db_session, "Lead Fields Cafe", is_lead_listing=True)
    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", json={"sessionId": "lf-1"})

    resp = await async_client.get("/api/v1/cafes", params={"limit": 50})
    items = resp.json()["data"]["items"]
    item = next(c for c in items if c["name"] == "Lead Fields Cafe")

    assert item["isLeadListing"] is True
    assert item["waitlistCount"] == 1


async def test_non_lead_cafe_reports_false(db_session, async_client):
    await _make_cafe(db_session, "Normal Cafe")

    resp = await async_client.get("/api/v1/cafes", params={"limit": 50})
    items = resp.json()["data"]["items"]
    item = next(c for c in items if c["name"] == "Normal Cafe")

    assert item["isLeadListing"] is False
    assert item["waitlistCount"] == 0


async def test_list_does_not_invent_a_rating(db_session, async_client):
    """A café with no reviews must report 0, not a seeded 4.8."""
    await _make_cafe(db_session, "Unrated Cafe")

    resp = await async_client.get("/api/v1/cafes", params={"limit": 50})
    items = resp.json()["data"]["items"]
    item = next(c for c in items if c["name"] == "Unrated Cafe")

    assert item["averageRating"] == 0
    assert item["totalReviews"] == 0


async def test_demand_summary_counts_unique_sessions(db_session, async_client):
    """Two views from one browser count once. The number is quoted to café
    owners as real demand, so refreshes must not inflate it."""
    from app.models.analytics_event import AnalyticsEvent
    from app.models.user import User
    from tests.conftest import auth_headers

    cafe = await _make_cafe(db_session, "Demand Cafe", is_lead_listing=True)
    for session in ["s1", "s1", "s1", "s2"]:
        db_session.add(AnalyticsEvent(
            id=uuid.uuid4(), session_id=session, user_id=None,
            event_type="venue_viewed", cafe_id=cafe.id, event_metadata={},
        ))
    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", json={"sessionId": "w1"})
    await db_session.commit()

    owner = await db_session.get(User, cafe.owner_id)
    resp = await async_client.get("/api/v1/owner/cafe/demand", headers=auth_headers(owner))

    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["uniqueViews30d"] == 2
    assert data["waitlistCount"] == 1


async def test_demand_summary_requires_an_owner(db_session, async_client):
    from tests.conftest import auth_headers

    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()

    resp = await async_client.get("/api/v1/owner/cafe/demand", headers=auth_headers(gamer))
    assert resp.status_code in (401, 403), resp.text
