# backend/tests/test_payout_destination_staleness_integration.py
"""End-to-end integration test for the payout-destination staleness flow:
admin opens a payable, the owner changes their payout destination before
the admin submits, the admin's stale submission is rejected, and only a
refreshed + re-confirmed submission succeeds — with the resulting
CafePayout snapshot proving it recorded the NEW destination, not the one
the admin originally saw when they opened the payable."""
import uuid

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.owner_payout_account import OwnerPayoutAccount
from app.models.cafe_payout import CafePayout
from app.models.platform_fee import PlatformFee
from app.core.security import get_password_hash
from app.core.payout_encryption import encrypt_bank_account_number
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment


async def _make_admin(db_session) -> User:
    admin = User(
        id=uuid.uuid4(), email=f"stale_admin_{uuid.uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid.uuid4(), user_id=admin.id, role=UserRole.ADMIN))
    await db_session.commit()
    return admin


@pytest.mark.asyncio
async def test_stale_destination_is_rejected_then_succeeds_after_refresh(db_session):
    owner = User(
        id=uuid.uuid4(), email=f"stale_owner_{uuid.uuid4().hex[:8]}@test.com",
        full_name="Stale Flow Owner", password_hash=get_password_hash("correctpass123"),
        role=UserRole.CAFE_OWNER, is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Stale Flow Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=None, closing_time=None, bookable_stations=10,
    )
    db_session.add(cafe)
    db_session.add(OwnerPayoutAccount(
        id=uuid.uuid4(), owner_id=owner.id,
        bank_account_number_encrypted=encrypt_bank_account_number("9180200192847291"),
        bank_account_number_masked="••••7291", bank_ifsc="HDFC0000128",
        account_holder_name="Original Holder", version=1,
    ))
    await db_session.commit()

    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "stale_flow_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    booking.cafe_id = cafe.id
    db_session.add(PlatformFee(id=uuid.uuid4(), booking_id=booking.id, owner_settlement_amount=500.0))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_headers = auth_headers(admin, is_admin=True)
        owner_headers = auth_headers(owner, is_admin=False)

        # 1. Admin opens the payable and sees version 1.
        breakdown_res = await client.get(
            f"/api/v1/admin/cafe-payouts/{cafe.id}/breakdown", headers=admin_headers
        )
        assert breakdown_res.status_code == 200
        seen_version = breakdown_res.json()["data"]["destination"]["payoutAccountVersion"]
        assert seen_version == 1

        # 2. Before the admin submits, the owner changes their bank details —
        #    version bumps to 2.
        patch_res = await client.patch(
            "/api/v1/owner/payouts/destination",
            json={
                "currentPassword": "correctpass123",
                "bankAccountNumber": "1112223334445556",
                "bankIfsc": "ICIC0004567",
                "accountHolderName": "New Holder",
            },
            headers=owner_headers,
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["data"]["destination"]["version"] == 2

        # 3. Admin submits using the STALE version they originally saw — rejected.
        stale_res = await client.post(
            f"/api/v1/admin/cafe-payouts/{cafe.id}",
            json={
                "utrReference": "UTR-STALE-FLOW", "paymentMethod": "neft",
                "destinationType": "bank", "expectedPayoutAccountVersion": seen_version,
                "confirmedPaymentMade": True,
            },
            headers=admin_headers,
        )
        assert stale_res.status_code == 409
        assert stale_res.json()["error"]["code"] == "PAYOUT_DESTINATION_STALE"

        # Nothing was written.
        no_payout = (await db_session.execute(
            select(CafePayout).where(CafePayout.cafe_id == cafe.id)
        )).scalars().first()
        assert no_payout is None

        # 4. Frontend refreshes: admin re-fetches the breakdown and sees version 2
        #    with the new destination.
        refreshed_res = await client.get(
            f"/api/v1/admin/cafe-payouts/{cafe.id}/breakdown", headers=admin_headers
        )
        refreshed_destination = refreshed_res.json()["data"]["destination"]
        assert refreshed_destination["payoutAccountVersion"] == 2
        assert refreshed_destination["bankAccountNumberMasked"] == "••••5556"

        # 5. Admin explicitly re-confirms/reveals the new destination before retrying
        #    (mirrors the frontend's required "Show full details to pay" gate for
        #    a bank payout — see Task 10).
        reveal_res = await client.post(
            f"/api/v1/admin/cafe-payouts/{cafe.id}/reveal-destination", headers=admin_headers
        )
        assert reveal_res.status_code == 200
        assert reveal_res.json()["data"]["bankAccountNumber"] == "1112223334445556"
        assert reveal_res.json()["data"]["payoutAccountVersion"] == 2

        # 6. Admin retries with the fresh version — succeeds.
        success_res = await client.post(
            f"/api/v1/admin/cafe-payouts/{cafe.id}",
            json={
                "utrReference": "UTR-STALE-FLOW-RETRY", "paymentMethod": "neft",
                "destinationType": "bank", "expectedPayoutAccountVersion": 2,
                "confirmedPaymentMade": True,
            },
            headers=admin_headers,
        )
        assert success_res.status_code == 201

    # 7. The resulting CafePayout snapshot recorded the NEW destination — not
    #    the one the admin originally saw when they opened the payable.
    payout = (await db_session.execute(
        select(CafePayout).where(CafePayout.cafe_id == cafe.id)
    )).scalars().first()
    assert payout is not None
    assert payout.destination_payout_account_version == 2
    assert payout.destination_bank_account_masked == "••••5556"
    assert payout.destination_bank_ifsc == "ICIC0004567"
    assert payout.destination_account_holder_name == "New Holder"
