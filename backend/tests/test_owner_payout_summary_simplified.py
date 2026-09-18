import pytest
from decimal import Decimal
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.platform_fee import PlatformFee
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_owner_payout_summary_returns_one_outstanding_number(db_session):
    from sqlalchemy import select
    from app.models.cafe import Cafe
    from app.models.user import User

    gamer = await _make_gamer(db_session, "summarysimple")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    db_session.add(PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    await db_session.commit()

    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalar_one()
    owner = (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalar_one()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/owner/payouts/summary", headers=auth_headers(owner))
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert "pendingSettlements" not in data["summary"]
        assert "completedSettlements" not in data["summary"]
        assert data["summary"]["outstandingAmount"] == 900.00
