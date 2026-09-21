"""Password-gated email change.

There is no email-verification system in this codebase (User has no
email_verified column and no verify endpoint exists), so this adds no bypass
-- it fills a gap. The password gate matters because the seeded @khel-o.com
addresses do not exist, which makes forgot-password useless for those
accounts: this IS their recovery path, on accounts that hold payout bank
details.

See docs/superpowers/specs/2026-09-10-explore-real-cafes-design.md §6.4
"""
from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers


async def test_email_change_requires_current_password(db_session, async_client):
    user = await create_test_user(
        db_session, email="old1@khel-o.com", role=UserRole.CAFE_OWNER, password="rightpass1"
    )
    await db_session.commit()

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=auth_headers(user), json={"email": "new1@real.com"}
    )
    assert resp.status_code >= 400, resp.text

    await db_session.refresh(user)
    assert user.email == "old1@khel-o.com"


async def test_email_change_rejects_wrong_password(db_session, async_client):
    user = await create_test_user(
        db_session, email="old2@khel-o.com", role=UserRole.CAFE_OWNER, password="rightpass1"
    )
    await db_session.commit()

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=auth_headers(user),
        json={"email": "new2@real.com", "currentPassword": "wrongpass"},
    )
    assert resp.status_code >= 400, resp.text

    await db_session.refresh(user)
    assert user.email == "old2@khel-o.com"


async def test_email_change_succeeds_with_password(db_session, async_client):
    user = await create_test_user(
        db_session, email="old3@khel-o.com", role=UserRole.CAFE_OWNER, password="rightpass1"
    )
    await db_session.commit()

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=auth_headers(user),
        json={"email": "New3@Real.com", "currentPassword": "rightpass1"},
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert user.email == "new3@real.com", "email should be normalised to lowercase"


async def test_email_change_rejects_duplicate(db_session, async_client):
    await create_test_user(db_session, email="taken@real.com")
    user = await create_test_user(
        db_session, email="old4@khel-o.com", role=UserRole.CAFE_OWNER, password="rightpass1"
    )
    await db_session.commit()

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=auth_headers(user),
        json={"email": "taken@real.com", "currentPassword": "rightpass1"},
    )
    assert resp.status_code >= 400, resp.text

    await db_session.refresh(user)
    assert user.email == "old4@khel-o.com"


async def test_profile_update_without_email_still_works(db_session, async_client):
    """Changing a name must not start demanding a password."""
    user = await create_test_user(db_session, email="old5@khel-o.com", password="rightpass1")
    await db_session.commit()

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=auth_headers(user), json={"fullName": "Renamed Owner"}
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert user.full_name == "Renamed Owner"


async def test_current_password_is_never_persisted(db_session, async_client):
    """current_password is an auth input, not a profile field -- it must be
    stripped before the update reaches the User model."""
    user = await create_test_user(
        db_session, email="old6@khel-o.com", role=UserRole.CAFE_OWNER, password="rightpass1"
    )
    await db_session.commit()

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=auth_headers(user),
        json={"email": "new6@real.com", "currentPassword": "rightpass1"},
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert not hasattr(user, "current_password")
    assert user.password_hash != "rightpass1"


async def test_google_only_email_change_requires_google_reauth(db_session, async_client):
    """Google-only accounts have no password_hash, so they must not be asked
    for one -- and must not be able to change email with nothing at all."""
    user = await create_test_user(
        db_session, email="gowner1@khel-o.com", role=UserRole.CAFE_OWNER,
        password=None, google_id="google-sub-1",
    )
    await db_session.commit()

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=auth_headers(user), json={"email": "new-g1@real.com"}
    )
    assert resp.status_code >= 400, resp.text
    assert resp.json()["error"]["code"] == "GOOGLE_REAUTH_REQUIRED"

    await db_session.refresh(user)
    assert user.email == "gowner1@khel-o.com"


async def test_google_only_email_change_rejects_mismatched_google_account(
    db_session, async_client, monkeypatch
):
    """A valid Google id_token for a *different* Google account must not
    authorize changing this user's email."""
    from app.services.auth_service import AuthService

    user = await create_test_user(
        db_session, email="gowner2@khel-o.com", role=UserRole.CAFE_OWNER,
        password=None, google_id="google-sub-2",
    )
    await db_session.commit()

    async def fake_verify(self, id_token):
        return {"sub": "some-other-google-sub", "aud": "test"}

    monkeypatch.setattr(AuthService, "verify_google_id_token", fake_verify)

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=auth_headers(user),
        json={"email": "new-g2@real.com", "googleIdToken": "fake-token"},
    )
    assert resp.status_code >= 400, resp.text
    assert resp.json()["error"]["code"] == "INVALID_GOOGLE_REAUTH"

    await db_session.refresh(user)
    assert user.email == "gowner2@khel-o.com"


async def test_google_only_email_change_succeeds_with_matching_google_reauth(
    db_session, async_client, monkeypatch
):
    from app.services.auth_service import AuthService

    user = await create_test_user(
        db_session, email="gowner3@khel-o.com", role=UserRole.CAFE_OWNER,
        password=None, google_id="google-sub-3",
    )
    await db_session.commit()

    async def fake_verify(self, id_token):
        return {"sub": "google-sub-3", "aud": "test"}

    monkeypatch.setattr(AuthService, "verify_google_id_token", fake_verify)

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=auth_headers(user),
        json={"email": "New-G3@Real.com", "googleIdToken": "fake-token"},
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(user)
    assert user.email == "new-g3@real.com"


async def test_deactivated_user_cannot_change_email(db_session, async_client):
    """Email is the login identity. A revoked owner holding an unexpired JWT
    must not be able to move their account to an address they control and keep
    a payout-bearing café past the revocation."""
    user = await create_test_user(
        db_session, email="revoked@khel-o.com", role=UserRole.CAFE_OWNER, password="rightpass1"
    )
    await db_session.commit()
    headers = auth_headers(user)

    user.is_active = False
    await db_session.commit()

    resp = await async_client.patch(
        "/api/v1/auth/me", headers=headers,
        json={"email": "attacker@evil.com", "currentPassword": "rightpass1"},
    )
    assert resp.status_code in (401, 403), resp.text

    await db_session.refresh(user)
    assert user.email == "revoked@khel-o.com"
