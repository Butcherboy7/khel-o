"""GTA 6 launch: a player asks for a slot, the founder checks it with the café and taps Allow, which holds the seat
(a pending-payment booking) for the player. Off, or after the end date, it is normal booking."""
from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, update

from app.api.v1.gta6_requests import effective
from app.core.game_platforms import tier_runs_gta6
from app.database import AsyncSessionLocal
from app.models.booking import Booking, BookingStatus
from app.models.gta6_request import Gta6SlotRequest
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.platform_setting import PlatformSetting
from app.models.user import UserRole

from tests.test_drops import DAY, _cafe_with_rig, _client, _h, _user, fake_razorpay  # noqa: F401


async def _switch(on=True, until=None):
    async with AsyncSessionLocal() as db:
        s = (await db.execute(select(PlatformSetting).limit(1))).scalars().first()
        if s is None:
            s = PlatformSetting()
            db.add(s)
        s.gta6_requests_on, s.gta6_requests_until, s.gta6_whatsapp = on, until, "918142128389"
        await db.commit()


def _body(cafe, tier, start="19:00", hours=2):
    return {"cafeId": str(cafe.id), "hardwareTierId": str(tier.id), "sessionDate": str(DAY),
            "startTime": start, "durationHours": hours, "seatsCount": 1}


def test_gate_and_console_rules():
    class S:  # a settings row
        gta6_requests_on, gta6_requests_until = True, None
    assert effective(S()) is True
    S.gta6_requests_until = date(2026, 12, 3)
    assert effective(S(), date(2026, 12, 3)) is True and effective(S(), date(2026, 12, 4)) is False
    S.gta6_requests_on = False
    assert effective(S(), date(2026, 11, 20)) is False

    class T:
        def __init__(self, platform, name, tier_type=None):
            self.platform, self.name, self.model, self.specs, self.tier_type = platform, name, None, None, tier_type
    assert tier_runs_gta6(T(PlatformType.PC, "RTX 4070")) is False
    assert tier_runs_gta6(T(PlatformType.XBOX, "Xbox Series X")) is True
    assert tier_runs_gta6(T(PlatformType.PLAYSTATION, "PS5 Pro")) is True


@pytest.mark.asyncio
async def test_request_refused_when_off_or_not_a_gta6_console():
    owner, cafe, ps5 = await _cafe_with_rig(total=2)
    async with AsyncSessionLocal() as db:
        pc = HardwareTier(id=uuid4(), cafe_id=cafe.id, name="RTX 4070", price_per_hour=80.0, total_seats=4,
                          app_bookable_seats=4, active_seats_count=4, is_active=True, platform=PlatformType.PC)
        db.add(pc)
        await db.commit()
    u = await _user()
    async with _client() as c:
        await _switch(on=False)
        r = await c.post("/api/v1/gta6-requests", headers=_h(u), json=_body(cafe, ps5))
        assert r.status_code == 422 and "GTA6_REQUESTS_OFF" in r.text
        await _switch(on=True)
        r = await c.post("/api/v1/gta6-requests", headers=_h(u), json=_body(cafe, pc))
        assert r.status_code == 422 and "NOT_A_GTA6_CONSOLE" in r.text
        cfg = (await c.get("/api/v1/gta6-requests/config")).json()["data"]
        assert cfg == {"enabled": True, "whatsapp": "918142128389", "until": None}


@pytest.mark.asyncio
async def test_request_is_saved_once_and_only_the_player_or_admin_can_read_it():
    owner, cafe, ps5 = await _cafe_with_rig(total=2)
    await _switch()
    u, other, admin = await _user(), await _user(), await _user(UserRole.ADMIN)
    async with _client() as c:
        a = await c.post("/api/v1/gta6-requests", headers=_h(u), json=_body(cafe, ps5))
        b = await c.post("/api/v1/gta6-requests", headers=_h(u), json=_body(cafe, ps5))
        assert a.status_code == 201 and b.status_code == 201
        ra, rb = a.json()["data"]["request"], b.json()["data"]["request"]
        assert ra["id"] == rb["id"] and ra["status"] == "requested" and ra["reference"].startswith("GR-")
        assert (await c.get(f"/api/v1/gta6-requests/{ra['id']}", headers=_h(u))).status_code == 200
        assert (await c.get(f"/api/v1/gta6-requests/{ra['id']}", headers=_h(admin))).status_code == 200
        assert (await c.get(f"/api/v1/gta6-requests/{ra['id']}", headers=_h(other))).status_code == 403
        q = (await c.get("/api/v1/admin/gta6-requests", headers=_h(admin))).json()["data"]
        assert q["waiting"] >= 1 and any(i["id"] == ra["id"] and i["player"]["phone"] for i in q["items"])
        assert (await c.get("/api/v1/admin/gta6-requests", headers=_h(u))).status_code == 403


@pytest.mark.asyncio
async def test_allow_holds_the_seat_and_a_second_allow_for_the_last_console_fails():
    owner, cafe, ps5 = await _cafe_with_rig(total=1)       # one console only
    await _switch()
    p1, p2, admin = await _user(), await _user(), await _user(UserRole.ADMIN)
    async with _client() as c:
        r1 = (await c.post("/api/v1/gta6-requests", headers=_h(p1), json=_body(cafe, ps5))).json()["data"]["request"]
        r2 = (await c.post("/api/v1/gta6-requests", headers=_h(p2), json=_body(cafe, ps5))).json()["data"]["request"]
        ok = await c.post(f"/api/v1/admin/gta6-requests/{r1['id']}/allow", headers=_h(admin))
        assert ok.status_code == 200, ok.text
        got = ok.json()["data"]["request"]
        assert got["status"] == "approved" and got["bookingId"] and got["payBy"]
        async with AsyncSessionLocal() as db:
            b = await db.get(Booking, UUID(got["bookingId"]))
            assert b.status == BookingStatus.PENDING_PAYMENT and str(b.gamer_id) == str(p1.id) and b.game == "GTA 6"
        no = await c.post(f"/api/v1/admin/gta6-requests/{r2['id']}/allow", headers=_h(admin))
        assert no.status_code in (400, 409, 422)
        async with AsyncSessionLocal() as db:
            assert (await db.get(Gta6SlotRequest, UUID(r2["id"]))).booking_id is None
            held = (await db.execute(select(Booking).where(Booking.gamer_id == p2.id))).scalars().all()
            assert held == []
        # the player sees it, and an answered request cannot be answered twice
        mine = (await c.get(f"/api/v1/gta6-requests/{r1['id']}", headers=_h(p1))).json()["data"]["request"]
        assert mine["status"] == "approved"
        assert (await c.post(f"/api/v1/admin/gta6-requests/{r1['id']}/decline", headers=_h(admin), json={})).status_code == 422


@pytest.mark.asyncio
async def test_decline_suggest_and_sixty_minute_expiry():
    owner, cafe, ps5 = await _cafe_with_rig(total=2)
    await _switch()
    p, admin = await _user(), await _user(UserRole.ADMIN)
    async with _client() as c:
        a = (await c.post("/api/v1/gta6-requests", headers=_h(p), json=_body(cafe, ps5, "19:00"))).json()["data"]["request"]
        d = await c.post(f"/api/v1/admin/gta6-requests/{a['id']}/decline", headers=_h(admin), json={"note": "Full tonight"})
        assert d.json()["data"]["request"]["status"] == "declined" and d.json()["data"]["request"]["note"] == "Full tonight"
        b = (await c.post("/api/v1/gta6-requests", headers=_h(p), json=_body(cafe, ps5, "20:00"))).json()["data"]["request"]
        s = await c.post(f"/api/v1/admin/gta6-requests/{b['id']}/suggest", headers=_h(admin), json={"suggestion": "Sat 9 PM works"})
        assert s.json()["data"]["request"]["status"] == "declined" and s.json()["data"]["request"]["suggestion"] == "Sat 9 PM works"
        e = (await c.post("/api/v1/gta6-requests", headers=_h(p), json=_body(cafe, ps5, "21:00"))).json()["data"]["request"]
        async with AsyncSessionLocal() as db:
            await db.execute(update(Gta6SlotRequest).where(Gta6SlotRequest.id == UUID(e["id"]))
                             .values(created_at=datetime.now(timezone.utc) - timedelta(minutes=61)))
            await db.commit()
        got = (await c.get(f"/api/v1/gta6-requests/{e['id']}", headers=_h(p))).json()["data"]["request"]
        assert got["status"] == "expired"


@pytest.mark.asyncio
async def test_admin_can_set_the_switch_and_the_flags_are_on_the_cafe():
    owner, cafe, ps5 = await _cafe_with_rig(total=2)
    admin = await _user(UserRole.ADMIN)
    async with _client() as c:
        r = await c.put("/api/v1/admin/gta6-requests/settings", headers=_h(admin),
                        json={"on": True, "until": "2026-12-03", "whatsapp": "+91 81421 28389"})
        assert r.status_code == 200 and r.json()["data"]["whatsapp"] == "918142128389" and r.json()["data"]["until"] == "2026-12-03"
        cleared = await c.put("/api/v1/admin/gta6-requests/settings", headers=_h(admin), json={"until": None})
        assert cleared.json()["data"]["until"] is None
        detail = (await c.get(f"/api/v1/cafes/{cafe.id}")).json()["data"]
        cafe_json = detail.get("cafe", detail)
        assert cafe_json["hasGta6"] is True and cafe_json["tiers"][0]["runsGta6"] is True
        listing = (await c.get("/api/v1/cafes", params={"limit": 50, "query": cafe.name})).json()["data"]["items"]
        mine = [i for i in listing if i["id"] == str(cafe.id)]
        assert mine and mine[0]["hasGta6"] is True
