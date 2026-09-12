"""Claiming a lead listing turns it into a real, bookable cafe.

A lead listing is a real business we listed without asking. Claiming is the
moment the venue takes ownership, so it is also the moment the "Booking soon"
badge comes off and bookings open. Two things must be true before that flip, and
both are enforced here rather than in the UI:

  * the account is no longer on its handover @khel-o.com placeholder, i.e. a
    real person has actually taken the account over
  * the cafe has some bookable capacity, otherwise an honest "Booking soon"
    is replaced by a bookable listing that can never return a slot

See docs/superpowers/plans/2026-09-10-explore-real-cafes.md Task 17
"""
import uuid

from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.user import User, UserRole
from tests.conftest import auth_headers, create_test_user


async def _lead_cafe(db_session, *, email="claimme@khel-o.com", with_tier=True,
                     total_seats=10) -> tuple[User, Cafe]:
    owner = await create_test_user(db_session, email=email, role=UserRole.CAFE_OWNER)
    await db_session.flush()
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Lead Cafe",
        address_line1="1 Test Rd", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number="0000000000", email=email,
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        is_lead_listing=True, bookable_stations=0, app_bookable_seats=0,
        amenities=[], photos=[], supported_games=[], menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.flush()
    if with_tier:
        db_session.add(HardwareTier(
            id=uuid.uuid4(), cafe_id=cafe.id, name="PC", price_per_hour=150,
            total_seats=total_seats, app_bookable_seats=0,
            platform=PlatformType.PC, specs={},
        ))
    await db_session.commit()
    return owner, cafe


async def test_claim_flips_lead_listing_off(db_session, async_client):
    owner, cafe = await _lead_cafe(db_session, email="real@owner.com")

    resp = await async_client.post("/api/v1/owner/cafe/claim", headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text

    await db_session.refresh(cafe)
    assert cafe.is_lead_listing is False


async def test_claim_opens_bookable_capacity(db_session, async_client):
    """Flipping the flag alone is not enough -- seats were zeroed while the cafe
    was a lead listing, so the claim has to actually open capacity or the
    listing is bookable in name only."""
    owner, cafe = await _lead_cafe(db_session, email="real2@owner.com", total_seats=10)

    resp = await async_client.post("/api/v1/owner/cafe/claim", headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text

    await db_session.refresh(cafe)
    assert cafe.bookable_stations > 0
    assert cafe.app_bookable_seats > 0


async def test_claim_is_refused_while_on_placeholder_email(db_session, async_client):
    """The @khel-o.com address is the handover credential, not a real owner."""
    owner, cafe = await _lead_cafe(db_session, email="stillplaceholder@khel-o.com")

    resp = await async_client.post("/api/v1/owner/cafe/claim", headers=auth_headers(owner))
    assert resp.status_code >= 400, resp.text

    await db_session.refresh(cafe)
    assert cafe.is_lead_listing is True, "must stay a lead listing"


async def test_claim_is_refused_without_any_capacity(db_session, async_client):
    """Most seeded cafes have zero tiers because no hardware was ever
    confirmed. Claiming one must not produce a bookable cafe with no slots."""
    owner, cafe = await _lead_cafe(db_session, email="real3@owner.com", with_tier=False)

    resp = await async_client.post("/api/v1/owner/cafe/claim", headers=auth_headers(owner))
    assert resp.status_code >= 400, resp.text

    await db_session.refresh(cafe)
    assert cafe.is_lead_listing is True


async def test_claim_is_refused_when_tier_has_no_seats(db_session, async_client):
    """A tier with a confirmed price but total_seats=0 (capacity never
    published) is not capacity either."""
    owner, cafe = await _lead_cafe(db_session, email="real4@owner.com", total_seats=0)

    resp = await async_client.post("/api/v1/owner/cafe/claim", headers=auth_headers(owner))
    assert resp.status_code >= 400, resp.text

    await db_session.refresh(cafe)
    assert cafe.is_lead_listing is True


async def test_claim_requires_cafe_owner_role(db_session, async_client):
    gamer = await create_test_user(db_session, email="gamer@real.com", role=UserRole.GAMER)
    await db_session.commit()

    resp = await async_client.post("/api/v1/owner/cafe/claim", headers=auth_headers(gamer))
    assert resp.status_code in (401, 403), resp.text


async def test_claim_is_idempotent(db_session, async_client):
    """A double-submit from the claim form must not error or change anything."""
    owner, cafe = await _lead_cafe(db_session, email="real5@owner.com")

    first = await async_client.post("/api/v1/owner/cafe/claim", headers=auth_headers(owner))
    assert first.status_code == 200, first.text
    await db_session.refresh(cafe)
    stations = cafe.bookable_stations

    second = await async_client.post("/api/v1/owner/cafe/claim", headers=auth_headers(owner))
    assert second.status_code == 200, second.text

    await db_session.refresh(cafe)
    assert cafe.is_lead_listing is False
    assert cafe.bookable_stations == stations, "re-claiming must not re-scale seats"


async def test_claim_does_not_touch_another_owners_cafe(db_session, async_client):
    _, victim_cafe = await _lead_cafe(db_session, email="victim@khel-o.com")
    attacker, _ = await _lead_cafe(db_session, email="attacker@real.com")

    resp = await async_client.post("/api/v1/owner/cafe/claim", headers=auth_headers(attacker))
    assert resp.status_code == 200, resp.text

    await db_session.refresh(victim_cafe)
    assert victim_cafe.is_lead_listing is True, "another owner's listing must be untouched"
