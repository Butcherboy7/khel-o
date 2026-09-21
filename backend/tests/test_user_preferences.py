import pytest

from tests.conftest import create_test_user, auth_headers


@pytest.mark.asyncio
async def test_update_me_saves_non_gaming_preferences(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.patch(
        "/api/v1/auth/me",
        json={"preferences": {"activities": ["snooker", "bowling"]}},
        headers=auth_headers(user),
    )

    assert r.status_code == 200
    prefs = r.json()["data"]["user"]["preferences"]
    assert prefs["activities"] == ["snooker", "bowling"]


@pytest.mark.asyncio
async def test_update_me_saves_gaming_preferences_with_tier(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.patch(
        "/api/v1/auth/me",
        json={
            "preferences": {
                "activities": ["pc_gaming"],
                "preferredTier": "ultra",
                "favoriteGames": ["Valorant"],
            }
        },
        headers=auth_headers(user),
    )

    assert r.status_code == 200
    prefs = r.json()["data"]["user"]["preferences"]
    assert prefs["preferredTier"] == "ultra"
    assert prefs["favoriteGames"] == ["Valorant"]


@pytest.mark.asyncio
async def test_update_me_rejects_tier_without_gaming_activity(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.patch(
        "/api/v1/auth/me",
        json={"preferences": {"activities": ["snooker"], "preferredTier": "ultra"}},
        headers=auth_headers(user),
    )

    assert r.status_code == 422


@pytest.mark.asyncio
async def test_update_me_rejects_invalid_tier_value(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.patch(
        "/api/v1/auth/me",
        json={"preferences": {"activities": ["pc_gaming"], "preferredTier": "not_a_tier"}},
        headers=auth_headers(user),
    )

    assert r.status_code == 422


@pytest.mark.asyncio
async def test_preferences_persist_and_default_to_empty(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.get("/api/v1/auth/me", headers=auth_headers(user))
    assert r.status_code == 200
    assert r.json()["data"]["user"]["preferences"] == {}
