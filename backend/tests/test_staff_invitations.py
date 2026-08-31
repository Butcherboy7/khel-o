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


@pytest.mark.asyncio
async def test_accept_invitation_cannot_take_over_existing_account(async_client, db_session):
    """
    P0-A5: possessing an invitation token must never be enough to reset an
    existing account's password. Before the fix, accept-invitation looked up
    the invitation's email, and if an account already existed for it, silently
    overwrote that account's password_hash with whatever the token-holder sent
    — full account takeover for anyone who obtains a leaked invitation token
    addressed to a victim's email.
    """
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER, full_name="Owner Three")
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Takeover Test Arena",
        address_line1="789 Cyber Lane",
        city="Pune",
        state="Maharashtra",
        pincode="411001",
        phone_number="+917777777777",
        email="takeover@test.com",
        opening_time=time(9, 0),
        closing_time=time(23, 0),
        verification_status=VerificationStatus.VERIFIED,
        is_active=True
    )
    db_session.add(cafe)
    await db_session.commit()

    # Victim already has an account with their OWN password, unrelated to staff.
    victim = await create_test_user(
        db_session,
        email="victim@test.com",
        role=UserRole.GAMER,
        full_name="Victim Gamer",
        password="VictimsRealPassword1!",
    )
    await db_session.commit()
    victim_id = victim.id

    headers = auth_headers(owner)

    # Owner invites the victim's email to be staff (legitimate — owner has no
    # way of knowing that email already belongs to someone on the platform).
    invite_resp = await async_client.post(
        "/api/v1/owner/staff/invitations",
        headers=headers,
        json={
            "email": "victim@test.com",
            "fullName": "Victim Gamer",
            "phoneNumber": "+916666666666",
        },
    )
    assert invite_resp.status_code == 201
    token = invite_resp.json()["data"]["invitation"]["token"]

    # Attacker who merely obtained the token (email, URL history, logs...)
    # tries to "accept" it with a password of their own choosing.
    attack_resp = await async_client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": token, "password": "AttackerChosenPassword1!"},
    )

    # Must NOT succeed in resetting the victim's password / logging in as them.
    assert attack_resp.status_code in (401, 403), (
        f"Expected accept-invitation to refuse an unverified existing-account "
        f"claim, got {attack_resp.status_code}: {attack_resp.text}"
    )

    await db_session.refresh(victim, attribute_names=["password_hash"])
    from app.core.security import verify_password
    assert verify_password("VictimsRealPassword1!", victim.password_hash), (
        "Victim's original password must be untouched"
    )
    assert not verify_password("AttackerChosenPassword1!", victim.password_hash)


@pytest.mark.asyncio
async def test_accept_invitation_with_correct_existing_password_grants_staff_role(async_client, db_session):
    """The legitimate owner of an existing account CAN accept an invitation
    for their own email — by proving they know the account's real password."""
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER, full_name="Owner Four")
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Legit Accept Arena",
        address_line1="1 Cyber Lane",
        city="Pune",
        state="Maharashtra",
        pincode="411001",
        phone_number="+915555555555",
        email="legit@test.com",
        opening_time=time(9, 0),
        closing_time=time(23, 0),
        verification_status=VerificationStatus.VERIFIED,
        is_active=True
    )
    db_session.add(cafe)
    await db_session.commit()

    existing = await create_test_user(
        db_session,
        email="existing-staff@test.com",
        role=UserRole.GAMER,
        full_name="Existing Staff",
        password="MyRealPassword1!",
    )
    await db_session.commit()

    headers = auth_headers(owner)
    invite_resp = await async_client.post(
        "/api/v1/owner/staff/invitations",
        headers=headers,
        json={
            "email": "existing-staff@test.com",
            "fullName": "Existing Staff",
            "phoneNumber": "+914444444444",
        },
    )
    token = invite_resp.json()["data"]["invitation"]["token"]

    accept_resp = await async_client.post(
        "/api/v1/auth/accept-invitation",
        json={"token": token, "password": "MyRealPassword1!"},
    )
    assert accept_resp.status_code == 200, accept_resp.text
    assert accept_resp.json()["data"]["user"]["email"] == "existing-staff@test.com"
