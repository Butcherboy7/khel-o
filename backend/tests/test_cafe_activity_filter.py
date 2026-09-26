import pytest
from uuid import uuid4

from app.models.hardware_tier import HardwareTier, TierType
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.core.security import get_password_hash


async def _cafe_with_tier(db_session, activity_kind: str | None, tier_type=TierType.ACTIVITY, name="Cafe"):
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com",
        password_hash=get_password_hash("testpass123"), full_name="Owner",
        role=UserRole.CAFE_OWNER, is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=name,
        address_line1="1 Main St", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number=f"+9190{uuid4().hex[:8]}",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
    )
    db_session.add(cafe)
    await db_session.flush()
    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name=f"{name} Tier",
        total_seats=4, app_bookable_seats=4, price_per_hour=100,
        tier_type=tier_type.value, activity_kind=activity_kind,
    )
    db_session.add(tier)
    await db_session.commit()
    return cafe


@pytest.mark.asyncio
async def test_activity_kind_filter_matches_case_insensitively(async_client, db_session):
    snooker_cafe = await _cafe_with_tier(db_session, "Snooker", name="Snooker Lounge")
    bowling_cafe = await _cafe_with_tier(db_session, "Bowling", name="Bowling Alley")

    r = await async_client.get("/api/v1/cafes", params={"activityKind": "snooker"})

    assert r.status_code == 200
    ids = [c["id"] for c in r.json()["data"]["items"]]
    assert str(snooker_cafe.id) in ids
    assert str(bowling_cafe.id) not in ids


@pytest.mark.asyncio
async def test_activity_kind_filter_excludes_gaming_tiers_with_same_name(async_client, db_session):
    gaming_cafe = await _cafe_with_tier(db_session, None, tier_type=TierType.GAMING, name="Gaming Only")

    r = await async_client.get("/api/v1/cafes", params={"activityKind": "snooker"})

    assert r.status_code == 200
    ids = [c["id"] for c in r.json()["data"]["items"]]
    assert str(gaming_cafe.id) not in ids


@pytest.mark.asyncio
async def test_cafe_list_item_exposes_activity_kinds(async_client, db_session):
    cafe = await _cafe_with_tier(db_session, "Bowling", name="Bowling Only")

    r = await async_client.get("/api/v1/cafes", params={"city": "Hyderabad"})

    assert r.status_code == 200
    match = next(c for c in r.json()["data"]["items"] if c["id"] == str(cafe.id))
    assert match["activityKinds"] == ["Bowling"]


@pytest.mark.asyncio
async def test_activities_are_normalized_and_filterable(async_client, db_session):
    pool = await _cafe_with_tier(db_session, "Eight Ball Pool", name="Pool Hall")
    ps = await _cafe_with_tier(db_session, None, tier_type=TierType.GAMING, name="PS5 Den")

    r = await async_client.get("/api/v1/cafes", params={"city": "Hyderabad", "limit": 50})
    items = {c["id"]: c for c in r.json()["data"]["items"]}
    assert items[str(pool.id)]["activities"] == ["pool"]
    assert items[str(ps.id)]["activities"] == ["console"]  # name fallback: "PS5 Den Tier"

    r = await async_client.get("/api/v1/cafes", params={"activity": "pool"})
    ids = [c["id"] for c in r.json()["data"]["items"]]
    assert str(pool.id) in ids and str(ps.id) not in ids


@pytest.mark.asyncio
async def test_activities_endpoint_lists_city_activities_gaming_first(async_client, db_session):
    await _cafe_with_tier(db_session, "VR Gaming", name="VR Arena")
    await _cafe_with_tier(db_session, "Snooker", name="Cue Club")
    await _cafe_with_tier(db_session, "Carrom", name="Carrom Corner")

    r = await async_client.get("/api/v1/cafes/activities", params={"city": "Hyderabad"})
    assert r.status_code == 200
    acts = {a["key"]: a for a in r.json()["data"]}
    assert acts["vr"]["group"] == "gaming" and acts["vr"]["label"] == "VR"
    assert acts["snooker"]["count"] >= 1
    assert acts["carrom"]["label"] == "Carrom" and acts["carrom"]["group"] == "more"
    keys = [a["key"] for a in r.json()["data"]]
    assert keys.index("vr") < keys.index("snooker") < keys.index("carrom")

    r = await async_client.get("/api/v1/cafes/activities", params={"city": "Nowhere"})
    assert r.json()["data"] == []
