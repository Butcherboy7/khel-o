import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.security import create_access_token
from app.database import AsyncSessionLocal
from app.models.location import Location
from tests.conftest import create_test_user


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest_asyncio.fixture
async def auth_headers():
    async with AsyncSessionLocal() as db:
        user = await create_test_user(db)
        await db.commit()
        token = create_access_token(subject=str(user.id), role=user.role.value)
        return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_dedups_on_casing_and_whitespace(async_client: AsyncClient, auth_headers):
    """"Hyderabad" / "hyderabad" / " Hyderabad " for the same state must all
    resolve to one row, not three."""
    variants = ["Hyderabad", "hyderabad", "  Hyderabad  ", "HYDERABAD"]
    ids = set()
    for name in variants:
        res = await async_client.post(
            "/api/v1/locations", json={"name": name, "state": "Telangana"}, headers=auth_headers
        )
        assert res.status_code == 200, res.text
        ids.add(res.json()["data"]["id"])
    assert len(ids) == 1


@pytest.mark.asyncio
async def test_create_dedups_state_casing_too(async_client: AsyncClient, auth_headers):
    """Same city, same state typed with different casing ("Telangana" vs
    "telangana") must not create two rows — validate_state canonicalizes
    state before the dedup check runs."""
    res1 = await async_client.post(
        "/api/v1/locations", json={"name": "Warangal", "state": "telangana"}, headers=auth_headers
    )
    res2 = await async_client.post(
        "/api/v1/locations", json={"name": "Warangal", "state": "TELANGANA"}, headers=auth_headers
    )
    assert res1.status_code == 200 and res2.status_code == 200
    assert res1.json()["data"]["id"] == res2.json()["data"]["id"]
    assert res1.json()["data"]["state"] == "Telangana"


@pytest.mark.asyncio
async def test_concurrent_creates_do_not_duplicate(async_client: AsyncClient, auth_headers):
    """Ten concurrent requests for the same never-before-seen city must
    collapse to exactly one row (race handled via unique constraint +
    IntegrityError fallback, not a pre-check that can itself race)."""
    async def create():
        return await async_client.post(
            "/api/v1/locations", json={"name": "Nizamabad", "state": "Telangana"}, headers=auth_headers
        )

    results = await asyncio.gather(*[create() for _ in range(10)])
    assert all(r.status_code == 200 for r in results)
    ids = {r.json()["data"]["id"] for r in results}
    assert len(ids) == 1

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(Location).where(Location.name_norm == "nizamabad", Location.state == "Telangana")
            )
        ).scalars().all()
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_state_is_required_and_validated(async_client: AsyncClient, auth_headers):
    missing_state = await async_client.post(
        "/api/v1/locations", json={"name": "Somewhere"}, headers=auth_headers
    )
    assert missing_state.status_code == 422

    garbage_state = await async_client.post(
        "/api/v1/locations", json={"name": "Somewhere", "state": "Narnia"}, headers=auth_headers
    )
    assert garbage_state.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_name", ["", "1", "12345", "12 345", "   "])
async def test_garbage_names_rejected(async_client: AsyncClient, auth_headers, bad_name):
    res = await async_client.post(
        "/api/v1/locations", json={"name": bad_name, "state": "Telangana"}, headers=auth_headers
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_search_is_case_insensitive_and_ranks_prefix_first(async_client: AsyncClient, auth_headers):
    await async_client.post("/api/v1/locations", json={"name": "Kamareddy", "state": "Telangana"}, headers=auth_headers)
    await async_client.post("/api/v1/locations", json={"name": "Vikarabad", "state": "Telangana"}, headers=auth_headers)

    res = await async_client.get("/api/v1/locations/search", params={"q": "kama"}, headers=auth_headers)
    assert res.status_code == 200
    names = [r["name"] for r in res.json()["data"]]
    assert "Kamareddy" in names
    assert names[0] == "Kamareddy"  # prefix match ranked first, not just present

    res_upper = await async_client.get("/api/v1/locations/search", params={"q": "KAMA"}, headers=auth_headers)
    assert [r["id"] for r in res_upper.json()["data"]] == [r["id"] for r in res.json()["data"]]


@pytest.mark.asyncio
async def test_create_does_not_overwrite_existing_location_fields(async_client: AsyncClient, auth_headers):
    """Getting an existing location via a create call with different
    district/pincode must not mutate the stored row — the first values
    written stay authoritative."""
    first = await async_client.post(
        "/api/v1/locations",
        json={"name": "Karimnagar", "state": "Telangana", "district": "Karimnagar", "pincode": "505001"},
        headers=auth_headers,
    )
    assert first.status_code == 200
    loc_id = first.json()["data"]["id"]

    second = await async_client.post(
        "/api/v1/locations",
        json={"name": "karimnagar", "state": "Telangana", "district": "Some Other District", "pincode": "999999"},
        headers=auth_headers,
    )
    assert second.status_code == 200
    assert second.json()["data"]["id"] == loc_id
    assert second.json()["data"]["district"] == "Karimnagar"
    assert second.json()["data"]["pincode"] == "505001"


@pytest.mark.asyncio
async def test_district_and_pincode_are_optional(async_client: AsyncClient, auth_headers):
    res = await async_client.post(
        "/api/v1/locations", json={"name": "Adilabad", "state": "Telangana"}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["data"]["district"] is None
    assert res.json()["data"]["pincode"] is None


@pytest.mark.asyncio
async def test_search_with_state_only_no_q_returns_states_rows(async_client: AsyncClient, auth_headers):
    """Task 3's "popular cities on focus" prefetch: q is now optional. A
    request with only `state` (no `q` at all) must not 422 — it should
    return that state's rows, ordered by name, instead of requiring a
    search term first."""
    await async_client.post("/api/v1/locations", json={"name": "Nizamabad", "state": "Telangana"}, headers=auth_headers)
    await async_client.post("/api/v1/locations", json={"name": "Adilabad", "state": "Telangana"}, headers=auth_headers)
    await async_client.post("/api/v1/locations", json={"name": "Warangal", "state": "Telangana"}, headers=auth_headers)

    res = await async_client.get("/api/v1/locations/search", params={"state": "Telangana"}, headers=auth_headers)
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert len(data) >= 3
    names = [r["name"] for r in data]
    assert names == sorted(names)  # ordered by name when there's no search term
    assert all(r["state"] == "Telangana" for r in data)


@pytest.mark.asyncio
async def test_search_with_empty_q_and_state_behaves_like_omitted_q(async_client: AsyncClient, auth_headers):
    """An explicit empty-string q (what the frontend's fetch actually sends
    is an omitted q, but an empty string must be tolerated too, not 422)
    combined with state must behave the same as omitting q entirely."""
    await async_client.post("/api/v1/locations", json={"name": "Karimnagar", "state": "Telangana"}, headers=auth_headers)

    res = await async_client.get("/api/v1/locations/search", params={"q": "", "state": "Telangana"}, headers=auth_headers)
    assert res.status_code == 200, res.text
    assert any(r["name"] == "Karimnagar" for r in res.json()["data"])


@pytest.mark.asyncio
async def test_search_with_no_q_and_no_state_returns_empty(async_client: AsyncClient, auth_headers):
    """Unscoped, term-less search stays a deliberate no-op (existing
    behaviour, unchanged by making q optional) — it must not dump the
    entire locations table."""
    res = await async_client.get("/api/v1/locations/search", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["data"] == []


@pytest.mark.asyncio
async def test_search_state_only_still_respects_limit(async_client: AsyncClient, auth_headers):
    for name in ["Nalgonda", "Suryapet", "Khammam", "Mahbubnagar", "Siddipet"]:
        await async_client.post("/api/v1/locations", json={"name": name, "state": "Telangana"}, headers=auth_headers)

    res = await async_client.get(
        "/api/v1/locations/search", params={"state": "Telangana", "limit": 2}, headers=auth_headers
    )
    assert res.status_code == 200
    assert len(res.json()["data"]) == 2
