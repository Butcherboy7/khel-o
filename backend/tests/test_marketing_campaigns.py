"""Campaigns the team creates: a short link that forwards with UTM tags, and
an admin list that shows only these campaigns with their numbers."""
import uuid
from urllib.parse import parse_qs, urlsplit

from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers

BODY = {
    "name": "KHELO Special Access",
    "slug": "special",
    "channel": "instagram_reel",
    "paid": True,
    "landingPath": "/?campaign=KHELOSPECIAL",
    "spendInr": 1000,
}


def _body(**over):
    return {**BODY, "slug": f"s-{uuid.uuid4().hex[:10]}", **over}


async def _admin(db_session):
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    await db_session.commit()
    return auth_headers(admin, is_admin=True)


async def test_create_and_short_link_forwards_with_tags(db_session, async_client):
    h = await _admin(db_session)
    body = _body()
    r = await async_client.post("/api/v1/admin/marketing-campaigns", headers=h, json=body)
    assert r.status_code == 201, r.text
    c = r.json()["data"]["campaign"]
    assert c["shortPath"] == f"/c/{body['slug']}"
    assert (c["utmSource"], c["utmMedium"]) == ("meta", "paid_social")

    r = await async_client.get(f"/api/v1/c/{body['slug'].upper()}")
    assert r.status_code == 200, r.text
    target = urlsplit(r.json()["data"]["target"])
    q = parse_qs(target.query)
    assert target.path == "/"
    assert q["campaign"] == ["KHELOSPECIAL"]
    assert q["utm_source"] == ["meta"] and q["utm_campaign"] == [body["slug"]]


async def test_organic_reel_is_tagged_instagram(db_session, async_client):
    h = await _admin(db_session)
    r = await async_client.post("/api/v1/admin/marketing-campaigns", headers=h, json=_body(paid=False))
    assert r.json()["data"]["campaign"]["utmSource"] == "instagram"


async def test_slug_unique_and_validated(db_session, async_client):
    h = await _admin(db_session)
    body = _body()
    assert (await async_client.post("/api/v1/admin/marketing-campaigns", headers=h, json=body)).status_code == 201
    assert (await async_client.post("/api/v1/admin/marketing-campaigns", headers=h, json=body)).status_code == 409
    bad = await async_client.post("/api/v1/admin/marketing-campaigns", headers=h, json={**BODY, "slug": "Has Space"})
    assert bad.status_code == 422
    ext = await async_client.post("/api/v1/admin/marketing-campaigns", headers=h, json=_body(landingPath="https://evil.com"))
    assert ext.status_code == 422


async def test_list_spend_and_archive(db_session, async_client):
    h = await _admin(db_session)
    body = _body()
    cid = (await async_client.post("/api/v1/admin/marketing-campaigns", headers=h, json=body)).json()["data"]["campaign"]["id"]
    r = await async_client.get("/api/v1/admin/marketing-campaigns", headers=h)
    assert r.status_code == 200, r.text
    row = next(c for c in r.json()["data"]["campaigns"] if c["id"] == cid)
    assert row["summary"]["visitors"] == 0 and row["spendInr"] == 1000

    r = await async_client.patch(f"/api/v1/admin/marketing-campaigns/{cid}", headers=h, json={"spendInr": 1500, "status": "archived"})
    assert r.status_code == 200 and r.json()["data"]["campaign"]["status"] == "archived"
    # An archived link still opens the page, just without tags.
    assert (await async_client.get(f"/api/v1/c/{body['slug']}")).json()["data"]["target"] == "/?campaign=KHELOSPECIAL"


async def test_admin_only(db_session, async_client):
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    r = await async_client.get("/api/v1/admin/marketing-campaigns", headers=auth_headers(gamer))
    assert r.status_code in (401, 403)
    assert (await async_client.get("/api/v1/c/nope")).status_code == 404


async def test_start_date_can_be_changed(db_session, async_client):
    h = await _admin(db_session)
    body = _body(startedOn="2026-10-05")
    cid = (await async_client.post("/api/v1/admin/marketing-campaigns", headers=h, json=body)).json()["data"]["campaign"]["id"]
    r = await async_client.patch(f"/api/v1/admin/marketing-campaigns/{cid}", headers=h, json={"startedOn": "2026-10-04"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["campaign"]["startedOn"] == "2026-10-04"


async def test_extra_tags_fold_meta_ad_visits_into_the_campaign(db_session, async_client):
    """A boosted reel's ad can arrive with Meta's own tags (ig / <ad id>);
    listing them on the campaign counts those visitors too."""
    from datetime import date, timedelta

    h = await _admin(db_session)
    body = _body()
    slug = body["slug"]
    ad_id = str(uuid.uuid4().int)[:17]
    cid = (await async_client.post("/api/v1/admin/marketing-campaigns", headers=h, json=body)).json()["data"]["campaign"]["id"]

    async def visit(sid, utm):
        r = await async_client.post(
            "/api/v1/analytics/events",
            json={"sessionId": sid, "eventType": "page_view", "metadata": {"path": "/", "utm": utm}},
        )
        assert r.status_code == 204, r.text

    await visit(f"s-{uuid.uuid4().hex[:8]}", {"s": "meta", "m": "paid_social", "c": slug, "t": "instagram_reel"})
    await visit(f"s-{uuid.uuid4().hex[:8]}", {"s": "ig", "m": "paid", "c": ad_id, "t": "123"})

    today = date.today()
    params = {"source": "meta", "campaign": slug, "from": (today - timedelta(days=1)).isoformat(), "to": (today + timedelta(days=1)).isoformat()}

    async def visitors():
        r = await async_client.get("/api/v1/admin/analytics/ad-campaigns/report", params=params, headers=h)
        assert r.status_code == 200, r.text
        return r.json()["data"]["totals"]["visitors"]

    assert await visitors() == 1

    r = await async_client.patch(
        f"/api/v1/admin/marketing-campaigns/{cid}", headers=h,
        json={"extraTags": [{"source": " ig ", "campaign": ad_id}, {"source": "ig", "campaign": ad_id}]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["campaign"]["extraTags"] == [{"source": "ig", "campaign": ad_id}]
    assert await visitors() == 2

    r = await async_client.patch(f"/api/v1/admin/marketing-campaigns/{cid}", headers=h, json={"extraTags": []})
    assert r.json()["data"]["campaign"]["extraTags"] == []
    assert await visitors() == 1
