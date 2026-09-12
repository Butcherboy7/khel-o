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
