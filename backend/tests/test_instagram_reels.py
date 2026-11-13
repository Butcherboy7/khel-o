"""KHEL-O on Instagram: admin posts reel links; Explore and Community show them."""
import pytest
from sqlalchemy import select

from app.api.v1.instagram import clean_reel_url
from app.core.exceptions import BadRequestException
from app.database import AsyncSessionLocal
from app.models.instagram_reel import InstagramReel
from app.models.user import UserRole

from tests.test_drops import _client, _h, _user


async def _clear():
    async with AsyncSessionLocal() as db:
        for row in (await db.execute(select(InstagramReel))).scalars():
            await db.delete(row)
        await db.commit()


def test_clean_reel_url():
    assert clean_reel_url("https://www.instagram.com/reel/DQx1Abc_9/?igsh=abc123") == "https://www.instagram.com/reel/DQx1Abc_9/"
    assert clean_reel_url("https://instagram.com/reels/DQx1Abc") == "https://www.instagram.com/reel/DQx1Abc/"
    assert clean_reel_url("https://www.instagram.com/khelo.journey/reel/DQx1Abc/") == "https://www.instagram.com/reel/DQx1Abc/"
    assert clean_reel_url("https://m.instagram.com/p/CzYxW12/") == "https://www.instagram.com/p/CzYxW12/"
    for bad in ("https://evil.com/reel/DQx1Abc/", "https://www.instagram.com/khelo.journey/", "javascript:alert(1)", ""):
        with pytest.raises(BadRequestException):
            clean_reel_url(bad)


@pytest.mark.asyncio
async def test_admin_posts_reels_and_public_sees_them_newest_first():
    await _clear()
    admin = await _user(UserRole.ADMIN, phone="9876500401")
    async with _client() as c:
        h = _h(admin)
        assert (await c.get("/api/v1/instagram/reels")).json()["data"] == {"handle": "khelo.journey", "reels": []}
        a = await c.post("/api/v1/admin/instagram/reels", headers=h, json={
            "url": "https://www.instagram.com/reel/AAAAA1/?igsh=x", "title": "Day 1 of building KHEL-O", "tag": "Vlog"})
        assert a.status_code == 201, a.text
        b = (await c.post("/api/v1/admin/instagram/reels", headers=h, json={
            "url": "https://www.instagram.com/reel/BBBBB2/", "title": "GTA 6 drop is coming", "tag": "GTA 6",
            "coverUrl": "https://cdn.example.com/instagram/b.webp"})).json()["data"]
        # Same reel twice is refused; a non-Instagram link is refused.
        assert (await c.post("/api/v1/admin/instagram/reels", headers=h, json={"url": "https://instagram.com/reel/AAAAA1", "title": "Again"})).status_code == 400
        assert (await c.post("/api/v1/admin/instagram/reels", headers=h, json={"url": "https://youtube.com/watch?v=1", "title": "Nope"})).status_code == 400

        pub = (await c.get("/api/v1/instagram/reels")).json()["data"]["reels"]
        assert [r["title"] for r in pub] == ["GTA 6 drop is coming", "Day 1 of building KHEL-O"]
        assert pub[0]["coverUrl"] == "https://cdn.example.com/instagram/b.webp" and pub[1]["url"] == "https://www.instagram.com/reel/AAAAA1/"
        assert "hidden" not in pub[0]

        # Hide one: public no longer sees it, admin still does.
        assert (await c.patch(f"/api/v1/admin/instagram/reels/{b['id']}", headers=h, json={"hidden": True})).status_code == 200
        assert [r["title"] for r in (await c.get("/api/v1/instagram/reels")).json()["data"]["reels"]] == ["Day 1 of building KHEL-O"]
        assert len((await c.get("/api/v1/admin/instagram/reels", headers=h)).json()["data"]) == 2

        # Reorder, remove the cover, then delete.
        aid = a.json()["data"]["id"]
        await c.patch(f"/api/v1/admin/instagram/reels/{b['id']}", headers=h, json={"hidden": False, "coverUrl": None})
        assert (await c.put("/api/v1/admin/instagram/reels/order", headers=h, json={"ids": [aid, b["id"]]})).status_code == 200
        pub = (await c.get("/api/v1/instagram/reels")).json()["data"]["reels"]
        assert [r["id"] for r in pub] == [aid, b["id"]] and pub[1]["coverUrl"] is None
        assert (await c.delete(f"/api/v1/admin/instagram/reels/{aid}", headers=h)).status_code == 200

        gamer = await _user(UserRole.GAMER, phone="9876500402")
        assert (await c.get("/api/v1/admin/instagram/reels", headers=_h(gamer))).status_code in (401, 403)
        assert (await c.post("/api/v1/admin/instagram/reels", headers=_h(gamer), json={"url": "https://www.instagram.com/reel/CCCCC3/", "title": "x"})).status_code in (401, 403)
