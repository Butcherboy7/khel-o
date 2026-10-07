import pytest

from app.core import taxonomy
from app.core.activities import tier_activity, activity_key


class _T:  # minimal tier stand-in
    def __init__(self, **kw):
        self.tier_type = kw.get("tier_type", "activity")
        self.activity_kind = kw.get("activity_kind")
        self.platform = kw.get("platform")
        self.name = kw.get("name")
        self.taxonomy_key = kw.get("taxonomy_key")


def test_data_is_consistent():
    seen = set()
    for a in taxonomy.load()["activities"]:
        assert a["key"] not in seen
        seen.add(a["key"])
        for s in a["styles"]:
            assert s["key"].startswith(a["key"] + ".")
            assert s["key"] not in seen
            seen.add(s["key"])
    assert taxonomy.activity_key_for("pool.american") == "pool"
    assert taxonomy.activity_key_for("snooker") == "snooker"
    assert taxonomy.activity_key_for("nope") is None


@pytest.mark.parametrize("name,kind,expected", [
    ("Snooker / Pool", "Snooker / Pool", None),          # ambiguous: never guessed
    ("snooker", None, "snooker"),
    ("Sim Racing Motion Rig", None, "racing-simulator.motion"),
    ("VR (Meta Quest 3)", None, "vr"),
    ("Bowling", "Bowling", "bowling"),
    ("PAYMENT TESTING", None, None),
    ("Air Hockey", "Air Hockey", "air-hockey"),
    ("English billiards table", None, "billiards"),
])
def test_classify_name(name, kind, expected):
    assert taxonomy.classify_name(name, kind) == expected


@pytest.mark.parametrize("name,platform,expected", [
    ("RTX 4070 Night Owl Zone", None, "pc-gaming"),
    ("Whatever", "pc", "pc-gaming"),
    ("PS5 VIP Pods", "playstation", "console.playstation"),
    ("Mystery Lounge", None, None),
    ("Snooker / Pool", "other", None),
])
def test_classify_gaming_tier(name, platform, expected):
    assert taxonomy.classify_gaming_tier(name, platform) == expected


def test_validate_attributes():
    assert taxonomy.validate_attributes("pool.american", {"table_size": "8ft"}) == {"table_size": "8ft"}
    assert taxonomy.validate_attributes("pool", {"table_size": ""}) == {}          # Don't know
    assert taxonomy.validate_attributes("pool", {"games_offered": ["8-ball"]}) == {"games_offered": ["8-ball"]}
    assert taxonomy.validate_attributes("pc-gaming", {"monitor_hz": "240", "ram_gb": 32}) == {"monitor_hz": "240", "ram_gb": 32}
    for key, attrs in [("pool", {"table_size": "20ft"}), ("pool", {"nope": 1}),
                       ("snooker", {"table_size": "8ft"}), (None, {"table_size": "8ft"}),
                       ("pc-gaming", {"ram_gb": "lots"})]:
        with pytest.raises(ValueError):
            taxonomy.validate_attributes(key, attrs)
    with pytest.raises(ValueError):
        taxonomy.validate_key("pool.french")
    assert taxonomy.validate_key("") is None


def test_activity_key_unchanged_when_unclassified_and_overridden_when_set():
    # unclassified legacy tier: behaves exactly as before
    assert tier_activity(_T(activity_kind="Snooker / Pool")) == (activity_key("Snooker / Pool"), "Snooker / Pool")
    # explicit classification wins, with the same stable keys
    assert tier_activity(_T(activity_kind="Snooker / Pool", taxonomy_key="pool.english")) == ("pool", "Pool")
    assert tier_activity(_T(tier_type="gaming", platform="playstation", taxonomy_key="console.playstation")) == ("console", "Console")


# ── API-level ────────────────────────────────────────────────────────────────
from uuid import uuid4
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.core.security import get_password_hash, create_access_token


async def _owner_cafe():
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid4(), email=f"tx_{uuid4().hex[:8]}@test.com",
                     password_hash=get_password_hash("testpass123"), full_name="Tx Owner",
                     role=UserRole.CAFE_OWNER, is_active=True)
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name=f"Tx Cafe {uuid4().hex[:5]}",
                    address_line1="1 Cue St", city="Hyderabad", state="Telangana", pincode="500001",
                    phone_number="+919000000071", verification_status=VerificationStatus.VERIFIED,
                    is_active=True)
        db.add(cafe)
        await db.commit()
        tok = create_access_token(subject=str(owner.id), role=owner.role.value)
        return cafe.id, {"Authorization": f"Bearer {tok}"}


def _tier(**kw):
    return {"name": "Pool Hall", "specs": {}, "totalSeats": 3, "appBookableSeats": 3,
            "pricePerHour": 300, "tierType": "activity", "activityKind": "Pool", **kw}


@pytest.mark.asyncio
async def test_taxonomy_endpoint_and_tier_roundtrip_and_style_filter():
    cafe_id, h = await _owner_cafe()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        tree = (await c.get("/api/v1/cafes/taxonomy")).json()["data"]
        assert tree["version"] == 1 and any(a["key"] == "pool" for a in tree["activities"])
        assert "_rules" not in tree

        ok = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h, json=_tier(
            taxonomyKey="pool.english", attributes={"table_size": "8ft", "players_max": 4}))
        assert ok.status_code == 201, ok.text
        t = ok.json()["data"]["hardwareTier"]
        assert t["taxonomyKey"] == "pool.english" and t["attributes"] == {"table_size": "8ft", "players_max": 4}

        # bad key / bad attribute are rejected, never silently stored
        assert (await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h,
                             json=_tier(taxonomyKey="pool.french"))).status_code == 422
        assert (await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h,
                             json=_tier(taxonomyKey="pool", attributes={"table_size": "20ft"}))).status_code == 422

        # unclassified create is still fine, and unambiguous names get classified
        plain = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h, json=_tier(name="Bowling", activityKind="Bowling"))
        assert plain.status_code == 201
        assert plain.json()["data"]["hardwareTier"]["taxonomyKey"] == "bowling"

        # PATCH: change style keeps attrs only within the same activity
        upd = await c.patch(f"/api/v1/cafes/{cafe_id}/tiers/{t['id']}", headers=h, json={"taxonomyKey": "pool.american"})
        assert upd.status_code == 200, upd.text
        assert upd.json()["data"]["hardwareTier"]["attributes"] == {"table_size": "8ft", "players_max": 4}

        # discovery: style filter finds the café; another style does not
        hit = (await c.get("/api/v1/cafes", params={"style": "pool.american", "limit": 50})).json()["data"]
        assert str(cafe_id) in [str(i["id"]) for i in hit["items"]]
        mine = next(i for i in hit["items"] if str(i["id"]) == str(cafe_id))
        assert "pool.american" in mine["styles"]
        miss = (await c.get("/api/v1/cafes", params={"style": "go-karting.petrol", "limit": 50})).json()["data"]
        assert str(cafe_id) not in [str(i["id"]) for i in miss["items"]]
