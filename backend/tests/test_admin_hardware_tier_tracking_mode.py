import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.hardware_tier_unit import HardwareTierUnit, UnitStatus
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_admin_cafe_detail_shows_individual_tracking_mode(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "tracking_gamer_individual")
    booking, _ = await _make_booking_with_payment(db_session, gamer)

    db_session.add(HardwareTierUnit(id=uuid4(), tier_id=booking.hardware_tier_id, label="Table 1", status=UnitStatus.AVAILABLE))
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.get(f"/api/v1/admin/cafes/{booking.cafe_id}", headers=headers)
        assert res.status_code == 200, res.text
        tiers = res.json()["data"]["cafe"]["tiers"]
        matching = next(t for t in tiers if t["id"] == str(booking.hardware_tier_id))
        assert matching["trackingMode"] == "individual"


@pytest.mark.asyncio
async def test_admin_cafe_detail_shows_pooled_tracking_mode_by_default(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "tracking_gamer_pooled")
    booking, _ = await _make_booking_with_payment(db_session, gamer)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.get(f"/api/v1/admin/cafes/{booking.cafe_id}", headers=headers)
        assert res.status_code == 200, res.text
        tiers = res.json()["data"]["cafe"]["tiers"]
        matching = next(t for t in tiers if t["id"] == str(booking.hardware_tier_id))
        assert matching["trackingMode"] == "pooled"
