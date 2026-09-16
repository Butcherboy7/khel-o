import pytest

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_admin_can_hold_and_release_cafe_payouts(async_client, db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "holdtest")
    booking, _payment = await _make_booking_with_payment(db_session, gamer)
    headers = auth_headers(admin, is_admin=True)

    resp = await async_client.patch(
        f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/hold",
        json={"onHold": True, "reason": "Fraud review"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["payoutOnHold"] is True
    assert body["payoutHoldReason"] == "Fraud review"

    resp2 = await async_client.patch(
        f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/hold",
        json={"onHold": False, "reason": None},
        headers=headers,
    )
    assert resp2.json()["data"]["payoutOnHold"] is False
