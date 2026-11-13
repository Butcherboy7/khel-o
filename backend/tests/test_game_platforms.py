"""GTA 6 drops only on systems that run GTA 6 (PS5, PS5 Pro, Xbox Series X|S)."""
from uuid import uuid4

import pytest

from app.core.game_platforms import fit, rule_for
from app.database import AsyncSessionLocal
from app.models.hardware_tier import HardwareTier, PlatformType

from tests.test_drops import _cafe_with_rig, _client, _h, _rig_body

GTA = rule_for("GTA 6")


def test_rule_matches_names():
    for g in ("GTA 6", "gta6", "GTA VI", "Grand Theft Auto VI launch"):
        assert rule_for(g)["key"] == "gta6"
    assert rule_for("Tekken 8") is None and rule_for("GTA 5") is None


@pytest.mark.parametrize("platform,name,model,want", [
    ("playstation", "PS5 Pro", None, "yes"),
    ("playstation", "Console", "PS5", "yes"),
    ("xbox", "Xbox Series S", None, "yes"),
    ("xbox", "Xbox Series X", None, "yes"),
    ("playstation", "PS4", None, "no"),
    ("xbox", "Xbox One", None, "no"),
    ("nintendo", "Switch 2", None, "no"),
    ("pc", "Gaming PC", "RTX 4070", "no"),
    ("other", "VR", None, "no"),
    ("other", "Racing Simulator", None, "no"),
    ("playstation", "PSVR 2", None, "no"),
    ("playstation", "Console room", None, "check"),
])
def test_fit(platform, name, model, want):
    assert fit(GTA, platform, {}, name, model) == want


def test_activity_and_unknown_game():
    assert fit(GTA, "other", {}, "Snooker table", None, "activity") == "no"
    assert fit(None, "other", {}, "VR", None) == "any"


@pytest.mark.asyncio
async def test_gta6_drop_refused_on_vr_and_owner_list_says_what_runs():
    owner, cafe, ps5 = await _cafe_with_rig(total=3)
    async with AsyncSessionLocal() as db:
        vr = HardwareTier(id=uuid4(), cafe_id=cafe.id, name="VR", price_per_hour=200.0, total_seats=1,
                          app_bookable_seats=1, active_seats_count=1, is_active=True, platform=PlatformType.OTHER)
        db.add(vr)
        await db.commit()
    async with _client() as c:
        r = await c.post("/api/v1/owner/drops", json=_rig_body(cafe, vr, seats=1), headers=_h(owner))
        assert r.status_code == 400 and "can't run GTA 6" in r.text, r.text
        data = (await c.get("/api/v1/owner/drops", headers=_h(owner))).json()["data"]
        tiers = {t["name"]: t["runs"]["gta6"] for t in [c_ for c_ in data["cafes"] if c_["id"] == str(cafe.id)][0]["tiers"]}
        assert tiers == {"PS5": "yes", "VR": "no"}
        assert data["gameRules"][0]["runsOn"].startswith("PS5")
        # A game with no rule is not checked.
        body = _rig_body(cafe, vr, seats=1)
        body["game"] = "Beat Saber"
        assert (await c.post("/api/v1/owner/drops", json=body, headers=_h(owner))).status_code == 201
