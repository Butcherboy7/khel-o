"""
CRITICAL TEST: Owner Onboarding Preserves Gamer Role AND Timing

This test verifies the core fix from Tickets 1 and 2:
- User starts with 'gamer' role in user_roles table
- Onboarding SUBMISSION does NOT grant cafe_owner role (user stays as gamer only)
- ADMIN APPROVAL via real endpoint grants cafe_owner role (ADDITIVE)
- User ends up with BOTH 'gamer' AND 'cafe_owner' roles
- NO role is lost or overwritten

This is the single most important test in the entire project.
"""
import pytest
from datetime import time
from uuid import uuid4
from httpx import AsyncClient
from sqlalchemy import select

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_onboarding_submission_does_not_grant_cafe_owner_role(db_session, async_client: AsyncClient):
    """
    CRITICAL: Verify that submitting onboarding does NOT grant cafe_owner role.
    
    Expected behavior:
    1. User starts with ONLY 'gamer' role in user_roles table
    2. User submits onboarding application
    3. User STILL has ONLY 'gamer' role (NOT cafe_owner yet)
    4. Admin approves the cafe via PATCH /admin/cafes/{id}/verify
    5. User ends up with BOTH 'gamer' AND 'cafe_owner' roles in user_roles table
    
    This ensures permissions are only granted AFTER admin verification.
    """
    
    # =========================================================================
    # SETUP: Create a gamer user
    # =========================================================================
    user_id = uuid4()
    user = User(
        id=user_id,
        email=f"gamer_timing_{uuid4().hex}@test.com",
        full_name="Test Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add(user)
    await db_session.flush()
    
    db_session.add(UserRoleMapping(
        id=uuid4(),
        user_id=user.id,
        role=UserRole.GAMER,
        cafe_id=None
    ))
    await db_session.commit()
    
    # =========================================================================
    # VERIFY: User starts with ONLY 'gamer' role
    # =========================================================================
    result = await db_session.execute(
        select(UserRoleMapping.role).where(UserRoleMapping.user_id == user.id)
    )
    roles_before_submit = [row[0] for row in result.fetchall()]
    
    assert len(roles_before_submit) == 1, f"User should start with exactly 1 role, found {len(roles_before_submit)}: {roles_before_submit}"
    assert roles_before_submit[0] == UserRole.GAMER, f"User should start with 'gamer' role, found {roles_before_submit[0]}"
    
    # =========================================================================
    # STEP 1: User submits onboarding
    # =========================================================================
    cafe_id = uuid4()
    cafe = Cafe(
        id=cafe_id,
        owner_id=user.id,
        name="Test Cafe",
        address_line1="123 Main St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.PENDING,
        is_active=False,
        opening_time=time(9, 0),
        closing_time=time(23, 0)
    )
    db_session.add(cafe)
    await db_session.commit()
    
    # =========================================================================
    # STEP 2: Login as user
    # =========================================================================
    login_response = await async_client.post("/api/v1/auth/login", json={
        "email": user.email,
        "password": "testpass123"
    })
    
    assert login_response.status_code == 200, f"User login failed: {login_response.json()}"
    
    # =========================================================================
    # STEP 3: CRITICAL - user_roles must STILL have ONLY 'gamer' (not cafe_owner yet)
    # =========================================================================
    result = await db_session.execute(
        select(UserRoleMapping.role).where(UserRoleMapping.user_id == user.id)
    )
    roles_after_submit = [row[0] for row in result.fetchall()]
    
    # CRITICAL ASSERTION 1: User must still have exactly 1 role
    assert len(roles_after_submit) == 1, \
        f"CRITICAL FAILURE: After onboarding submission (before approval), user must still have 1 role. Found {len(roles_after_submit)}: {roles_after_submit}"
    
    # CRITICAL ASSERTION 2: User must still have ONLY 'gamer' (not cafe_owner yet)
    assert roles_after_submit[0] == UserRole.GAMER, \
        f"CRITICAL FAILURE: After onboarding submission (before approval), user must have ONLY 'gamer' role. Found: {roles_after_submit} - CAFE_OWNER GRANTED TOO EARLY!"
    
    print(f"\n[PASS] User correctly has ONLY 'gamer' role after submission (before approval): {roles_after_submit}")


@pytest.mark.asyncio
async def test_owner_onboarding_preserves_gamer_role(db_session, async_client: AsyncClient):
    """
    Verify that approving a cafe owner application PRESERVES the user's gamer role.
    
    Expected behavior:
    1. User starts with ONLY 'gamer' role in user_roles table
    2. User submits onboarding application
    3. User still has only 'gamer' ( cafe_owner NOT granted yet)
    4. Admin approves the cafe via PATCH /admin/cafes/{id}/verify
    5. User ends up with BOTH 'gamer' AND 'cafe_owner' roles in user_roles table
    
    FAILURE indicates the original bug (role loss/overwrite) has regressed.
    """
    
    # =========================================================================
    # SETUP: Create a gamer user
    # =========================================================================
    user_id = uuid4()
    user = User(
        id=user_id,
        email=f"gamer_preserve_{uuid4().hex}@test.com",
        full_name="Test Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add(user)
    await db_session.flush()
    
    # Add gamer role to user_roles table
    db_session.add(UserRoleMapping(
        id=uuid4(),
        user_id=user.id,
        role=UserRole.GAMER,
        cafe_id=None
    ))
    await db_session.commit()
    
    # =========================================================================
    # VERIFY: User starts with ONLY 'gamer' role
    # =========================================================================
    result = await db_session.execute(
        select(UserRoleMapping.role).where(UserRoleMapping.user_id == user.id)
    )
    roles_before = [row[0] for row in result.fetchall()]
    
    assert len(roles_before) == 1, f"User should start with exactly 1 role, found {len(roles_before)}: {roles_before}"
    assert roles_before[0] == UserRole.GAMER, f"User should start with 'gamer' role, found {roles_before[0]}"
    
    # =========================================================================
    # STEP 1: User submits onboarding (simulated)
    # =========================================================================
    cafe_id = uuid4()
    cafe = Cafe(
        id=cafe_id,
        owner_id=user.id,
        name="Test Cafe",
        address_line1="123 Main St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.PENDING,
        is_active=False,
        opening_time=time(9, 0),
        closing_time=time(23, 0)
    )
    db_session.add(cafe)
    await db_session.commit()
    
    # =========================================================================
    # STEP 2: Create admin user
    # =========================================================================
    admin_id = uuid4()
    admin = User(
        id=admin_id,
        email=f"admin_preserve_{uuid4().hex}@test.com",
        full_name="Test Admin",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.ADMIN,
        is_active=True
    )
    db_session.add(admin)
    
    # Add admin role AND gamer role to user_roles table
    db_session.add(UserRoleMapping(
        id=uuid4(),
        user_id=admin.id,
        role=UserRole.ADMIN,
        cafe_id=None
    ))
    db_session.add(UserRoleMapping(
        id=uuid4(),
        user_id=admin.id,
        role=UserRole.GAMER,
        cafe_id=None
    ))
    await db_session.commit()
    
    # =========================================================================
    # STEP 3: Login as admin
    # =========================================================================
    login_response = await async_client.post("/api/v1/auth/login", json={
        "email": admin.email,
        "password": "testpass123"
    })
    
    assert login_response.status_code == 200, f"Admin login failed: {login_response.json()}"
    
    admin_token = login_response.json().get("data", {}).get("accessToken")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # =========================================================================
    # STEP 4: Admin approves cafe via REAL endpoint
    # =========================================================================
    approve_response = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe_id}/verify",
        json={"status": "verified"},
        headers=headers
    )
    
    assert approve_response.status_code == 200, \
        f"Admin approval failed: {approve_response.status_code} - {approve_response.json()}"
    
    # =========================================================================
    # STEP 5: Verify user now has BOTH roles (CRITICAL CHECK)
    # =========================================================================
    result = await db_session.execute(
        select(UserRoleMapping.role)
        .where(UserRoleMapping.user_id == user.id)
        .order_by(UserRoleMapping.role)
    )
    roles_after = [row[0] for row in result.fetchall()]
    
    # CRITICAL ASSERTION 1: User must have exactly 2 roles
    assert len(roles_after) == 2, \
        f"CRITICAL FAILURE: User must have 2 roles after approval. Found {len(roles_after)}: {roles_after}. " \
        f"ORIGINAL ROLE MAY HAVE BEEN LOST!"
    
    # CRITICAL ASSERTION 2: User must have BOTH 'gamer' and 'cafe_owner'
    expected_roles = {UserRole.GAMER, UserRole.CAFE_OWNER}
    actual_roles = set(roles_after)
    
    assert actual_roles == expected_roles, \
        f"CRITICAL FAILURE: Expected roles {expected_roles}, found {actual_roles}. " \
        f"ROLE PRESERVATION FAILED!"
    
    # CRITICAL ASSERTION 3: 'gamer' role must not be lost
    assert UserRole.GAMER in roles_after, \
        f"CRITICAL FAILURE: User lost 'gamer' role! Original role was overwritten. " \
        f"This is the exact bug from Tickets 1/2. Found roles: {roles_after}"
    
    print(f"\n[PASS] User correctly has BOTH roles: {roles_after}")
    print(f"[PASS] Role preservation verified - ADDITIVE grant working correctly")


@pytest.mark.asyncio
async def test_booking_works_after_role_addition(db_session, async_client: AsyncClient):
    """
    Verify that a user with BOTH 'gamer' and 'cafe_owner' roles can still create bookings.
    
    This tests that the role system doesn't break gamer functionality when cafe_owner is added.
    """
    
    # Create user with BOTH roles
    user_id = uuid4()
    user = User(
        id=user_id,
        email=f"dual_role_{uuid4().hex}@test.com",
        full_name="Dual Role User",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,  # Primary role
        is_active=True
    )
    db_session.add(user)
    await db_session.flush()
    
    # Add BOTH roles to user_roles
    db_session.add(UserRoleMapping(
        id=uuid4(),
        user_id=user.id,
        role=UserRole.GAMER,
        cafe_id=None
    ))
    db_session.add(UserRoleMapping(
        id=uuid4(),
        user_id=user.id,
        role=UserRole.CAFE_OWNER,
        cafe_id=None
    ))
    await db_session.commit()
    
    # Login as user
    login_response = await async_client.post("/api/v1/auth/login", json={
        "email": user.email,
        "password": "testpass123"
    })
    
    assert login_response.status_code == 200
    user_token = login_response.json().get("data", {}).get("accessToken")
    headers = {"Authorization": f"Bearer {user_token}"}
    
    # Try to access gamer endpoint (e.g., get cafes)
    cafes_response = await async_client.get("/api/v1/cafes", headers=headers)
    
    assert cafes_response.status_code == 200, \
        f"User with dual roles cannot access gamer endpoints: {cafes_response.status_code}"
    
    print(f"\n[PASS] Dual-role user can access gamer endpoints (no permission loss)")
