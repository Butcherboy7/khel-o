"""An owner marks "PC 7" broken / fixed on an ordinary PC or console setup.

Only the owner's own name for the machine is stored; customers just see one fewer
machine bookable. Booking-time capacity and the availability screen both follow.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.models.user import User
from tests.conftest import auth_headers
from tests.test_booking_time_validation import BASE_DATE, _setup_cafe_and_gamer


async def _owner(db_session, cafe):
    return (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalars().first()


async def _call(method, url, headers, **kw):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.request(method, url, headers=headers, **kw)


async def _seats(cafe, tier):
    r = await _call("GET", f"/api/v1/cafes/{cafe.id}/availability?tier_id={tier.id}&date={BASE_DATE.isoformat()}", {})
    assert r.status_code == 200, r.text
    return r.json()["data"]["appBookableSeats"]


@pytest.mark.asyncio
async def test_marking_a_pc_broken_takes_one_seat_off_and_fixing_puts_it_back(db_session):
    cafe, tier, _gamer = await _setup_cafe_and_gamer(db_session)
    tier.total_seats = 5
    tier.app_bookable_seats = 5
    await db_session.commit()
    owner = await _owner(db_session, cafe)
    h = auth_headers(owner)
    base = f"/api/v1/cafes/{cafe.id}/tiers/{tier.id}"

    before = await _seats(cafe, tier)
    r = await _call("POST", f"{base}/broken", h, json={"label": "PC 7"})
    assert r.status_code == 201, r.text
    unit = r.json()["data"]["unit"]
    assert unit["label"] == "PC 7" and unit["status"] == "maintenance"
    assert await _seats(cafe, tier) == before - 1

    r = await _call("DELETE", f"{base}/broken/{unit['id']}", h)
    assert r.status_code == 200, r.text
    assert await _seats(cafe, tier) == before


@pytest.mark.asyncio
async def test_same_machine_twice_and_blank_names_are_refused(db_session):
    cafe, tier, _gamer = await _setup_cafe_and_gamer(db_session)
    owner = await _owner(db_session, cafe)
    h = auth_headers(owner)
    url = f"/api/v1/cafes/{cafe.id}/tiers/{tier.id}/broken"
    assert (await _call("POST", url, h, json={"label": "PC 3"})).status_code == 201
    again = await _call("POST", url, h, json={"label": "pc 3"})
    assert again.status_code == 422 and again.json()["error"]["code"] == "ALREADY_BROKEN"
    blank = await _call("POST", url, h, json={"label": "   "})
    assert blank.status_code == 422 and blank.json()["error"]["code"] == "INVALID_LABEL"


@pytest.mark.asyncio
async def test_another_owner_cannot_mark_my_machines_broken(db_session):
    cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)
    r = await _call("POST", f"/api/v1/cafes/{cafe.id}/tiers/{tier.id}/broken", auth_headers(gamer), json={"label": "PC 1"})
    assert r.status_code in (401, 403)


async def _staff_for(db_session, cafe):
    import uuid
    from app.models.user import UserRole
    from app.models.user_role import UserRoleMapping
    from app.core.security import get_password_hash
    staff = User(
        id=uuid.uuid4(), email=f"staff_{uuid.uuid4().hex[:8]}@test.com", full_name="Desk Staff",
        password_hash=get_password_hash("UnitTestPw123"), role=UserRole.STAFF, is_active=True,
    )
    db_session.add(staff)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid.uuid4(), user_id=staff.id, role=UserRole.STAFF, cafe_id=cafe.id))
    await db_session.commit()
    return staff


@pytest.mark.asyncio
async def test_staff_of_the_cafe_can_mark_a_machine_broken_and_fixed(db_session):
    cafe, tier, _gamer = await _setup_cafe_and_gamer(db_session)
    tier.total_seats = 5
    tier.app_bookable_seats = 5
    await db_session.commit()
    staff = await _staff_for(db_session, cafe)
    h = auth_headers(staff)
    base = f"/api/v1/cafes/{cafe.id}/tiers/{tier.id}"
    r = await _call("POST", f"{base}/broken", h, json={"label": "PC 7"})
    assert r.status_code == 201, r.text
    listing = await _call("GET", f"{base}/units", h)
    assert listing.status_code == 200 and listing.json()["data"]["units"][0]["label"] == "PC 7"
    r = await _call("DELETE", f"{base}/broken/{r.json()['data']['unit']['id']}", h)
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_staff_of_another_cafe_cannot_mark_my_machines_broken(db_session):
    cafe, tier, _gamer = await _setup_cafe_and_gamer(db_session)
    other_cafe, _t, _g = await _setup_cafe_and_gamer(db_session)
    staff = await _staff_for(db_session, other_cafe)
    r = await _call("POST", f"/api/v1/cafes/{cafe.id}/tiers/{tier.id}/broken", auth_headers(staff), json={"label": "PC 1"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_tier_update_clamps_fps_and_cabin_needs_pc(db_session):
    from app.models.hardware_tier import PlatformType
    cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)
    owner = await _owner(db_session, cafe)
    url = f"/api/v1/cafes/{cafe.id}/tiers/{tier.id}"
    r = await _call("PATCH", url, auth_headers(owner), json={"fpsOverrides": {"valorant": 5000, "fortnite": 140}})
    assert r.status_code == 200, r.text
    await db_session.refresh(tier)
    assert tier.fps_overrides == {"fortnite": 140}
    tier.platform = PlatformType.PLAYSTATION
    await db_session.commit()
    r = await _call("PATCH", url, auth_headers(owner), json={"isRoom": True})
    assert r.status_code == 422, r.text


def test_onboarding_extras_pass_cabin_and_speed_through():
    from app.api.v1.owner import OnboardingHardwareTierItem, _onboarding_extras
    from app.models.hardware_tier import PlatformType
    item = OnboardingHardwareTierItem.model_validate({
        "platform": "pc", "isRoom": True, "coopMaxPlayers": 5, "coopExtraPlayerPrice": 150,
        "refreshRateHz": 144, "fpsOverrides": {"valorant": 260, "x": 9999}})
    out = _onboarding_extras(item, PlatformType.PC)
    assert out["is_room"] and out["coop_enabled"] and out["coop_max_players"] == 5
    assert out["coop_extra_player_price"] == 150 and out["refresh_rate_hz"] == 144
    assert out["fps_overrides"] == {"valorant": 260}
    assert "is_room" not in _onboarding_extras(item, PlatformType.XBOX)
