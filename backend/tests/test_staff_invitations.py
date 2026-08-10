import pytest
import pytest_asyncio
from uuid import uuid4
from datetime import time
from app.models.user import UserRole
from app.models.cafe import Cafe, VerificationStatus
from tests.conftest import create_test_user, auth_headers

@pytest.mark.asyncio
async def test_staff_invitation_full_flow(async_client, db_session):
    # 1. Create owner + cafe
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER, full_name="Cafe Owner")
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Test Cyber Arena",
        address_line1="123 Gaming Street",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919999999999",
        email="arena@test.com",
        opening_time=time(9, 0),
        closing_time=time(23, 0),
        verification_status=VerificationStatus.VERIFIED,
        is_active=True
    )
    db_session.add(cafe)
    await db_session.commit()

    headers = auth_headers(owner)

    # 2. Create staff invitation
    invite_resp = await async_client.post(
        "/api/v1/owner/staff/invitations",
        headers=headers,
        json={
            "email": "newstaff@test.com",
            "fullName": "Alex Staff",
            "phoneNumber": "+918888888888"
        }
    )
    assert invite_resp.status_code == 201
    data = invite_resp.json()["data"]["invitation"]
    assert data["email"] == "newstaff@test.com"
    assert data["fullName"] == "Alex Staff"
    assert data["status"] == "pending"
    token = data["token"]
    assert token is not None
    assert "/accept-invitation?token=" in data["inviteUrl"]

    # 3. List invitations
    list_resp = await async_client.get("/api/v1/owner/staff/invitations", headers=headers)
    assert list_resp.status_code == 200
    invitations = list_resp.json()["data"]["invitations"]
    assert len(invitations) >= 1
    assert any(inv["token"] == token for inv in invitations)

    # 4. Get public invitation details
    details_resp = await async_client.get(f"/api/v1/auth/invitation?token={token}")
    assert details_resp.status_code == 200
    inv_details = details_resp.json()["data"]["invitation"]
    assert inv_details["email"] == "newstaff@test.com"
    assert inv_details["venueName"] == "Test Cyber Arena"

    # 5. Accept invitation (creates new user)
    accept_resp = await async_client.post(
        "/api/v1/auth/accept-invitation",
        json={
            "token": token,
            "password": "SecurePassword123!"
        }
    )
    assert accept_resp.status_code == 200
    acc_data = accept_resp.json()["data"]
    assert "accessToken" in acc_data
    assert "refreshToken" in acc_data
    assert acc_data["user"]["email"] == "newstaff@test.com"

    # 6. Verify invitation is now accepted and cannot be reused
    reuse_resp = await async_client.get(f"/api/v1/auth/invitation?token={token}")
    assert reuse_resp.status_code == 400

@pytest.mark.asyncio
async def test_cancel_staff_invitation(async_client, db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER, full_name="Owner Two")
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Cancel Arena",
        address_line1="456 Cyber Road",
        city="Mumbai",
        state="Maharashtra",
        pincode="400001",
        phone_number="+918888888888",
        email="cancel@test.com",
        opening_time=time(9, 0),
        closing_time=time(23, 0),
        verification_status=VerificationStatus.VERIFIED,
        is_active=True
    )
    db_session.add(cafe)
    await db_session.commit()

    headers = auth_headers(owner)

    # Create invitation
    invite_resp = await async_client.post(
        "/api/v1/owner/staff/invitations",
        headers=headers,
        json={
            "email": "cancelstaff@test.com",
            "fullName": "Cancel Staff"
        }
    )
    inv_id = invite_resp.json()["data"]["invitation"]["id"]

    # Cancel invitation
    cancel_resp = await async_client.delete(
        f"/api/v1/owner/staff/invitations/{inv_id}",
        headers=headers
    )
    assert cancel_resp.status_code == 200

    # Verify status is cancelled
    list_resp = await async_client.get("/api/v1/owner/staff/invitations", headers=headers)
    cancelled_inv = next(i for i in list_resp.json()["data"]["invitations"] if i["id"] == inv_id)
    assert cancelled_inv["status"] == "cancelled"
