"""Café search: words can match in different fields, and a café name is
found even when the keyboard split it ("Rock star" -> "Rockstar")."""
import pytest

from tests.test_launch_invariants import _make_owner_and_cafe


async def _names(async_client, q):
    r = await async_client.get("/api/v1/cafes", params={"query": q, "limit": 50})
    assert r.status_code == 200, r.text
    return [c["name"] for c in r.json()["data"]["items"]]


@pytest.mark.asyncio
async def test_search_ignores_spaces_and_matches_each_word(db_session, async_client):
    await _make_owner_and_cafe(db_session, "Rockstarzq")
    await db_session.commit()
    name = "Invariant Cafe Rockstarzq"

    assert name in await _names(async_client, "rockstarzq")
    assert name in await _names(async_client, "Rock starzq")
    assert name in await _names(async_client, "rockstarzq bengaluru")
    assert name not in await _names(async_client, "rockstarzq mumbai")
